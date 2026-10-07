//! The rules about where things are: off-slide, margin, overlap and
//! near-miss-align.

use serde_json::json;

use super::{Bench, bench, expect, found, image, of_rule, shape, text};
use crate::lint::Severity::{Error, Info, Warning};

fn ids(b: &Bench) -> Vec<String> {
    b.deck()
        .slide(&b.slide)
        .unwrap()
        .elements
        .iter()
        .map(|e| e.id().to_owned())
        .collect()
}

#[test]
fn off_slide_finds_what_sticks_out_unless_it_bleeds() {
    let mut b = bench();
    let mut named = shape("named", "rect", -30.0, 300.0, 100.0, 100.0, "accent1");
    named["name"] = json!("bleed");
    b.add(json!([
        text("inside", 100.0, 100.0, 300.0, 60.0, "fits"),
        text("right", 800.0, 200.0, 200.0, 60.0, "too far right"),
        image(
            "backdrop",
            -20.0,
            -20.0,
            1000.0,
            580.0,
            Some("A picture behind everything")
        ),
        named,
        shape("bottom", "rect", 300.0, 480.0, 100.0, 100.0, "accent2"),
    ]));
    assert_eq!(
        found(&b.report()),
        expect(&[
            ("off-slide", Error, Some("right")),
            ("off-slide", Error, Some("bottom")),
        ])
    );
    let report = b.report();
    let right = &of_rule(&report, "off-slide")[0];
    assert!(
        right.message.contains("right edge") && right.message.contains("40"),
        "{}",
        right.message
    );
    assert!(
        of_rule(&report, "off-slide")[1]
            .message
            .contains("bottom edge")
    );
    assert_eq!(ids(&b).len(), 5);
}

#[test]
fn off_slide_follows_the_size_of_the_deck_and_the_turn_of_an_element() {
    let mut b = bench();
    // 300 by 40, turned a quarter: it is 40 wide and 300 tall about its centre, so it fits.
    let mut turned = text("turned", 470.0, 250.0, 300.0, 40.0, "turned");
    turned["rotation"] = json!(90);
    b.add(json!([turned]));
    assert_eq!(found(&b.report()), vec![]);
    let small = b.changed(|deck| {
        deck.size.w = 720.0;
        deck.size.h = 405.0;
    });
    let report = super::lint_deck(&small, None);
    assert!(
        of_rule(&report, "off-slide")
            .iter()
            .any(|i| i.element.as_deref() == Some("turned"))
    );
}

#[test]
fn margin_finds_content_too_close_to_an_edge_except_full_bleed() {
    let mut b = bench();
    b.add(json!([
        shape("wash", "rect", 0.0, 0.0, 960.0, 540.0, "bg2"),
        text("edge", 10.0, 100.0, 200.0, 60.0, "near the left edge"),
        text("low", 100.0, 500.0, 200.0, 30.0, "near the bottom"),
        text("fine", 64.0, 200.0, 300.0, 60.0, "a comfortable margin"),
    ]));
    assert_eq!(
        found(&b.report()),
        expect(&[
            ("margin", Warning, Some("edge")),
            ("margin", Warning, Some("low")),
        ])
    );
    let report = b.report();
    assert!(
        report.issues[0].message.contains("left"),
        "{}",
        report.issues[0].message
    );
    assert!(
        report.issues[1].message.contains("bottom"),
        "{}",
        report.issues[1].message
    );
}

#[test]
fn a_thing_that_sticks_out_is_an_error_not_also_a_margin_warning() {
    let mut b = bench();
    b.add(json!([text("out", 900.0, 100.0, 100.0, 40.0, "out")]));
    assert_eq!(
        found(&b.report()),
        expect(&[("off-slide", Error, Some("out"))])
    );
}

