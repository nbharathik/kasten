//! The size of laid-out text, which lint needs to tell text that fits its box from text that does not.

mod common;

use common::{deck, one_at_a_time, renderer};
use serde_json::json;
use slides_core::Engine;
use slides_core::lint::{Options, lint_deck_with};
use slides_render::Options as RenderOptions;

fn text(id: &str, x: f64, y: f64, w: f64, h: f64, words: &str) -> serde_json::Value {
    json!({ "type": "text", "id": id, "x": x, "y": y, "w": w, "h": h, "text": { "paragraphs": [{ "runs": [{ "t": words }] }] } })
}

/// The fixture title deck and a blank slide with three boxes: one whose words are too tall for it, one whose
/// one word is wider than it, and one with room to spare.
fn broken_deck() -> slides_core::Deck {
    let mut engine = Engine::new(deck("minimal.deck"), 5);
    let slide = engine
        .apply("add_slide", json!({ "layout": "blank" }))
        .unwrap_or_else(|e| panic!("{e}"))
        .output["slide"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    let elements = json!([
        text(
            "tall",
            100.0,
            100.0,
            200.0,
            40.0,
            "Far too many words for a box that is only forty units high and two hundred wide"
        ),
        text(
            "wide",
            100.0,
            200.0,
            60.0,
            80.0,
            "Supercalifragilisticexpialidocious"
        ),
        text(
            "roomy",
            100.0,
            320.0,
            500.0,
            120.0,
            "Plenty of room for these few words"
        ),
    ]);
    engine
        .apply(
            "add_elements",
            json!({ "slide": slide, "elements": elements }),
        )
        .unwrap_or_else(|e| panic!("{e}"));
    engine.deck().clone()
}

#[test]
fn text_that_overflows_its_box_is_found_from_what_the_browser_measured() {
    let _one = one_at_a_time();
    let Some(renderer) = renderer(RenderOptions::default()) else {
        return;
    };
    let broken = broken_deck();
    let measures = renderer.measure(&broken).unwrap_or_else(|e| panic!("{e}"));
    assert!(!measures.estimated);
    let slide = &broken.slides[1].id;
    let sizes = measures
        .slides
        .get(slide)
        .unwrap_or_else(|| panic!("the blank slide was measured"));
    let (tall, wide, roomy) = (&sizes["tall"], &sizes["wide"], &sizes["roomy"]);
    assert!(tall.text_height > 40.0, "{tall:?}");
    assert!(
        wide.text_width > 60.0,
        "one long word is wider than its box: {wide:?}"
    );
    assert!(
        roomy.text_height < 120.0 && roomy.text_width < 500.0,
        "{roomy:?}"
    );

    let report = lint_deck_with(
        &broken,
        &Options {
            measures: Some(&measures),
            refs: None,
        },
    );
    let mut overflowing: Vec<&str> = report
        .issues
        .iter()
        .filter(|i| i.rule == "text-overflow")
        .filter_map(|i| i.element.as_deref())
        .collect();
    overflowing.sort_unstable();
    assert_eq!(overflowing, ["tall", "wide"], "{:#?}", report.issues);
    assert!(
        !report.skipped.iter().any(|s| s.rule == "text-overflow"),
        "every text element was measured: {:?}",
        report.skipped
    );

    // A deck whose text fits gives no overflow.
    let fine = deck("minimal.deck");
    let measures = renderer.measure(&fine).unwrap_or_else(|e| panic!("{e}"));
    let report = lint_deck_with(
        &fine,
        &Options {
            measures: Some(&measures),
            refs: None,
        },
    );
    assert!(
        report.issues.iter().all(|i| i.rule != "text-overflow"),
        "{:#?}",
        report.issues
    );
}

#[test]
fn every_text_of_every_fixture_deck_is_measured() {
    let _one = one_at_a_time();
    let Some(renderer) = renderer(RenderOptions::default()) else {
        return;
    };
    for name in [
        "composites.deck",
        "text-heavy.deck",
        "shapes.deck",
        "four-three.deck",
    ] {
        let deck = deck(name);
        let started = std::time::Instant::now();
        let measures = renderer
            .measure(&deck)
            .unwrap_or_else(|e| panic!("{name}: {e}"));
        eprintln!(
            "measure {name}: {:?}, {} slides with text",
            started.elapsed(),
            measures.slides.len()
        );
        let report = lint_deck_with(
            &deck,
            &Options {
                measures: Some(&measures),
                refs: None,
            },
        );
        assert!(
            !report.skipped.iter().any(|s| s.rule == "text-overflow"),
            "{name}: {:?}",
            report.skipped
        );
        for (slide, sizes) in &measures.slides {
            for (id, size) in sizes {
                assert!(
                    size.text_height.is_finite() && size.text_width.is_finite(),
                    "{name} {slide} {id}: {size:?}"
                );
                assert!(
                    size.text_height > 0.0,
                    "{name} {slide} {id}: an element with words has height: {size:?}"
                );
            }
        }
    }
}
