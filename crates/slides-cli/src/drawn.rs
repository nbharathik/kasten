//! What needs a browser: `slides render` (one slide or a grid as a PNG) and the export formats that are drawn, not
//! written: PDF, PNG pictures and the offline web page. The deck is drawn by Chrome or Chromium through
//! `slides-render`; where there is none the commands say so and do nothing.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use slides_core::Deck;
use slides_core::lint::{Measures, estimate};
use slides_render::{
    FolderMedia, HtmlOptions, Options, PdfOptions, PngOptions, Renderer, Scope, Steps,
};

use crate::args::Args;
use crate::commands::Failure;
use crate::deckfile;

/// The value of `-o` (or `--output`) and the deck named before or after it.
pub fn paths(args: &Args, command: &str) -> Result<(PathBuf, Option<PathBuf>), Failure> {
    let words = &args.positional[1..];
    let mut deck = None;
    let mut out = args.value("output").map(PathBuf::from);
    let mut i = 0;
    while i < words.len() {
        if words[i] == "-o" {
            out = Some(PathBuf::from(words.get(i + 1).ok_or_else(|| {
                Failure::Usage("-o needs a file name".to_owned())
            })?));
            i += 2;
        } else {
            if deck.replace(PathBuf::from(&words[i])).is_some() {
                return Err(Failure::Usage(format!("{command} takes one deck")));
            }
            i += 1;
        }
    }
    let deck = deck.ok_or_else(|| Failure::Usage(format!("missing the deck to {command}")))?;
    Ok((deck, out))
}

/// The folder the deck's pictures are read from: `--assets`, else the deck's own folder.
pub fn assets_dir(args: &Args, deck: &Path) -> Result<PathBuf, Failure> {
    let assets = match args.value("assets") {
        Some(dir) => PathBuf::from(dir),
        None => deck_folder(deck),
    };
    assets.canonicalize().map_err(|e| {
        Failure::Error(format!(
            "cannot read the assets folder {}: {e}",
            assets.display()
        ))
    })
}

/// Writes a file in one step, so that a crash never leaves half of one.
pub fn write_file(out: &Path, bytes: &[u8]) -> Result<(), Failure> {
    let mut temporary = out.as_os_str().to_owned();
    temporary.push(".tmp");
    let temporary = PathBuf::from(temporary);
    fs::write(&temporary, bytes)
        .map_err(|e| Failure::Error(format!("cannot write {}: {e}", temporary.display())))?;
    fs::rename(&temporary, out)
        .map_err(|e| Failure::Error(format!("cannot replace {}: {e}", out.display())))
}

fn failure(e: slides_render::Error) -> Failure {
    Failure::Error(e.to_string())
}

/// A whole number argument in a range, or a usage error that says what is wanted.
fn number(args: &Args, name: &str, least: u64, what: &str) -> Result<Option<u64>, Failure> {
    let Some(text) = args.value(name) else {
        return Ok(None);
    };
    match text.parse::<u64>() {
        Ok(n) if n >= least => Ok(Some(n)),
        _ => Err(Failure::Usage(format!("--{name} is {what}, not `{text}`"))),
    }
}

/// The picture scale: `--scale`, else `default`.
fn scale(args: &Args, default: f32) -> Result<f32, Failure> {
    match args.value("scale") {
        None => Ok(default),
        Some(text) => match text.parse::<f32>() {
            Ok(s) if (0.25..=4.0).contains(&s) => Ok(s),
            _ => Err(Failure::Usage(format!(
                "--scale is the pixels to each unit of the slide, from 0.25 to 4 (1, 2 and 4 are usual), not `{text}`"
            ))),
        },
    }
}

/// `--steps`: `final` (each slide as it ends) or `each`/`expand` (every step of a slide that has steps).
fn steps(args: &Args) -> Result<Steps, Failure> {
    match args.value("steps") {
        None | Some("final") => Ok(Steps::Final),
        Some("each" | "expand") => Ok(Steps::Each),
        Some(other) => Err(Failure::Usage(format!(
            "--steps is `final` (each slide as it ends) or `each` (a picture or page for every step), not `{other}`"
        ))),
    }
}

/// The folder a deck is in: where its `.bib` files are. A bare file name is in this folder.
fn deck_folder(deck: &Path) -> PathBuf {
    deck.parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map_or_else(|| PathBuf::from("."), Path::to_path_buf)
}

