//! How long an export takes. A long talk (forty slides, three pictures each)
//! must export in under three seconds in a release build; a debug build is
//! several times slower, so it only has to finish, and prints its time.

mod common;

use std::time::Instant;

use slides_pptx::{Options, export};

use common::{inspect, variety};

const BUDGET_SECONDS: f64 = 3.0;

#[test]
fn a_forty_slide_deck_with_three_pictures_each_exports_within_budget() {
    let (deck, files) = variety::large(40, 3);
    let bytes: usize = files.0.values().map(Vec::len).sum();
    assert_eq!(files.0.len(), 120);

    let started = Instant::now();
    let exported = export(&deck, &files, &Options::default()).unwrap_or_else(|e| panic!("{e}"));
    let seconds = started.elapsed().as_secs_f64();
    println!(
        "exported {} slides and {} pictures ({} KB of pictures) into {} KB in {seconds:.3} s ({})",
        deck.slides.len(),
        files.0.len(),
        bytes / 1024,
        exported.bytes.len() / 1024,
        if cfg!(debug_assertions) {
            "debug build"
        } else {
            "release build"
        }
    );
    assert!(exported.warnings.is_empty(), "{:?}", exported.warnings);
    let package = inspect::open(&exported.bytes);
    assert_eq!(
        package
            .parts
            .keys()
            .filter(|n| n.starts_with("ppt/media/"))
            .count(),
        120,
        "every picture is stored once"
    );
    assert!(
        inspect::problems(&package).is_empty(),
        "{:?}",
        inspect::problems(&package)
    );
    if !cfg!(debug_assertions) {
        assert!(
            seconds < BUDGET_SECONDS,
            "took {seconds:.3} s, the budget is {BUDGET_SECONDS} s"
        );
    }
}

#[test]
fn pictures_shared_between_slides_are_stored_and_read_once() {
    let (deck, mut files) = variety::large(40, 3);
    // Every slide shows the same three pictures.
    let three: Vec<Vec<u8>> = (0..3)
        .map(|i| files.0[&format!("assets/slide0-{i}.png")].clone())
        .collect();
    for n in 0..40 {
        for (i, bytes) in three.iter().enumerate() {
            files
                .0
                .insert(format!("assets/slide{n}-{i}.png"), bytes.clone());
        }
    }
    let started = Instant::now();
    let exported = export(&deck, &files, &Options::default()).unwrap_or_else(|e| panic!("{e}"));
    println!("shared pictures: {:.3} s", started.elapsed().as_secs_f64());
    let package = inspect::open(&exported.bytes);
    assert_eq!(
        package
            .parts
            .keys()
            .filter(|n| n.starts_with("ppt/media/"))
            .count(),
        3
    );
}
