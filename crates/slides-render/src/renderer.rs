//! The render host: a browser kept running, and the calls that draw decks with it.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

use slides_core::Deck;
use slides_core::lint::Measures;
use tokio::sync::mpsc::UnboundedSender;

use crate::browser::find_browser;
use crate::bundle::Page;
use crate::error::{Error, Result};
use crate::jobs::{Reply, Request};
use crate::launch::{Config, NO_SANDBOX, sandbox_for};
use crate::media::{Media, NoMedia};
use crate::serve::Shared;
use crate::types::{HtmlFile, HtmlOptions, Pdf, PdfOptions, Picture, Png, PngOptions};
use crate::worker::{self, Job};

/// How a render host is set up.
#[derive(Clone)]
pub struct Options {
    /// The browser's program. Found when left out (see [`find_browser`]).
    pub browser: Option<PathBuf>,
    /// Where the pictures a deck names are read from.
    pub media: Arc<dyn Media>,
    /// Where the browser keeps its profile, before the usual places. A folder that another user owns or can enter, or
    /// that is a link, is passed over for the next place (see [`crate::private`]).
    pub profiles: Option<PathBuf>,
    /// Shut the browser down after this long without a call; it starts again on the next. Never, when `None`.
    pub idle: Option<Duration>,
    /// How long one call to the browser may take.
    pub timeout: Duration,
    /// The page to draw with. The one built into the program when left out.
    pub page: Option<Page>,
    /// The bibliography (BibTeX: the text of the `.bib` files beside the deck) that citations are written from; none
    /// draws a citation as its keys. See [`crate::references::in_folder`].
    pub references: Option<String>,
    /// `Some(true)` runs the browser without its sandbox and `Some(false)` insists on it; `None` (the usual) leaves
    /// it to the setting `SLIDES_RENDER_NO_SANDBOX=1`, which switches it off. The sandbox is what keeps a hostile
    /// picture in a deck from taking over the browser: it is never dropped for any other reason.
    pub no_sandbox: Option<bool>,
}

impl Default for Options {
    fn default() -> Options {
        Options {
            browser: None,
            media: Arc::new(NoMedia),
            profiles: None,
            idle: None,
            timeout: Duration::from_secs(60),
            page: None,
            references: None,
            no_sandbox: None,
        }
    }
}

/// A browser kept running to draw decks with. It is safe to use from many threads; calls are done one after another.
pub struct Renderer {
    jobs: Option<UnboundedSender<Job>>,
    thread: Option<JoinHandle<()>>,
    shared: Arc<Shared>,
    browser: PathBuf,
}

fn text_of(deck: &Deck) -> Result<Arc<str>> {
    Ok(Arc::from(slides_core::canonical::write(deck)?))
}

impl Renderer {
    /// Starts a browser found on this machine, with no pictures for decks to name.
    pub fn launch() -> Result<Renderer> {
        Renderer::launch_with(Options::default())
    }

    /// Starts a browser as `options` say, and waits until it is ready to draw.
    pub fn launch_with(options: Options) -> Result<Renderer> {
        let browser = match options.browser {
            Some(path) => path,
            None => find_browser()?,
        };
        let page = options.page.or_else(Page::locate).ok_or(Error::NoPage)?;
        // Decided before anything is started, so that a person who runs as the administrator hears why at once.
        let sandbox = sandbox_for(
            options.no_sandbox,
            std::env::var_os(NO_SANDBOX).as_deref(),
            crate::private::running_as_root(),
        )
        .map_err(Error::Launch)?;
        let shared = Arc::new(Shared::new(
            options.media,
            options.references.map(Arc::from),
        ));
        let config = Config {
            browser: browser.clone(),
            page,
            profiles: options.profiles,
            timeout: options.timeout,
            sandbox,
        };
        let (jobs, thread) = worker::spawn(config, Arc::clone(&shared), options.idle)?;
        Ok(Renderer {
            jobs: Some(jobs),
            thread: Some(thread),
            shared,
            browser,
        })
    }

    /// The browser's program.
    pub fn browser(&self) -> &Path {
        &self.browser
    }