#[test]
fn overlap_finds_text_on_text_and_text_on_a_shape_it_does_not_belong_to() {
    let mut b = bench();
    b.add(json!([
        text("alpha", 100.0, 100.0, 200.0, 100.0, "Alpha"),
        text("beta", 250.0, 150.0, 200.0, 100.0, "Beta"),
        // A card with its words inside is one thing.
        shape("card", "roundRect", 580.0, 80.0, 240.0, 100.0, "bg2"),
        text("in-card", 600.0, 100.0, 200.0, 60.0, "Inside the card"),
        // A shape under the corner of a text box is not.
        shape("panel", "rect", 100.0, 300.0, 200.0, 80.0, "accent3"),
        text("on-panel", 250.0, 340.0, 200.0, 60.0, "Half on a panel"),
        // Edges that touch do not overlap.
        text("left", 100.0, 430.0, 100.0, 40.0, "left"),
        text("right", 200.0, 430.0, 100.0, 40.0, "right"),
    ]));
    let report = b.report();
    assert_eq!(
        found(&report),
        expect(&[
            ("overlap", Warning, Some("alpha")),
            ("overlap", Warning, Some("on-panel")),
        ])
    );
    assert!(
        report.issues[0].message.contains("Beta"),
        "{}",
        report.issues[0].message
    );
    assert!(
        report.issues[1].message.contains("panel"),
        "{}",
        report.issues[1].message
    );
}

#[test]
fn members_of_a_group_and_things_that_never_show_together_may_overlap() {
    let mut b = bench();
    b.add(json!([
        text("one", 500.0, 300.0, 100.0, 60.0, "one"),
        text("two", 550.0, 320.0, 100.0, 60.0, "two"),
        text("before", 100.0, 100.0, 200.0, 60.0, "before"),
        text("after", 150.0, 120.0, 200.0, 60.0, "after"),
    ]));
    b.engine
        .apply(
            "group_elements",
            json!({ "slide": b.slide, "ids": ["one", "two"] }),
        )
        .unwrap();
    let deck = b.changed(|deck| {
        let slide = deck.slide_mut(&b.slide).unwrap();
        slide.steps = 1;
        for e in &mut slide.elements {
            match e.id() {
                "before" => {
                    e.base_mut()
                        .step_states
                        .insert(1, crate::model::StepState::Hidden);
                }
                "after" => {
                    e.base_mut()
                        .step_states
                        .insert(0, crate::model::StepState::Hidden);
                    e.base_mut()
                        .step_states
                        .insert(1, crate::model::StepState::Normal);
                }
                _ => {}
            }
        }
    });
    assert_eq!(found(&super::lint_deck(&deck, None)), vec![]);
    // Without the steps they would be there together.
    let together = b.changed(|deck| deck.slide_mut(&b.slide).unwrap().steps = 0);
    assert_eq!(
        found(&super::lint_deck(&together, None)),
        expect(&[("overlap", Warning, Some("before"))])
    );
}

#[test]
fn near_miss_align_finds_edges_a_few_units_apart_and_says_where_to_put_them() {
    let mut b = bench();
    b.add(json!([
        text("first", 64.0, 100.0, 300.0, 50.0, "first"),
        text("second", 67.0, 200.0, 350.0, 50.0, "second"),
        text("third", 64.0, 300.0, 300.0, 50.0, "third"),
        // Seven units off is a choice, not a slip.
        text("far", 71.0, 400.0, 200.0, 50.0, "far"),
        // A text set in from its card is padding.
        shape("card", "roundRect", 500.0, 100.0, 300.0, 200.0, "bg2"),
        text("padded", 505.0, 110.0, 290.0, 50.0, "padded"),
    ]));
    let report = b.report();
    assert_eq!(
        found(&report),
        expect(&[("near-miss-align", Info, Some("second"))])
    );
    let issue = &report.issues[0];
    assert!(issue.message.contains("left"), "{}", issue.message);
    assert!(
        issue.hint.as_deref().unwrap_or("").contains("64"),
        "{:?}",
        issue.hint
    );
}
