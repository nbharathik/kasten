//! How long an import takes. The biggest file we hold, and a long talk this crate exports (forty
//! slides, three pictures each), must import in under five seconds. A release build takes a small
//! share of that and a debug build a few times more, so the budget holds for both; the time is printed.

mod common;

use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use slides_pptx::import::{ImportOptions, import};
use slides_pptx::{Options, export};

use common::variety;

const BUDGET_SECONDS: f64 = 5.0;

fn build() -> &'static str {
    if cfg!(debug_assertions) {
        "debug build"
    } else {
        "release build"
    }
}

#[test]
fn the_biggest_fixture_file_imports_within_budget() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/decks/pptx");
    let mut files: Vec<(u64, PathBuf)> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|x| x == "pptx"))
        .map(|e| (e.metadata().map_or(0, |m| m.len()), e.path()))
        .collect();
    files.sort();
    let Some((size, biggest)) = files.pop() else {
        panic!("no fixture files in {}", dir.display())
    };
    let bytes = fs::read(&biggest).unwrap_or_else(|e| panic!("{e}"));

    let started = Instant::now();
    let imported = import(&bytes, &ImportOptions::default()).unwrap_or_else(|e| panic!("{e}"));
    let seconds = started.elapsed().as_secs_f64();
    println!(
        "imported {} ({} KB, {} slides) in {seconds:.3} s ({})",
        biggest
            .file_name()
            .map_or_else(String::new, |n| n.to_string_lossy().into_owned()),
        size / 1024,
        imported.deck.slides.len(),
        build()
    );
    assert!(
        seconds < BUDGET_SECONDS,
        "took {seconds:.3} s, the budget is {BUDGET_SECONDS} s"
    );
}

#[test]
fn a_forty_slide_deck_with_three_pictures_each_imports_within_budget() {
    let (deck, files) = variety::large(40, 3);
    let exported = export(&deck, &files, &Options::default()).unwrap_or_else(|e| panic!("{e}"));

    let started = Instant::now();
    let imported =
        import(&exported.bytes, &ImportOptions::default()).unwrap_or_else(|e| panic!("{e}"));
    let seconds = started.elapsed().as_secs_f64();
    println!(
        "imported {} slides and {} pictures from {} KB in {seconds:.3} s ({})",
        imported.deck.slides.len(),
        imported.media.len(),
        exported.bytes.len() / 1024,
        build()
    );
    assert_eq!(imported.deck.slides.len(), deck.slides.len());
    assert_eq!(imported.media.len(), 120, "every picture is stored once");
    assert!(
        imported.report.warnings.is_empty(),
        "{:?}",
        imported.report.warnings
    );
    assert!(
        seconds < BUDGET_SECONDS,
        "took {seconds:.3} s, the budget is {BUDGET_SECONDS} s"
    );
}

#[test]
fn the_same_file_and_seed_make_the_same_deck() {
    let (deck, files) = variety::large(12, 2);
    let bytes = export(&deck, &files, &Options::default())
        .unwrap_or_else(|e| panic!("{e}"))
        .bytes;
    let (a, b) = (
        import(&bytes, &ImportOptions::default()).unwrap_or_else(|e| panic!("{e}")),
        import(&bytes, &ImportOptions::default()).unwrap_or_else(|e| panic!("{e}")),
    );
    assert_eq!(a.deck, b.deck);
    assert_eq!(a.media, b.media);
    let other = import(
        &bytes,
        &ImportOptions {
            seed: 99,
            ..ImportOptions::default()
        },
    )
    .unwrap_or_else(|e| panic!("{e}"));
    assert_ne!(
        a.deck.slides[0].id, other.deck.slides[0].id,
        "another seed, other ids"
    );
    assert_eq!(a.deck.slides.len(), other.deck.slides.len());
}
