//! Words that may be broken anywhere: a web address in an embedded page's panel, an address in
//! prose, a word in the code font. A renderer breaks them wherever they must be, so they cost
//! height, never width; a word of prose that is too wide for its box is still a fault.

use serde_json::json;

use super::{bench, of_rule, text};
use crate::lint::estimate;
use crate::lint::texts::{breaks_anywhere, with_breaks};
use crate::lint::{Options, lint_deck_with, probes};

const LONG_ADDRESS: &str =
    "https://example.com/documentation/guides/getting-started/installation/index.html";

/// The `text-overflow` issues of the deck with its text sizes estimated.
fn overflows(b: &super::Bench) -> Vec<(String, String)> {
    let measures = estimate::measures(b.deck());
    let report = lint_deck_with(
        b.deck(),
        &Options {
            measures: Some(&measures),
            refs: None,
        },
    );
    of_rule(&report, "text-overflow")
        .into_iter()
        .map(|i| (i.element.clone().unwrap_or_default(), i.message.clone()))
        .collect()
}

#[test]
fn an_embedded_page_with_a_long_address_is_not_an_overflow_at_any_size() {
    for (w, h) in [(200.0_f64, 130.0_f64), (320.0, 180.0), (640.0, 360.0)] {
        let mut b = bench();
        b.add(json!([
            { "type": "embed", "id": "page", "x": 60, "y": 100, "w": w, "h": h, "url": LONG_ADDRESS },
            { "type": "video", "id": "clip", "x": 500, "y": 100, "w": w.min(400.0), "h": h.min(240.0), "src": "assets/clips/a-very-long-file-name-for-a-video-that-goes-on-and-on.mp4" },
        ]));
        assert_eq!(overflows(&b), vec![], "{w} by {h}");
    }
}

#[test]
fn the_address_in_a_panel_is_offered_to_the_page_with_breaks_and_its_title_is_not() {
    let mut b = bench();
    b.add(json!([
        { "type": "embed", "id": "page", "x": 60, "y": 100, "w": 200, "h": 130, "url": LONG_ADDRESS },
    ]));
    let listed = probes(b.deck(), &b.slide).unwrap();
    let with_narrow: Vec<_> = listed
        .iter()
        .flat_map(|p| p.parts.iter())
        .filter(|part| part.narrow.is_some())
        .collect();
    assert_eq!(with_narrow.len(), 1, "only the address: {listed:?}");
    let part = with_narrow[0];
    let plain = part.text.plain_text();
    assert!(
        plain.starts_with("https://example")
            && plain.ends_with("index.html")
            && !plain.contains('\u{200b}'),
        "{plain}"
    );
    let narrow = part.narrow.as_ref().unwrap().plain_text();
    assert_eq!(narrow.replace('\u{200b}', ""), plain, "the same words");
    assert!(
        narrow.matches('\u{200b}').count() >= plain.chars().count() - 3,
        "a break between characters"
    );
}

#[test]
fn a_word_of_prose_that_is_too_wide_is_still_an_overflow() {
    let mut b = bench();
    b.add(json!([super::styled(
        "long",
        60.0,
        100.0,
        120.0,
        200.0,
        "Supercalifragilisticexpialidocious",
        json!({ "size": 24 })
    ),]));
    let found = overflows(&b);
    assert_eq!(found.len(), 1, "{found:?}");
    assert!(found[0].1.contains("has a word"), "{}", found[0].1);
    // And the probe has nothing to add for it.
    let listed = probes(b.deck(), &b.slide).unwrap();
    assert!(listed[0].parts[0].narrow.is_none());
}

#[test]
fn an_address_in_a_sentence_and_a_word_in_the_code_font_are_broken_not_flagged() {
    let mut b = bench();
    b.add(json!([
        text("prose", 60.0, 100.0, 260.0, 260.0, "See https://example.com/docs/guides/getting-started/installation/index.html for details"),
        json!({ "type": "text", "id": "code", "x": 400, "y": 100, "w": 200, "h": 140,
            "text": { "paragraphs": [{ "runs": [{ "t": "call ", "size": 18 }, { "t": "get_the_current_weather_for_a_city", "size": 18, "code": true }] }] } }),
    ]));
    let found = overflows(&b);
    assert!(
        found
            .iter()
            .all(|(_, message)| !message.contains("has a word")),
        "no word is too wide when it may be broken: {found:?}"
    );
    // The box is tall enough for the lines they take.
    assert_eq!(found, vec![], "{found:?}");
    let listed = probes(b.deck(), &b.slide).unwrap();
    assert!(
        listed.iter().all(|p| p.parts[0].narrow.is_some()),
        "{listed:?}"
    );
}

#[test]
fn which_words_may_be_broken_anywhere() {
    for word in [
        "https://example.com",
        "http://a.b/c",
        "www.example.com",
        "me@example.com",
        "src/lib/deck/model.rs",
    ] {
        assert!(breaks_anywhere(word, false), "{word}");
    }
    for word in [
        "",
        "word",
        "well-known",
        "and/or",
        "e.g.",
        "3.14",
        "user@home",
        "a@b",
    ] {
        assert!(!breaks_anywhere(word, false), "{word:?}");
    }
    assert!(breaks_anywhere("anything", true), "a word in the code font");
    assert!(!breaks_anywhere("", true), "nothing to break");
}

#[test]
fn breaks_are_put_between_characters_of_such_words_only_and_the_words_are_kept() {
    let theme = crate::themes::light();
    let text = crate::model::Text::plain("visit https://a.io/b/c now\nsecond line");
    let copy = with_breaks(&theme, "body", &text).expect("an address is in it");
    let plain = copy.plain_text();
    assert_eq!(plain.replace('\u{200b}', ""), text.plain_text());
    assert!(
        plain.starts_with("visit h\u{200b}t\u{200b}t\u{200b}p"),
        "{plain:?}"
    );
    assert!(
        plain.ends_with(" now\nsecond line"),
        "words around it are as they were: {plain:?}"
    );
    assert!(
        with_breaks(
            &theme,
            "body",
            &crate::model::Text::plain("just plain words")
        )
        .is_none()
    );
}