/// What a browser is started with to draw a deck: the pictures in its folder (or `--assets`) and the bibliography in
/// the `.bib` files beside it, so that a citation is drawn as the work it names and not as its key.
fn options(args: &Args, deck_path: &Path) -> Result<Options, Failure> {
    let media = FolderMedia::new(assets_dir(args, deck_path)?)
        .map_err(|e| Failure::Error(e.to_string()))?;
    Ok(Options {
        media: Arc::new(media),
        references: crate::refs::text_in(&deck_folder(deck_path)),
        timeout: Duration::from_secs(120),
        ..Options::default()
    })
}

/// Starts a browser that reads the deck's pictures from its folder.
fn renderer(args: &Args, deck_path: &Path) -> Result<Renderer, Failure> {
    Renderer::launch_with(options(args, deck_path)?).map_err(failure)
}

fn warn(warnings: &[String]) {
    for warning in warnings {
        eprintln!("warning: {warning}");
    }
}

fn stem(path: &Path) -> String {
    path.file_stem()
        .map_or_else(|| "deck".to_owned(), |s| s.to_string_lossy().into_owned())
}

/// `slides render <deck> [--slide N] [--step K] [--scale S] [--assets DIR] [-o out.png]`, or `--grid [--columns C]`.
pub fn render(args: &Args) -> Result<(), Failure> {
    let (deck_path, out) = paths(args, "render")?;
    // What is asked is checked before the deck is read or a browser started.
    let columns = number(args, "columns", 1, "the number of columns, from 1")?.map(|n| n as usize);
    let slide =
        number(args, "slide", 1, "the slide's number, counted from 1")?.unwrap_or(1) as usize;
    let step = number(args, "step", 0, "a step, counted from 0")?.map(|n| n as u32);
    let scale = scale(args, 1.0)?;
    let deck = deckfile::read(&deck_path)?;
    let renderer = renderer(args, &deck_path)?;
    let png = if args.has("grid") {
        renderer.render_grid(&deck, columns).map_err(failure)?
    } else {
        renderer
            .render_slide(&deck, slide - 1, step, scale)
            .map_err(failure)?
    };
    let out = out.unwrap_or_else(|| {
        let name = if args.has("grid") {
            format!("{}-grid.png", stem(&deck_path))
        } else {
            let slide = args.value("slide").unwrap_or("1");
            args.value("step").map_or_else(
                || format!("{}-slide-{slide}.png", stem(&deck_path)),
                |step| format!("{}-slide-{slide}-step-{step}.png", stem(&deck_path)),
            )
        };
        deck_path.with_file_name(name)
    });
    write_file(&out, &png.bytes)?;
    warn(&png.warnings);
    println!(
        "Wrote {} ({} x {} pixels)",
        out.display(),
        png.width,
        png.height
    );
    Ok(())
}

/// The sizes of a deck's text for lint, and how they were found.
pub struct Measured {
    pub measures: Measures,
    /// `chrome` when the browser laid the words out, `estimate` when they were worked out from the words.
    pub with: &'static str,
    /// Why the browser was not used, when it was not: a sentence for the person.
    pub note: Option<String>,
}

/// How big the words of a deck come out: measured in the browser when there is one (and `--estimate` is not given),
/// else estimated, and the answer says which.
pub fn measured(args: &Args, deck_path: &Path, deck: &Deck) -> Measured {
    let estimated = |note: Option<String>| Measured {
        // A citation is as long as it is written out, which takes the bibliography beside the deck.
        measures: estimate::measures_with(deck, crate::refs::beside(deck_path).as_ref()),
        with: "estimate",
        note,
    };
    if args.has("estimate") {
        return estimated(None);
    }
    let attempt = options(args, deck_path)
        .map(|o| Renderer::launch_with(o).and_then(|browser| browser.measure(deck)));
    match attempt {
        Ok(Ok(measures)) => Measured {
            measures,
            with: "chrome",
            note: None,
        },
        // Without a browser the text rules still run, on an estimate, and the report says so.
        Ok(Err(why)) => estimated(Some(not_measured(&why))),
        Err(Failure::Error(reason) | Failure::Usage(reason)) => estimated(Some(format!(
            "Text sizes were estimated, not measured: {reason}"
        ))),
    }
}

