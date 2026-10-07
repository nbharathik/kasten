//! Packages taken apart and put together again, for the tests that break them.
#![allow(dead_code)]

use std::io::{Cursor, Read, Write};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::PathBuf;
use std::time::Instant;

use slides_pptx::import::{ImportOptions, Imported, import};
use slides_pptx::{Options, export};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use super::decks;

pub struct Dice(pub u64);

impl Dice {
    pub fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    pub fn below(&mut self, n: usize) -> usize {
        (self.next() % n.max(1) as u64) as usize
    }
}

pub type Entries = Vec<(String, Vec<u8>)>;
/// A way to break the text of a part.
pub type Change = Box<dyn Fn(&str) -> String>;

pub fn entries(bytes: &[u8]) -> Entries {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).unwrap_or_else(|e| panic!("{e}"));
    (0..archive.len())
        .map(|i| {
            let mut file = archive.by_index(i).unwrap_or_else(|e| panic!("{e}"));
            let mut body = Vec::new();
            file.read_to_end(&mut body)
                .unwrap_or_else(|e| panic!("{e}"));
            (file.name().to_owned(), body)
        })
        .collect()
}

pub fn zipped(list: &Entries) -> Vec<u8> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, body) in list {
        zip.start_file(name, options)
            .unwrap_or_else(|e| panic!("{e}"));
        zip.write_all(body).unwrap_or_else(|e| panic!("{e}"));
    }
    zip.finish().unwrap_or_else(|e| panic!("{e}")).into_inner()
}

pub fn fixture(name: &str) -> Vec<u8> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/decks/pptx")
        .join(name);
    std::fs::read(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

/// Files to break: one this crate exports, and two that other programs made.
pub fn bases() -> Vec<(&'static str, Vec<u8>)> {
    let (deck, files) = decks::demo();
    let ours = export(&deck, &files, &Options::default())
        .unwrap_or_else(|e| panic!("{e}"))
        .bytes;
    vec![
        ("ours", ours),
        ("libreoffice", fixture("libreoffice.pptx")),
        ("python-pptx", fixture("python-pptx.pptx")),
    ]
}

/// Imports what it is given: no panic, not slow, and a deck the format accepts when there is one.
pub fn survive(name: &str, bytes: &[u8]) -> Option<Imported> {
    let started = Instant::now();
    let result = catch_unwind(AssertUnwindSafe(|| {
        import(bytes, &ImportOptions::default())
    }));
    let seconds = started.elapsed().as_secs_f64();
    assert!(seconds < 30.0, "{name}: took {seconds:.1} s");
    match result {
        Err(_) => panic!("{name}: the import panicked"),
        Ok(Err(_)) => None,
        Ok(Ok(imported)) => {
            let text = slides_core::canonical::write(&imported.deck)
                .unwrap_or_else(|e| panic!("{name}: {e}"));
            slides_core::parse(&text)
                .unwrap_or_else(|e| panic!("{name}: the deck is refused by the format: {e}"));
            assert_eq!(imported.report.slides, imported.deck.slides.len(), "{name}");
            Some(imported)
        }
    }
}
