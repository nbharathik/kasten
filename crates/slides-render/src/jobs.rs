//! The things a render host is asked to do, one at a time, and how each is done with the page and the browser.

use std::sync::Arc;

use serde_json::json;
use slides_core::lint::Measures;

use crate::error::{Error, Result};
use crate::session::Session;
use crate::types::Png;
use crate::types::{
    GridInfo, HtmlFile, HtmlResult, PageRef, Pdf, PdfOptions, Picture, PngOptions, PrintInfo,
    Scope, SlideInfo, Steps,
};

pub enum Request {
    Slide {
        deck: Arc<str>,
        slide: usize,
        step: Option<u32>,
        scale: f32,
    },
    Grid {
        deck: Arc<str>,
        columns: Option<usize>,
        width: Option<u32>,
    },
    Measure {
        deck: Arc<str>,
    },
    Pdf {
        deck: Arc<str>,
        options: PdfOptions,
    },
    Pictures {
        deck: Arc<str>,
        options: PngOptions,
    },
    Html {
        deck: Arc<str>,
        name: Option<String>,
    },
    /// The editor's own picture of a slide, to compare with the browser's.
    EditorPng {
        deck: Arc<str>,
        slide: usize,
        scale: f32,
    },
}

pub enum Reply {
    Png(Png),
    Measures(Measures),
    Pdf(Pdf),
    Pictures(Vec<Picture>),
    Html(HtmlFile),
    Bytes(Option<Vec<u8>>),
}

/// The scales a picture can be taken at: the editor offers 1, 2 and 4; anything between 1/4 and 4 works.
pub const SCALES: std::ops::RangeInclusive<f32> = 0.25..=4.0;

/// Pixels a length of `units` comes to at `scale`.
fn pixels(units: u32, scale: f32) -> u32 {
    (f64::from(units) * f64::from(scale)).round().max(1.0) as u32
}

fn png(bytes: Vec<u8>, warnings: Vec<String>) -> Result<Png> {
    let (width, height) = slides_core::agent::dimensions(&bytes)
        .ok_or_else(|| Error::Browser("the browser gave a picture that is not a PNG".to_owned()))?;
    Ok(Png {
        bytes,
        width,
        height,
        warnings,
    })
}

/// A photograph of what the page shows, taken again once if the browser had not yet settled on the size.
async fn photograph(session: &Session, width: u32, height: u32, scale: f32) -> Result<Vec<u8>> {
    let (want_w, want_h) = (pixels(width, scale), pixels(height, scale));
    let mut bytes = session.photograph(width, height, f64::from(scale)).await?;
    for _ in 0..2 {
        match slides_core::agent::dimensions(&bytes) {
            Some((w, h)) if w == want_w && h == want_h => break,
            _ => bytes = session.photograph(width, height, f64::from(scale)).await?,
        }
    }
    Ok(bytes)
}

async fn slide(session: &Session, index: usize, step: Option<u32>, scale: f32) -> Result<Vec<u8>> {
    let info: SlideInfo = session.call("slide", &[json!(index), json!(step)]).await?;
    photograph(session, info.width, info.height, scale).await
}

fn check_scale(scale: f32) -> Result<()> {
    if SCALES.contains(&scale) {
        Ok(())
    } else {
        Err(Error::Request(format!(
            "The scale is how many pixels each unit of the slide gets, from {} to {}; {scale} is outside that.",
            SCALES.start(),
            SCALES.end()
        )))
    }
}

pub async fn handle(session: &mut Session, request: &Request) -> Result<Reply> {
    match request {
        Request::Slide {
            deck,
            slide: index,
            step,
            scale,
        } => {
            check_scale(*scale)?;
            session.load(deck).await?;
            let bytes = slide(session, *index, *step, *scale).await?;
            Ok(Reply::Png(png(bytes, session.take_notes())?))
        }
        Request::Grid {
            deck,
            columns,
            width,
        } => {
            session.load(deck).await?;
            let info: GridInfo = session
                .call("grid", &[json!(columns), json!(width)])
                .await?;
            let bytes = photograph(session, info.width, info.height, 1.0).await?;
            Ok(Reply::Png(png(bytes, session.take_notes())?))
        }
        Request::Measure { deck } => {
            session.load(deck).await?;
            Ok(Reply::Measures(session.call("measure", &[]).await?))
        }
        Request::Pdf { deck, options } => {
            session.load(deck).await?;
            let choice = json!({ "steps": if options.steps == Steps::Each { "each" } else { "final" }, "notes": options.notes });
            let info: PrintInfo = session.call("print", &[choice]).await?;
            let printed = session.print().await;
            // The printout is taken off the page whether or not it printed.
            let _ = session.eval("window.__render.unprint()").await;
            Ok(Reply::Pdf(Pdf {
                bytes: printed?,
                pages: info.pages,
                warnings: session.take_notes(),
            }))
        }
        Request::Pictures { deck, options } => {
            check_scale(options.scale)?;
            session.load(deck).await?;
            let (scope, current) = match options.scope {
                Scope::All => ("all", None),
                Scope::Slide(index) => ("current", Some(index)),
            };
            let wanted = json!({ "scope": scope, "steps": if options.steps == Steps::Each { "each" } else { "final" }, "current": current });
            let pages: Vec<PageRef> = session.call("pages", &[wanted]).await?;
            let mut pictures = Vec::with_capacity(pages.len());
            for page in pages {
                let bytes = slide(session, page.index, page.step, options.scale).await?;
                pictures.push(Picture {
                    name: page.name,
                    number: page.number,
                    slide: page.index,
                    step: page.step,
                    png: png(bytes, Vec::new())?,
                });
            }
            // What was noted about pictures is told with the first, which is the one they were asked for in.
            let notes = session.take_notes();
            if let Some(first) = pictures.first_mut() {
                first.png.warnings = notes;
            }
            Ok(Reply::Pictures(pictures))
        }
        Request::Html { deck, name } => {
            session.load(deck).await?;
            let made: HtmlResult = session.call("html", &[json!(name)]).await?;
            let mut warnings = made.warnings;
            for note in session.take_notes() {
                if !warnings.contains(&note) {
                    warnings.push(note);
                }
            }
            Ok(Reply::Html(HtmlFile {
                name: made.name,
                text: made.html,
                warnings,
            }))
        }
        Request::EditorPng {
            deck,
            slide: index,
            scale,
        } => {
            session.load(deck).await?;
            let encoded: Option<String> = session
                .call("editorPng", &[json!(index), json!(scale)])
                .await?;
            Ok(Reply::Bytes(encoded.and_then(|text| base64_decode(&text))))
        }
    }
}

/// Standard base64 to bytes; `None` when it is not base64.
pub fn base64_decode(text: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(text.len() / 4 * 3);
    let (mut bits, mut have) = (0u32, 0u32);
    for byte in text.bytes() {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\n' | b'\r' => continue,
            _ => return None,
        };
        bits = bits << 6 | u32::from(value);
        have += 6;
        if have >= 8 {
            have -= 8;
            out.push((bits >> have & 0xff) as u8);
        }
    }
    Some(out)
}
