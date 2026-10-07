//! Slides and decks that come from elsewhere: added after a slide or at the end, or put in the
//! place of the deck, each in one step to undo, alone or together with a collapse.

use serde_json::{Value, json};

use super::{add, bytes, engine, text_box};
use crate::model::Slide;
use crate::ops::Engine;

/// A slide as another deck holds it: made in a deck of its own, and taken out of it.
fn foreign(seed: u64, layout: &str, words: &[&str]) -> Slide {
    let mut other = Engine::create("Other", "Light", seed).unwrap_or_else(|e| panic!("{e}"));
    let slide = add(&mut other, layout, json!({ "title": "From elsewhere" }));
    for (i, w) in words.iter().enumerate() {
        text_box(
            &mut other,
            &slide,
            40.0 + 150.0 * i as f64,
            250.0,
            140.0,
            50.0,
            w,
        );
    }
    other
        .deck()
        .slide(&slide)
        .cloned()
        .unwrap_or_else(|| panic!("the slide is there"))
}

fn ids(e: &Engine) -> Vec<String> {
    e.deck().slides.iter().map(|s| s.id.clone()).collect()
}

#[test]
fn slides_from_elsewhere_go_after_the_named_slide_or_at_the_end() {
    let mut e = engine();
    let a = add(&mut e, "title-body", json!({ "title": "A" }));
    let b = add(&mut e, "title-body", json!({ "title": "B" }));
    let (one, two) = (
        foreign(11, "title-only", &["x"]),
        foreign(12, "title-only", &["y"]),
    );
    let out = e
        .apply("add_slides", json!({ "slides": [one, two], "after": a }))
        .unwrap_or_else(|err| panic!("{err}"));
    let made: Vec<String> =
        serde_json::from_value(out.output["slides"].clone()).unwrap_or_default();
    assert_eq!(made.len(), 2);
    let order = ids(&e);
    assert_eq!(order[2..4], made[..], "right after `a`");
    assert_eq!(order[4], b);
    assert_eq!(e.deck().slide(&made[0]).map(|s| s.elements.len()), Some(2));

    let three = foreign(13, "title-only", &[]);
    e.apply("add_slides", json!({ "slides": [three] }))
        .unwrap_or_else(|err| panic!("{err}"));
    assert_eq!(
        e.deck().slides.len(),
        6,
        "at the end when no slide is named"
    );
}

#[test]
fn a_taken_id_is_replaced_and_an_unknown_layout_is_refused_with_the_layouts_there_are() {
    let mut e = engine();
    let taken = e.deck().slides[0].id.clone();
    let mut slide = foreign(21, "title-only", &["x"]);
    slide.id = taken.clone();
    let out = e
        .apply("add_slides", json!({ "slides": [slide] }))
        .unwrap_or_else(|err| panic!("{err}"));
    let id = out.output["slides"][0]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    assert_ne!(id, taken);
    assert_eq!(e.deck().slides.iter().filter(|s| s.id == taken).count(), 1);

    let before = bytes(e.deck());
    let mut odd = foreign(22, "title-only", &[]);
    odd.layout = "no-such-layout".into();
    let err = e
        .apply("add_slides", json!({ "slides": [odd] }))
        .expect_err("refused")
        .to_string();
    assert!(
        err.contains("no-such-layout") && err.contains("title-body"),
        "{err}"
    );
    assert_eq!(bytes(e.deck()), before, "nothing changed");
    let err = e
        .apply("add_slides", json!({ "slides": [], "after": "s-nope" }))
        .expect_err("refused")
        .to_string();
    assert!(err.contains("s-nope"), "{err}");
}

