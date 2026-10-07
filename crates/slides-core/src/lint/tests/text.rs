//! The rules about the words: text-overflow, min-font, contrast,
//! word-count and font-missing.

use std::collections::BTreeMap;

use serde_json::json;

use super::{bench, expect, found, measured, styled, text};
use crate::lint::Severity::{Error, Info, Warning};
use crate::lint::{Measure, Measures, Options, lint_deck_with};

fn measures(slide: &str, entries: &[(&str, f64, f64)]) -> Measures {
    let sizes: BTreeMap<String, Measure> = entries
        .iter()
        .map(|(id, width, height)| {
            (
                (*id).to_owned(),
                Measure {
                    text_width: *width,
                    text_height: *height,
                    area_width: None,
                    area_height: None,
                },
            )
        })
        .collect();
    Measures {
        slides: BTreeMap::from([(slide.to_owned(), sizes)]),
        estimated: false,
    }
}

#[test]
fn text_overflow_compares_measured_text_with_its_box_and_allows_five_percent() {
    let mut b = bench();
    b.add(json!([
        text(
            "tight",
            100.0,
            100.0,
            200.0,
            40.0,
            "Too much text for a box this low"
        ),
        text("roomy", 100.0, 200.0, 400.0, 200.0, "Plenty of room"),
        text(
            "edge",
            100.0,
            420.0,
            200.0,
            40.0,
            "Just over, but within five percent"
        ),
        text("wide", 500.0, 100.0, 200.0, 40.0, "Supercalifragilistic"),
        text("unmeasured", 500.0, 200.0, 200.0, 40.0, "Nobody looked"),
    ]));
    let m = measures(
        &b.slide,
        &[
            ("tight", 150.0, 90.0),
            ("roomy", 180.0, 100.0),
            ("edge", 150.0, 41.5),
            ("wide", 260.0, 30.0),
        ],
    );
    let mut m = m;
    // The title slide's two texts were measured too.
    let first = b.deck().slides[0].id.clone();
    m.slides.insert(
        first.clone(),
        measured(b.deck()).slides.remove(&first).unwrap(),
    );
    let report = lint_deck_with(
        b.deck(),
        &Options {
            measures: Some(&m),
            refs: None,
        },
    );
    assert_eq!(
        found(&report),
        expect(&[
            ("text-overflow", Error, Some("tight")),
            ("text-overflow", Error, Some("wide")),
        ])
    );
    assert!(
        report.issues[0].message.contains("90") && report.issues[0].message.contains("40"),
        "{}",
        report.issues[0].message
    );
    assert!(
        report.issues[1].message.contains("word"),
        "{}",
        report.issues[1].message
    );
    let skipped: Vec<_> = report
        .skipped
        .iter()
        .map(|s| (s.rule.as_str(), s.reason.as_str()))
        .collect();
    assert_eq!(skipped.len(), 2, "{skipped:?}");
    assert_eq!(skipped[0].0, "text-overflow");
    assert!(
        skipped[0].1.contains("1 text element had no measurement"),
        "{}",
        skipped[0].1
    );
}

#[test]
fn text_overflow_uses_the_area_the_text_was_laid_out_in_and_allows_more_for_estimates() {
    let mut b = bench();
    b.add(json!([text("a", 100.0, 100.0, 300.0, 200.0, "words")]));
    let mut m = measures(&b.slide, &[("a", 100.0, 100.0)]);
    m.slides
        .get_mut(&b.slide)
        .unwrap()
        .get_mut("a")
        .unwrap()
        .area_height = Some(60.0);
    let first = b.deck().slides[0].id.clone();
    m.slides.insert(
        first.clone(),
        measured(b.deck()).slides.remove(&first).unwrap(),
    );
    let over = lint_deck_with(
        b.deck(),
        &Options {
            measures: Some(&m),
            refs: None,
        },
    );
    assert_eq!(found(&over), expect(&[("text-overflow", Error, Some("a"))]));
    m.estimated = true;
    // 100 in an area of 60 is 67% over: still an error, worded as a guess.
    let guessed = lint_deck_with(
        b.deck(),
        &Options {
            measures: Some(&m),
            refs: None,
        },
    );
    assert!(
        guessed.issues[0].message.contains("probably"),
        "{}",
        guessed.issues[0].message
    );
    m.slides
        .get_mut(&b.slide)
        .unwrap()
        .get_mut("a")
        .unwrap()
        .text_height = 70.0;
    let near = lint_deck_with(
        b.deck(),
        &Options {
            measures: Some(&m),
            refs: None,
        },
    );
    assert_eq!(
        found(&near),
        vec![],
        "17% over an estimate is within its slack"
    );
}