    /// Whether the host can still be asked to draw. It cannot once its driver thread has stopped.
    pub fn is_alive(&self) -> bool {
        self.jobs.is_some() && self.thread.as_ref().is_some_and(|t| !t.is_finished())
    }

    /// Changes the bibliography citations are written from (BibTeX text; `None` for none, and they are drawn as
    /// their keys). It takes effect with the next call.
    pub fn set_references(&self, bibtex: Option<String>) {
        self.shared.set_references(bibtex.map(Arc::from));
    }

    /// The bibliography citations are written from now.
    pub fn references(&self) -> Option<Arc<str>> {
        self.shared.references()
    }

    /// Changes where the pictures a deck names are read from.
    pub fn set_media(&self, media: Arc<dyn Media>) {
        self.shared.set_media(media);
    }

    fn call(&self, request: Request) -> Result<Reply> {
        worker::call(self.jobs.as_ref().ok_or(Error::Closed)?, request)
    }

    /// One slide (`slide` counts from 0) at a step, as a PNG. The step is the slide's last state when left out.
    /// `scale` is pixels to the slide unit (1, 2 and 4 are the usual ones).
    pub fn render_slide(
        &self,
        deck: &Deck,
        slide: usize,
        step: Option<u32>,
        scale: f32,
    ) -> Result<Png> {
        match self.call(Request::Slide {
            deck: text_of(deck)?,
            slide,
            step,
            scale,
        })? {
            Reply::Png(png) => Ok(png),
            _ => Err(Error::Closed),
        }
    }

    /// Every slide of the deck as a labelled thumbnail in one PNG. The columns are chosen from the number of slides when left out.
    pub fn render_grid(&self, deck: &Deck, columns: Option<usize>) -> Result<Png> {
        match self.call(Request::Grid {
            deck: text_of(deck)?,
            columns,
            width: None,
        })? {
            Reply::Png(png) => Ok(png),
            _ => Err(Error::Closed),
        }
    }

    /// How big the words of every element come out, laid out by the real renderer: what lint needs to tell text that fits from text that does not.
    pub fn measure(&self, deck: &Deck) -> Result<Measures> {
        match self.call(Request::Measure {
            deck: text_of(deck)?,
        })? {
            Reply::Measures(measures) => Ok(measures),
            _ => Err(Error::Closed),
        }
    }

    /// The deck as a PDF: a page to a slide at the deck's size, with the text left as text.
    pub fn pdf(&self, deck: &Deck, options: &PdfOptions) -> Result<Pdf> {
        match self.call(Request::Pdf {
            deck: text_of(deck)?,
            options: *options,
        })? {
            Reply::Pdf(pdf) => Ok(pdf),
            _ => Err(Error::Closed),
        }
    }

    /// PNG pictures of the slides the options ask for, in order.
    pub fn png(&self, deck: &Deck, options: &PngOptions) -> Result<Vec<Picture>> {
        match self.call(Request::Pictures {
            deck: text_of(deck)?,
            options: *options,
        })? {
            Reply::Pictures(pictures) => Ok(pictures),
            _ => Err(Error::Closed),
        }
    }

    /// The deck as one web page that shows it offline, with reveal.js, the fonts and the pictures in it.
    pub fn html(&self, deck: &Deck, options: &HtmlOptions) -> Result<HtmlFile> {
        match self.call(Request::Html {
            deck: text_of(deck)?,
            name: options.name.clone(),
        })? {
            Reply::Html(file) => Ok(file),
            _ => Err(Error::Closed),
        }
    }

    /// A slide as the editor's own picture export draws it (an SVG the browser turns into pixels), for comparing with [`Renderer::render_slide`].
    #[doc(hidden)]
    pub fn editor_png(&self, deck: &Deck, slide: usize, scale: f32) -> Result<Option<Vec<u8>>> {
        match self.call(Request::EditorPng {
            deck: text_of(deck)?,
            slide,
            scale,
        })? {
            Reply::Bytes(bytes) => Ok(bytes),
            _ => Err(Error::Closed),
        }
    }
}

impl Drop for Renderer {
    fn drop(&mut self) {
        // Closing the channel is what tells the thread to shut the browser down and stop.
        self.jobs = None;
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
