//! What the tests that use a real browser share: a way to get one (or to say why not), fixture decks, and eyes.

#![allow(dead_code)]

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Mutex, MutexGuard};

use image::RgbaImage;
use slides_core::Deck;
use slides_render::{Error, Options, Renderer};

/// One browser at a time, whatever the test harness runs in parallel.
static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());

pub fn one_at_a_time() -> MutexGuard<'static, ()> {
    ONE_AT_A_TIME
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

pub fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures")
}

pub fn deck(name: &str) -> Deck {
    let path = fixtures().join("decks").join(name);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    slides_core::canonical::parse(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

/// Whether these tests run as the administrator, where a browser cannot use its sandbox.
pub fn as_root() -> bool {
    slides_render::private::running_as_root()
}

/// Options for a test. As the administrator (in a container, which is the boundary there) a browser cannot use its
/// sandbox, so the tests say, as a program may, that it runs without one; run by anyone else they keep the sandbox
/// on, as a person's would, and `SLIDES_RENDER_NO_SANDBOX=1` in the environment is honoured as for a person.
pub fn options() -> Options {
    Options {
        no_sandbox: as_root().then_some(true),
        ..Options::default()
    }
}

/// A renderer, or `None` (with the reason printed) on a machine that cannot have one. A test that does not say
/// otherwise runs its browser as `options` does.
pub fn renderer(options: Options) -> Option<Renderer> {
    let options = Options {
        no_sandbox: options.no_sandbox.or_else(|| as_root().then_some(true)),
        ..options
    };
    match Renderer::launch_with(options) {
        Ok(renderer) => Some(renderer),
        Err(e @ (Error::NoBrowser { .. } | Error::NoPage)) => {
            eprintln!("SKIPPED: {e}");
            None
        }
        Err(e) => panic!("the render host did not start: {e}"),
    }
}

pub fn decode(png: &[u8]) -> RgbaImage {
    image::load_from_memory_with_format(png, image::ImageFormat::Png)
        .unwrap_or_else(|e| panic!("not a PNG: {e}"))
        .to_rgba8()
}

/// How many different colours a picture has: a blank one has one.
pub fn colours(picture: &RgbaImage) -> usize {
    let mut seen = std::collections::HashSet::new();
    for pixel in picture.pixels() {
        seen.insert(pixel.0);
    }
    seen.len()
}

/// How many pixels are not the picture's first pixel's colour: the ink on a slide.
pub fn ink(picture: &RgbaImage) -> usize {
    let first = picture.get_pixel(0, 0).0;
    picture.pixels().filter(|p| p.0 != first).count()
}

/// Runs a poppler tool (`pdftotext`, `pdfinfo`) on some bytes; `None` when the tool is not installed.
pub fn poppler(tool: &str, args: &[&str], input: &[u8]) -> Option<String> {
    let mut child = Command::new(tool)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    child.stdin.take()?.write_all(input).ok()?;
    let out = child.wait_with_output().ok()?;
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}
