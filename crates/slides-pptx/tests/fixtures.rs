//! The decks in `fixtures/decks`, small ones for each kind of trouble, export
//! into packages that hold together and come out the same every time.

mod common;

use std::fs;
use std::path::PathBuf;

use slides_pptx::{Options, export};

use common::Files;
use common::inspect;

fn fixtures() -> Vec<PathBuf> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/decks");
    let mut found: Vec<PathBuf> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "deck"))
        .collect();
    found.sort();
    found
}

#[test]
fn every_fixture_deck_exports_into_a_package_that_holds_together() {
    let paths = fixtures();
    assert!(paths.len() >= 5, "the fixture decks are missing: {paths:?}");
    for path in paths {
        let name = path
            .file_name()
            .map_or_else(String::new, |n| n.to_string_lossy().into_owned());
        let text = fs::read_to_string(&path).unwrap_or_else(|e| panic!("{name}: {e}"));
        let deck = slides_core::parse(&text).unwrap_or_else(|e| panic!("{name}: {e}"));
        let none = Files::default();
        let first =
            export(&deck, &none, &Options::default()).unwrap_or_else(|e| panic!("{name}: {e}"));
        let package = inspect::open(&first.bytes);
        let problems = inspect::problems(&package);
        assert!(problems.is_empty(), "{name}: {problems:#?}");
        // A slide with steps is a page for each of its states.
        assert_eq!(
            inspect::slide_names(&package).len(),
            slides_pptx::pages(&deck, &Options::default()).len(),
            "{name}"
        );
        // Pictures are not beside the fixtures, and math is kept as its source: those are the only things to report.
        for warning in &first.warnings {
            let known = ["picture", "image", "inline math"];
            assert!(
                known.iter().any(|word| warning.message.contains(word)),
                "{name}: {warning:?}"
            );
        }
        let second =
            export(&deck, &none, &Options::default()).unwrap_or_else(|e| panic!("{name}: {e}"));
        assert_eq!(first.bytes, second.bytes, "{name} is not the same twice");
    }
}
