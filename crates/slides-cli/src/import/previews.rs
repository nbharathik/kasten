//! `--previews`: a picture of each object the import kept as it was (a chart, a diagram, a
//! freeform ...). LibreOffice draws the file to a PDF, `pdftoppm` draws each page that has such an
//! object to a picture, and the box of the object is cut out of it. LibreOffice opens the file
//! itself, so this is only done when asked for.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use slides_core::{Deck, Element};
use slides_pptx::import::{MediaFile, crop_preview};
use slides_render::private;
use slides_render::profile::{self, Slot};

/// Pixels to a slide unit in the pictures cut from the pages.
const SCALE: f64 = 2.0;
/// The most a program is given to draw a file.
const WAIT: Duration = Duration::from_secs(180);

/// A kept object that has no picture yet: its slide (by place), its id and its box.
struct Target {
    slide: usize,
    id: String,
    rect: (f64, f64, f64, f64),
}

fn collect(list: &[Element], slide: usize, out: &mut Vec<Target>) {
    for e in list {
        if let Element::Raw(r) = e
            && r.preview.is_none()
            && let Some(rect) = r.base.rect()
        {
            out.push(Target {
                slide,
                id: r.base.id.clone(),
                rect,
            });
        }
        collect(e.children(), slide, out);
    }
}

/// Waits for a program to end, and ends it if it takes too long.
fn wait(mut child: Child, what: &str) -> Result<(), String> {
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(status)) => return Err(format!("{what} stopped with {status}")),
            Ok(None) if started.elapsed() > WAIT => {
                let _ = child.kill();
                return Err(format!("{what} took more than {} seconds", WAIT.as_secs()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(format!("{what}: {e}")),
        }
    }
}

fn office() -> Option<&'static str> {
    ["soffice", "libreoffice"].into_iter().find(|name| {
        Command::new(name)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    })
}

/// A folder to draw in: one of a few kept for the purpose, closed to other users, and lent out one at a time. It is
/// reused so that it does not pile up (nothing here is ever deleted) and so that LibreOffice finds its profile
/// already made; it is private because LibreOffice reads its profile from it and writes into it, and a folder in
/// /tmp that anyone could plant would let them plant that profile or a link for the output to be written through.
fn workplace_in(bases: &[PathBuf]) -> Result<Slot, String> {
    profile::claim(&profile::WORKPLACES, bases, &[])
        .map_err(|e| format!("no private folder to draw the previews in: {e}"))
}

fn draw_pdf(office: &str, dir: &Path, pptx: &[u8]) -> Result<PathBuf, String> {
    let input = dir.join("import.pptx");
    private::overwrite_own(&input, pptx)
        .map_err(|e| format!("cannot write {}: {e}", input.display()))?;
    // The PDF of an earlier import is in this folder still: it is emptied, so that a conversion that makes nothing
    // cannot be taken for one that made this file's.
    let pdf = dir.join("import.pdf");
    private::overwrite_own(&pdf, b"")
        .map_err(|e| format!("cannot write {}: {e}", pdf.display()))?;
    let child = Command::new(office)
        .env("SAL_USE_VCLPLUGIN", "svp")
        .arg(format!(
            "-env:UserInstallation=file://{}",
            dir.join("profile").display()
        ))
        .args(["--headless", "--convert-to", "pdf", "--outdir"])
        .arg(dir)
        .arg(&input)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("cannot start {office}: {e}"))?;
    wait(child, office)?;
    if fs::metadata(&pdf).is_ok_and(|m| m.is_file() && m.len() > 0) {
        Ok(pdf)
    } else {
        Err(format!("{office} made no PDF"))
    }
}

fn draw_page(pdf: &Path, dir: &Path, page: usize) -> Result<Vec<u8>, String> {
    let prefix = dir.join(format!("page-{page}"));
    let child = Command::new("pdftoppm")
        .args(["-png", "-singlefile", "-r"])
        .arg((96.0 * SCALE).to_string())
        .args(["-f", &page.to_string(), "-l", &page.to_string()])
        .arg(pdf)
        .arg(&prefix)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("cannot start pdftoppm: {e}"))?;
    wait(child, "pdftoppm")?;
    let png = prefix.with_extension("png");
    fs::read(&png).map_err(|e| format!("cannot read {}: {e}", png.display()))
}

/// Gives each kept object of the deck a picture drawn from the file it came from. Returns the
/// pictures made, and how many objects got none.
pub fn add(deck: &mut Deck, pptx: &[u8]) -> Result<(Vec<MediaFile>, usize), String> {
    let mut targets = Vec::new();
    for (n, slide) in deck.slides.iter().enumerate() {
        // A hidden slide is not drawn to the PDF.
        if !slide.hidden {
            collect(&slide.elements, n, &mut targets);
        }
    }
    if targets.is_empty() {
        return Ok((Vec::new(), 0));
    }
    let office = office().ok_or("LibreOffice (soffice) was not found")?;
    // Held until the pictures are cut, so that no one else works in the folder meanwhile.
    let place = workplace_in(&profile::bases(&profile::WORKPLACES, |name| {
        std::env::var_os(name)
    }))?;
    let dir = place.dir.clone();
    let pdf = draw_pdf(office, &dir, pptx)?;

    // The page of a slide counts the slides before it that are drawn.
    let mut page_of = Vec::with_capacity(deck.slides.len());
    let mut drawn = 0;
    for slide in &deck.slides {
        if !slide.hidden {
            drawn += 1;
        }
        page_of.push(drawn);
    }
    let mut by_page: BTreeMap<usize, Vec<&Target>> = BTreeMap::new();
    for t in &targets {
        by_page.entry(page_of[t.slide]).or_default().push(t);
    }
    let (mut files, mut chosen, mut missed) = (Vec::new(), Vec::new(), 0);
    for (page, list) in by_page {
        let Ok(png) = draw_page(&pdf, &dir, page) else {
            missed += list.len();
            continue;
        };
        for t in list {
            match crop_preview(&png, t.rect, SCALE) {
                Some(file) => {
                    chosen.push((t.slide, t.id.clone(), file.path.clone()));
                    if !files.iter().any(|f: &MediaFile| f.path == file.path) {
                        files.push(file);
                    }
                }
                None => missed += 1,
            }
        }
    }
    for (slide, id, path) in chosen {
        if let Some(Element::Raw(r)) = deck.slides[slide].element_mut(&id) {
            r.preview = Some(path);
        }
    }
    Ok((files, missed))
}

#[cfg(test)]
mod tests;
