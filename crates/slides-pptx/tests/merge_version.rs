//! A deck sent to PowerPoint and read back as a new version of itself keeps the identity of
//! everything the file still has: slides, and the elements on them. Edits made in the file
//! (a box moved, a word changed, a slide added or dropped) reach the deck and leave the rest be.

mod common;

use std::fs;
use std::path::PathBuf;

use slides_core::{Deck, Element};
use slides_pptx::import::{ImportOptions, import, merge_with_report};
use slides_pptx::{Options, export};

use common::pictures::pictures_for;
use common::{Files, decks, variety};

fn fixtures() -> Vec<(String, Deck)> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/decks");
    let mut found: Vec<PathBuf> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "deck"))
        .collect();
    found.sort();
    found
        .into_iter()
        .map(|path| {
            let text =
                fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
            let deck =
                slides_core::parse(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
            (
                path.file_name()
                    .map_or_else(String::new, |n| n.to_string_lossy().into_owned()),
                deck,
            )
        })
        .collect()
}

fn ids(list: &[Element], out: &mut Vec<String>) {
    for e in list {
        out.push(e.id().to_owned());
        ids(e.children(), out);
    }
}

/// The deck exported and imported, then merged back into itself.
fn back(deck: &Deck, files: Files) -> (Deck, Vec<String>) {
    let files = pictures_for(deck, files);
    let exported = export(deck, &files, &Options::default()).unwrap_or_else(|e| panic!("{e}"));
    // The markers in the notes say which slide each page is.
    let options = ImportOptions {
        markers: true,
        ..ImportOptions::default()
    };
    let imported = import(&exported.bytes, &options).unwrap_or_else(|e| panic!("{e}"));
    let merged = merge_with_report(deck, imported.deck);
    (merged.deck, merged.notes)
}

fn assert_ids_survive(name: &str, deck: &Deck, files: Files) {
    let (merged, notes) = back(deck, files);
    // Only slides with steps are set aside; no slide is new and none is missing.
    assert!(
        notes.iter().all(|n| n.contains("with steps")),
        "{name}: {notes:?}"
    );
    assert_eq!(
        merged
            .slides
            .iter()
            .map(|s| s.id.clone())
            .collect::<Vec<_>>(),
        deck.slides.iter().map(|s| s.id.clone()).collect::<Vec<_>>(),
        "{name}: slide ids"
    );
    for (m, d) in merged.slides.iter().zip(&deck.slides) {
        let (mut got, mut want) = (Vec::new(), Vec::new());
        ids(&m.elements, &mut got);
        ids(&d.elements, &mut want);
        // A step-by-step slide comes back from its last page; a composite's parts come back as it was.
        assert_eq!(got, want, "{name}: element ids of slide {}", d.id);
        assert_eq!(m.steps, d.steps, "{name}: steps of {}", d.id);
    }
}

#[test]
fn every_fixture_deck_keeps_all_its_ids_through_a_file_and_back() {
    let all = fixtures();
    assert!(all.len() >= 5);
    for (name, deck) in all {
        assert_ids_survive(&name, &deck, Files::default());
    }
}

#[test]
fn the_demo_and_the_text_heavy_deck_keep_their_ids_too() {
    let (deck, files) = decks::demo();
    assert_ids_survive("demo", &deck, files);
    let (deck, files) = variety::text_heavy();
    assert_ids_survive("text heavy", &deck, files);
}
