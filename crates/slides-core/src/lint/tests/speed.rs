//! How long lint takes, and that it never falls over.

use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use proptest::prelude::*;
use serde_json::json;

use super::{bench, text};
use crate::canonical;
use crate::lint::{lint_deck, lint_slide};

fn fixtures() -> Vec<(String, String)> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/decks");
    let mut out: Vec<_> = fs::read_dir(dir)
        .unwrap()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "deck"))
        .map(|e| {
            (
                e.file_name().to_string_lossy().into_owned(),
                fs::read_to_string(e.path()).unwrap(),
            )
        })
        .collect();
    out.sort();
    out
}

#[test]
fn every_fixture_deck_is_linted_in_far_less_than_two_seconds() {
    let mut biggest = (0, String::new(), 0.0);
    for (name, text) in fixtures() {
        let deck = canonical::parse(&text).unwrap();
        let started = Instant::now();
        let report = lint_deck(&deck, None);
        let seconds = started.elapsed().as_secs_f64();
        assert!(seconds < 2.0, "{name} took {seconds} s");
        assert_eq!(
            report,
            lint_deck(&deck, None),
            "{name} is linted the same every time"
        );
        if text.len() > biggest.0 {
            biggest = (text.len(), name, seconds);
        }
    }
    eprintln!(
        "lint of the biggest fixture, {}: {:.1} ms",
        biggest.1,
        biggest.2 * 1000.0
    );
}

#[test]
fn sixty_slides_of_thirty_elements_are_linted_in_under_two_seconds() {
    let mut b = bench();
    for n in 0..60 {
        let (slide, _) = b.add_slide("blank", json!({}));
        let elements: Vec<_> = (0..30)
            .map(|i| {
                let x = 40.0 + f64::from(i % 6) * 150.0;
                let y = 40.0 + f64::from(i / 6) * 90.0;
                text(
                    &format!("t{i}"),
                    x,
                    y,
                    140.0,
                    80.0,
                    &format!("Slide {n} box {i} with a few words in it"),
                )
            })
            .collect();
        b.engine
            .apply(
                "add_elements",
                json!({ "slide": slide, "elements": elements }),
            )
            .unwrap();
    }
    let started = Instant::now();
    let report = lint_deck(b.deck(), None);
    let seconds = started.elapsed().as_secs_f64();
    eprintln!(
        "lint of 62 slides and 1800 elements: {:.1} ms, {} issues",
        seconds * 1000.0,
        report.issues.len()
    );
    assert!(seconds < 2.0, "took {seconds} s");
    let one = lint_slide(b.deck(), &b.slide, None).unwrap();
    assert_eq!(one.skipped, report.skipped);
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    #[test]
    fn whatever_the_boxes_and_words_lint_finishes_and_gives_the_same_answer(
        boxes in prop::collection::vec((-2000.0f64..3000.0, -2000.0f64..3000.0, -50.0f64..2000.0, -50.0f64..2000.0, 0.0f64..400.0, "[a-mo-z ]{0,80}"), 0..25),
    ) {
        let mut b = bench();
        let elements: Vec<_> = boxes
            .iter()
            .enumerate()
            .map(|(i, (x, y, w, h, size, words))| {
                json!({ "type": "text", "id": format!("e{i}"), "x": x, "y": y, "w": w.max(0.0), "h": h.max(0.0),
                    "rotation": (*x as i64 % 360),
                    "text": { "paragraphs": [{ "runs": [{ "t": words, "size": size.max(1.0) }] }] } })
            })
            .collect();
        b.add(json!(elements));
        let first = lint_deck(b.deck(), None);
        prop_assert_eq!(&first, &lint_deck(b.deck(), None));
        // The words are drawn from letters that cannot spell a bad number.
        prop_assert!(first.issues.iter().all(|i| !i.message.contains("NaN") && !i.message.contains("inf")));
    }
}