#[test]
fn a_slide_added_first_is_never_a_backup_and_elements_keep_unique_ids() {
    let mut e = engine();
    let mut slide = foreign(31, "title-only", &["x", "y"]);
    slide.backup = true;
    // Two elements with one id, as a damaged file could make them.
    let first = slide.elements[0].id().to_owned();
    slide.elements[1].base_mut().id = first.clone();
    e.apply("add_slides", json!({ "slides": [slide] }))
        .unwrap_or_else(|err| panic!("{err}"));
    let added = e
        .deck()
        .slides
        .last()
        .cloned()
        .unwrap_or_else(|| panic!("a slide"));
    assert_eq!(
        added.elements.iter().filter(|el| el.id() == first).count(),
        1
    );
    assert!(
        e.deck()
            .slides
            .iter()
            .enumerate()
            .all(|(i, s)| i > 0 || !s.backup)
    );
}

#[test]
fn an_import_and_a_collapse_together_are_one_step() {
    let mut e = engine();
    let before = bytes(e.deck());
    let mut a = foreign(41, "title-only", &["one"]);
    let mut b = foreign(41, "title-only", &["one", "two"]);
    a.id = "s-aaaa0001".into();
    b.id = "s-aaaa0002".into();
    let batch: Vec<(String, Value)> = vec![
        ("add_slides".into(), json!({ "slides": [a, b] })),
        (
            "collapse_slides".into(),
            json!({ "slides": ["s-aaaa0001", "s-aaaa0002"] }),
        ),
    ];
    e.apply_batch(batch).unwrap_or_else(|err| panic!("{err}"));
    assert_eq!(e.deck().slides.len(), 2);
    assert_eq!(e.deck().slide("s-aaaa0001").map(|s| s.steps), Some(1));
    let after = bytes(e.deck());
    assert!(e.undo().is_some());
    assert_eq!(
        bytes(e.deck()),
        before,
        "one undo takes the whole import back"
    );
    assert!(!e.can_undo());
    assert!(e.redo().is_some());
    assert_eq!(bytes(e.deck()), after);
}

#[test]
fn a_deck_can_be_replaced_by_another_and_the_replacement_undone() {
    let mut e = engine();
    add(&mut e, "title-body", json!({ "title": "Mine" }));
    let id = e.deck().id.clone();
    let before = bytes(e.deck());

    let mut other = Engine::create("Theirs", "Serif", 51).unwrap_or_else(|err| panic!("{err}"));
    add(&mut other, "quote", json!({ "quote": "Words." }));
    let mut deck = other.deck().clone();
    deck.sections.push(crate::model::Section {
        title: "Part".into(),
        starts_at: deck.slides[1].id.clone(),
        extra: crate::model::Extra::new(),
    });
    deck.size = crate::model::Size {
        w: 720.0,
        h: 540.0,
        extra: crate::model::Extra::new(),
    };
    e.apply("replace_deck", json!({ "deck": deck }))
        .unwrap_or_else(|err| panic!("{err}"));
    let now = e.deck();
    assert_eq!(
        (
            now.title.as_str(),
            now.theme.name.as_str(),
            now.slides.len()
        ),
        ("Theirs", "Serif", 2)
    );
    assert_eq!(
        (now.size.w, now.size.h, now.sections.len()),
        (720.0, 540.0, 1)
    );
    assert_eq!(now.id, id, "the deck keeps its own id");
    let after = bytes(now);

    assert!(e.undo().is_some());
    assert_eq!(bytes(e.deck()), before);
    assert!(e.redo().is_some());
    assert_eq!(bytes(e.deck()), after);
}

#[test]
fn a_deck_that_breaks_the_format_or_has_no_slide_does_not_replace_anything() {
    let mut e = engine();
    let before = bytes(e.deck());
    let mut broken = engine().deck().clone();
    broken.slides[0].layout = "nowhere".into();
    let err = e
        .apply("replace_deck", json!({ "deck": broken }))
        .expect_err("refused")
        .to_string();
    assert!(err.contains("nowhere"), "{err}");
    let mut empty = engine().deck().clone();
    empty.slides.clear();
    assert!(e.apply("replace_deck", json!({ "deck": empty })).is_err());
    assert_eq!(bytes(e.deck()), before);
}
