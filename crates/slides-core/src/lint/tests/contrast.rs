//! The contrast rule.

use serde_json::json;

use super::{bench, expect, found, of_rule, shape, styled, text};
use crate::lint::Severity::Warning;

#[test]
fn contrast_measures_text_against_its_own_fill_or_the_shape_under_it_or_the_slide() {
    let mut b = bench();
    let mut on_fill = styled(
        "on-fill-bad",
        64.0,
        180.0,
        300.0,
        40.0,
        "white on yellow",
        json!({ "color": "bg1" }),
    );
    on_fill["style"] = json!({ "fill": { "color": "accent3" } });
    b.add(json!([
        styled(
            "pale",
            64.0,
            100.0,
            300.0,
            40.0,
            "pale grey on white",
            json!({ "color": "#cccccc" })
        ),
        text("fine", 400.0, 100.0, 300.0, 40.0, "ordinary text"),
        on_fill,
        shape("card", "roundRect", 64.0, 260.0, 300.0, 100.0, "#0b3d91"),
        styled(
            "on-card-good",
            84.0,
            280.0,
            260.0,
            60.0,
            "white on navy",
            json!({ "color": "bg1" })
        ),
        shape("card2", "roundRect", 400.0, 260.0, 300.0, 100.0, "#0b3d91"),
        styled(
            "on-card-bad",
            420.0,
            280.0,
            260.0,
            60.0,
            "navy on navy",
            json!({ "color": "#0b4da1" })
        ),
        styled(
            "small-grey",
            64.0,
            400.0,
            300.0,
            40.0,
            "grey, twenty-two point",
            json!({ "color": "#949494" })
        ),
        styled(
            "large-grey",
            400.0,
            400.0,
            300.0,
            50.0,
            "grey, twenty-eight point",
            json!({ "color": "#949494", "size": 28 })
        ),
    ]));
    let report = b.report();
    assert_eq!(
        found(&report),
        expect(&[
            ("contrast", Warning, Some("pale")),
            ("contrast", Warning, Some("on-fill-bad")),
            ("contrast", Warning, Some("on-card-bad")),
            ("contrast", Warning, Some("small-grey")),
        ])
    );
    let pale = &report.issues[0].message;
    assert!(
        pale.contains("#cccccc") && pale.contains("#ffffff") && pale.contains("4.5"),
        "{pale}"
    );
}

#[test]
fn contrast_follows_the_theme_a_deck_is_in() {
    let mut b = bench();
    b.add(json!([text(
        "plain",
        64.0,
        100.0,
        300.0,
        40.0,
        "theme ink on theme paper"
    )]));
    b.engine
        .apply("apply_theme", json!({ "name": "Dark" }))
        .unwrap();
    assert_eq!(b.report().issues, vec![]);
    let mut wrong = b.deck().clone();
    wrong.theme.colors.text1 = "#111111".to_owned();
    let report = crate::lint::lint_deck(&wrong, None);
    assert!(
        of_rule(&report, "contrast").len() >= 2,
        "dark ink on the dark theme's paper"
    );
}