/// Why text was not measured in a browser, as a sentence. Where there is no browser it says to install one; where
/// there is one that would not start or failed, it gives the reason whole, because that is what says what to do.
fn not_measured(why: &slides_render::Error) -> String {
    let reason = why.to_string();
    if !matches!(why, slides_render::Error::NoBrowser { .. }) {
        return format!("Text sizes were estimated, not measured: {reason}");
    }
    let first = reason
        .split(". ")
        .next()
        .unwrap_or(&reason)
        .trim_end_matches('.');
    format!(
        "Text sizes were estimated, not measured: {first}. Install Chrome or Chromium (or set CHROMIUM_PATH) to measure them."
    )
}

/// The formats `slides export` draws with a browser.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Format {
    Pdf,
    Png,
    Html,
}

impl Format {
    /// The format asked for by `--format`, or else by the extension of the output file; `None` for PowerPoint.
    pub fn of(args: &Args, out: Option<&Path>) -> Result<Option<Format>, Failure> {
        let named = args
            .value("format")
            .map(str::to_ascii_lowercase)
            .or_else(|| {
                out.and_then(|o| o.extension())
                    .map(|e| e.to_string_lossy().to_ascii_lowercase())
            });
        match named.as_deref() {
            None | Some("pptx") => Ok(None),
            Some("pdf") => Ok(Some(Format::Pdf)),
            Some("png") => Ok(Some(Format::Png)),
            Some("html" | "htm") => Ok(Some(Format::Html)),
            Some(other) => Err(Failure::Usage(format!(
                "cannot export to `{other}`: the formats are pptx, pdf, png and html"
            ))),
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Format::Pdf => "pdf",
            Format::Png => "png",
            Format::Html => "html",
        }
    }
}

/// Picture files for a set of PNGs: the one file `out` when there is one picture, else `<stem>-03.png`, `<stem>-03-step-2.png` beside it.
fn picture_paths(out: &Path, names: &[&str]) -> Vec<PathBuf> {
    if names.len() == 1 {
        return vec![out.to_path_buf()];
    }
    let base = stem(out);
    names
        .iter()
        .map(|name| {
            out.with_file_name(format!(
                "{base}-{}",
                name.strip_prefix("slide-").unwrap_or(name)
            ))
        })
        .collect()
}

/// Exports the deck as a PDF, PNG pictures or an offline web page.
pub fn export(
    args: &Args,
    deck_path: &Path,
    out: Option<PathBuf>,
    format: Format,
) -> Result<(), Failure> {
    // What is asked is checked before the deck is read or a browser started.
    let steps = steps(args)?;
    let one = number(args, "slide", 1, "the slide's number, counted from 1")?
        .map(|n| Scope::Slide(n as usize - 1));
    let scale = scale(args, 2.0)?;
    let deck: Deck = deckfile::read(deck_path)?;
    let out = out.unwrap_or_else(|| deck_path.with_extension(format.extension()));
    let renderer = renderer(args, deck_path)?;
    match format {
        Format::Pdf => {
            let pdf = renderer
                .pdf(
                    &deck,
                    &PdfOptions {
                        steps,
                        notes: args.has("notes"),
                    },
                )
                .map_err(failure)?;
            write_file(&out, &pdf.bytes)?;
            warn(&pdf.warnings);
            println!(
                "Wrote {} ({} pages, {} bytes)",
                out.display(),
                pdf.pages,
                pdf.bytes.len()
            );
        }
        Format::Html => {
            let html = renderer
                .html(
                    &deck,
                    &HtmlOptions {
                        name: out.file_name().map(|n| n.to_string_lossy().into_owned()),
                    },
                )
                .map_err(failure)?;
            write_file(&out, html.text.as_bytes())?;
            warn(&html.warnings);
            println!("Wrote {} ({} bytes)", out.display(), html.text.len());
        }
        Format::Png => {
            let options = PngOptions {
                scope: one.unwrap_or(Scope::All),
                scale,
                steps,
            };
            let pictures = renderer.png(&deck, &options).map_err(failure)?;
            let names: Vec<&str> = pictures.iter().map(|p| p.name.as_str()).collect();
            for (picture, path) in pictures.iter().zip(picture_paths(&out, &names)) {
                write_file(&path, &picture.png.bytes)?;
                warn(&picture.png.warnings);
                println!(
                    "Wrote {} ({} x {} pixels)",
                    path.display(),
                    picture.png.width,
                    picture.png.height
                );
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