#[test]
fn min_font_wants_body_text_at_14_points_and_citations_at_8() {
    let mut b = bench();
    let cite = |id: &str, y: f64, size: f64| {
        json!({ "type": "text", "id": id, "x": 64, "y": y, "w": 400, "h": 30,
            "text": { "paragraphs": [{ "style": "citation", "runs": [{ "t": "Vaswani et al., 2017", "size": size }] }] } })
    };
    b.add(json!([
        styled("small", 64.0, 100.0, 300.0, 40.0, "ten point", json!({ "size": 10 })),
        styled("twelve", 64.0, 160.0, 300.0, 40.0, "twelve point", json!({ "size": 12 })),
        styled("fourteen", 64.0, 220.0, 300.0, 40.0, "fourteen point", json!({ "size": 14 })),
        json!({ "type": "text", "id": "caption", "x": 64, "y": 280, "w": 300, "h": 40,
            "text": { "paragraphs": [{ "style": "caption", "runs": [{ "t": "the caption style is 14" }] }] } }),
        cite("cite-small", 340.0, 7.0),
        cite("cite-eight", 380.0, 8.0),
        cite("cite-default", 420.0, 10.0),
    ]));
    let report = b.report();
    assert_eq!(
        found(&report),
        expect(&[
            ("min-font", Warning, Some("small")),
            ("min-font", Warning, Some("twelve")),
            ("min-font", Warning, Some("cite-small")),
        ])
    );
    assert!(
        report.issues[0].message.contains("10 pt") && report.issues[0].message.contains("14"),
        "{}",
        report.issues[0].message
    );
    assert!(
        report.issues[2].message.contains("citation"),
        "{}",
        report.issues[2].message
    );
}

#[test]
fn word_count_counts_the_words_of_a_slide_and_stops_at_sixty() {
    let mut b = bench();
    let words = |n: usize| vec!["word"; n].join(" ");
    b.add(json!([text("wall", 64.0, 60.0, 800.0, 400.0, &words(61))]));
    let (calm, _) = b.add_slide("blank", json!({}));
    b.engine
        .apply(
            "add_elements",
            json!({ "slide": calm, "elements": [text("sixty", 64.0, 60.0, 800.0, 400.0, &words(60))] }),
        )
        .unwrap();
    let report = b.report();
    assert_eq!(found(&report), expect(&[("word-count", Info, None)]));
    assert_eq!(report.issues[0].slide, b.slide);
    assert!(
        report.issues[0].message.contains("61"),
        "{}",
        report.issues[0].message
    );
}

#[test]
fn font_missing_names_families_that_are_not_a_role_or_bundled() {
    let mut b = bench();
    b.add(json!([
        styled(
            "comic",
            64.0,
            100.0,
            300.0,
            40.0,
            "Comic",
            json!({ "font": "Comic Sans MS" })
        ),
        styled(
            "inter",
            64.0,
            160.0,
            300.0,
            40.0,
            "Inter",
            json!({ "font": "Inter" })
        ),
        styled(
            "arial",
            64.0,
            220.0,
            300.0,
            40.0,
            "Arial",
            json!({ "font": "Arial" })
        ),
        styled(
            "role",
            64.0,
            280.0,
            300.0,
            40.0,
            "heading",
            json!({ "font": "heading" })
        ),
        styled(
            "georgia",
            64.0,
            340.0,
            300.0,
            40.0,
            "Georgia",
            json!({ "font": "Georgia" })
        ),
    ]));
    let report = b.report();
    assert_eq!(
        found(&report),
        expect(&[
            ("font-missing", Error, Some("comic")),
            ("font-missing", Error, Some("georgia")),
        ])
    );
    assert!(
        report.issues[0].message.contains("Comic Sans MS"),
        "{}",
        report.issues[0].message
    );
    assert!(
        report.issues[0]
            .hint
            .as_deref()
            .unwrap_or("")
            .contains("Inter")
    );
}
