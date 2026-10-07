//! Reading the files other programs made (`fixtures/decks/pptx`) and looking at the decks they
//! import as.
#![allow(dead_code)]

use std::fs;
use std::path::PathBuf;

use slides_core::{Deck, Element, Slide};
use slides_pptx::import::{ImportOptions, Imported, import};

pub fn read(path: &str) -> Vec<u8> {
    let full = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(path);
    fs::read(&full).unwrap_or_else(|e| panic!("{}: {e}", full.display()))
}

pub fn fixture(name: &str) -> Imported {
    import(
        &read(&format!("fixtures/decks/pptx/{name}")),
        &ImportOptions::default(),
    )
    .unwrap_or_else(|e| panic!("{name}: {e}"))
}

/// The deck the two files that were made from the sample were made from: a copy kept beside them,
/// so a change to the sample deck of the dev vault leaves the files and their source together.
pub fn sample() -> Deck {
    let text = String::from_utf8(read("fixtures/decks/pptx/sample.deck")).unwrap_or_default();
    slides_core::parse(&text).unwrap_or_else(|e| panic!("the sample deck: {e}"))
}

pub fn walk<'a>(list: &'a [Element], out: &mut Vec<&'a Element>) {
    for e in list {
        out.push(e);
        walk(e.children(), out);
    }
}

pub fn all(slide: &Slide) -> Vec<&Element> {
    let mut out = Vec::new();
    walk(&slide.elements, &mut out);
    out
}

pub fn words(e: &Element) -> String {
    match e {
        Element::Text(t) => t.text.plain_text(),
        Element::Shape(s) => s.text.as_ref().map(|t| t.plain_text()).unwrap_or_default(),
        _ => String::new(),
    }
}

pub fn title(slide: &Slide) -> String {
    slide
        .elements
        .iter()
        .find(|e| e.base().placeholder.as_deref() == Some("title"))
        .or_else(|| {
            slide
                .elements
                .iter()
                .find(|e| matches!(e, Element::Text(_)))
        })
        .map(words)
        .unwrap_or_default()
}

pub fn count(deck: &Deck, kind: &str) -> usize {
    deck.slides
        .iter()
        .map(|s| all(s).iter().filter(|e| e.kind() == kind).count())
        .sum()
}
