//! Collapsing similar slides: a run of copies that each add or change a little becomes one slide
//! with a step for each copy, and the steps show what the copies showed.

use proptest::prelude::*;
use serde_json::{Value, json};

use super::{add, bytes, engine, text_box};
use crate::model::{Element, Slide, StepState};
use crate::ops::{Engine, similar_runs};

/// A slide with a title and one text box for each of `words`, in a row.
fn build(e: &mut Engine, words: &[&str]) -> String {
    let slide = add(e, "title-only", json!({ "title": "A build" }));
    for (i, w) in words.iter().enumerate() {
        text_box(e, &slide, 40.0 + 150.0 * i as f64, 200.0, 140.0, 60.0, w);
    }
    slide
}

fn words(el: &Element) -> String {
    el.text().map(|t| t.plain_text()).unwrap_or_default()
}

/// What shows at a step of a slide, in stacking order.
fn shown(slide: &Slide, step: u32) -> Vec<String> {
    slide
        .elements
        .iter()
        .filter(|el| el.base().state_at(step) != StepState::Hidden)
        .map(words)
        .collect()
}

fn collapse(e: &mut Engine, slides: &[&String]) -> Value {
    e.apply("collapse_slides", json!({ "slides": slides }))
        .unwrap_or_else(|err| panic!("{err}"))
        .output
}

#[test]
fn copies_that_each_add_a_box_become_one_slide_that_builds() {
    let mut e = engine();
    let a = build(&mut e, &["one"]);
    let b = build(&mut e, &["one", "two"]);
    let c = build(&mut e, &["one", "two", "three"]);
    let before = e.deck().slides.len();
    let out = collapse(&mut e, &[&a, &b, &c]);
    assert_eq!(out["slide"], json!(a));
    assert_eq!(out["steps"], json!(2));
    assert_eq!(e.deck().slides.len(), before - 2);

    let merged = e
        .deck()
        .slide(&a)
        .unwrap_or_else(|| panic!("the first slide stays"));
    assert_eq!(merged.steps, 2);
    assert_eq!(shown(merged, 0), ["A build", "one"]);
    assert_eq!(shown(merged, 1), ["A build", "one", "two"]);
    assert_eq!(shown(merged, 2), ["A build", "one", "two", "three"]);
    // What every copy had has no states; what came later is hidden until its step.
    let by_words = |w: &str| {
        merged
            .elements
            .iter()
            .find(|el| words(el) == w)
            .map(|el| el.base().step_states.clone())
    };
    assert_eq!(by_words("A build"), Some(Default::default()));
    assert_eq!(by_words("one"), Some(Default::default()));
    assert_eq!(
        by_words("two"),
        Some(
            [(0, StepState::Hidden), (1, StepState::Normal)]
                .into_iter()
                .collect()
        )
    );
    assert_eq!(
        by_words("three"),
        Some(
            [(0, StepState::Hidden), (2, StepState::Normal)]
                .into_iter()
                .collect()
        )
    );
    assert!(e.deck().slide(&b).is_none() && e.deck().slide(&c).is_none());
}

#[test]
fn an_element_that_changes_is_shown_in_its_slides_and_in_no_other() {
    let mut e = engine();
    let a = build(&mut e, &["draft", "fixed"]);
    let b = build(&mut e, &["review", "fixed"]);
    let c = build(&mut e, &["draft", "fixed"]);
    collapse(&mut e, &[&a, &b, &c]);
    let merged = e
        .deck()
        .slide(&a)
        .unwrap_or_else(|| panic!("the first slide stays"));
    for (step, want) in [
        (0, ["draft", "fixed"]),
        (1, ["review", "fixed"]),
        (2, ["draft", "fixed"]),
    ] {
        let mut got = shown(merged, step);
        got.retain(|w| w != "A build");
        got.sort();
        let mut want = want.to_vec();
        want.sort();
        assert_eq!(got, want, "step {step}");
    }
    // The element that comes and goes and comes back has a state for each turn.
    let draft = merged
        .elements
        .iter()
        .find(|el| words(el) == "draft")
        .map(|el| el.base().step_states.clone());
    assert_eq!(
        draft,
        Some(
            [(1, StepState::Hidden), (2, StepState::Normal)]
                .into_iter()
                .collect()
        )
    );
}

#[test]
fn elements_with_the_same_words_a_little_moved_are_the_same_element() {
    let mut e = engine();
    let a = build(&mut e, &["steady"]);
    let b = build(&mut e, &["steady", "new"]);
    // On the second slide the same box has moved a unit and a half.
    let id = e
        .deck()
        .slide(&b)
        .and_then(|s| {
            s.elements
                .iter()
                .find(|el| words(el) == "steady")
                .map(|el| el.id().to_owned())
        })
        .unwrap_or_default();
    e.apply(
        "transform_elements",
        json!({ "slide": b, "items": [{ "id": id, "x": 41.5 }] }),
    )
    .unwrap_or_else(|err| panic!("{err}"));
    collapse(&mut e, &[&a, &b]);
    let merged = e
        .deck()
        .slide(&a)
        .unwrap_or_else(|| panic!("the first slide stays"));
    assert_eq!(
        merged
            .elements
            .iter()
            .filter(|el| words(el) == "steady")
            .count(),
        1
    );
}

#[test]
fn notes_sections_and_links_follow_the_slides_that_go() {
    let mut e = engine();
    let a = build(&mut e, &["one"]);
    let b = build(&mut e, &["one", "two"]);
    let c = build(&mut e, &["one", "two", "three"]);
    let after = build(&mut e, &["later"]);
    for (slide, notes) in [(&a, "Say one."), (&b, "Say one.\n\nThen two."), (&c, "")] {
        e.apply("set_notes", json!({ "slide": slide, "notes": notes }))
            .unwrap_or_else(|err| panic!("{err}"));
    }
    // A section starts at the middle slide, and a link on a later slide goes to the last one.
    let mut deck = e.deck().clone();
    deck.sections.push(crate::model::Section {
        title: "Middle".into(),
        starts_at: b.clone(),
        extra: crate::model::Extra::new(),
    });
    let link_holder = deck
        .slide(&after)
        .map(|s| s.elements[0].id().to_owned())
        .unwrap_or_default();
    if let Some(el) = deck
        .slide_mut(&after)
        .and_then(|s| s.element_mut(&link_holder))
    {
        el.base_mut().link = Some(format!("slide:{c}"));
    }
    let mut e = Engine::new(deck, 7);
    collapse(&mut e, &[&a, &b, &c]);
    let merged = e
        .deck()
        .slide(&a)
        .unwrap_or_else(|| panic!("the first slide stays"));
    assert_eq!(
        merged.notes, "Say one.\n\nThen two.",
        "each paragraph once, in order"
    );
    assert_eq!(
        e.deck().sections[0].starts_at,
        after,
        "the section begins at the next slide left"
    );
    let link = e
        .deck()
        .slide(&after)
        .and_then(|s| s.element(&link_holder))
        .and_then(|el| el.base().link.clone());
    assert_eq!(link, Some(format!("slide:{a}")));
}

#[test]
fn it_refuses_what_it_cannot_do_and_changes_nothing() {
    let mut e = engine();
    let a = build(&mut e, &["one"]);
    let b = build(&mut e, &["one", "two"]);
    let c = build(&mut e, &["one", "three"]);
    let first = e.deck().slides[0].id.clone();
    let before = bytes(e.deck());
    let refuse = |e: &mut Engine, ids: Vec<&str>| {
        e.apply("collapse_slides", json!({ "slides": ids }))
            .expect_err("refused")
            .to_string()
    };
    assert!(refuse(&mut e, vec![&a]).contains("at least two"));
    assert!(refuse(&mut e, vec![&a, &c]).contains("follow each other"));
    assert!(refuse(&mut e, vec![&b, &a]).contains("follow each other"));
    assert!(refuse(&mut e, vec![&a, "s-nope"]).contains("s-nope"));
    assert!(refuse(&mut e, vec![&first, &a]).contains("same layout"));
    e.apply("set_slide_steps", json!({ "slide": b, "steps": 1 }))
        .unwrap_or_else(|err| panic!("{err}"));
    let mid = bytes(e.deck());
    assert!(refuse(&mut e, vec![&a, &b]).contains("steps"));
    e.apply("set_slide_steps", json!({ "slide": b, "steps": 0 }))
        .unwrap_or_else(|err| panic!("{err}"));
    e.apply("set_slide_flags", json!({ "ids": [c], "hidden": true }))
        .unwrap_or_else(|err| panic!("{err}"));
    assert!(refuse(&mut e, vec![&b, &c]).contains("hidden"));
    assert_ne!(before, mid);
    assert_eq!(e.deck().slides.len(), 4);
}

#[test]
fn one_undo_puts_the_copies_back_exactly_and_redo_collapses_again() {
    let mut e = engine();
    let a = build(&mut e, &["one"]);
    let b = build(&mut e, &["one", "two"]);
    let c = build(&mut e, &["one", "two", "three"]);
    let before = bytes(e.deck());
    collapse(&mut e, &[&a, &b, &c]);
    let after = bytes(e.deck());
    assert_ne!(before, after);
    assert!(e.undo().is_some());
    assert_eq!(bytes(e.deck()), before);
    assert!(e.redo().is_some());
    assert_eq!(bytes(e.deck()), after);
}

/// A slide with `n` boxes of words, and `changed` of them different.
fn slide_of(e: &mut Engine, n: usize, changed: &[usize], tag: &str) -> String {
    let slide = add(e, "title-only", json!({ "title": "Same title" }));
    for i in 0..n {
        let w = if changed.contains(&i) {
            format!("{tag} {i}")
        } else {
            format!("box {i}")
        };
        text_box(e, &slide, 40.0 + 90.0 * i as f64, 200.0, 80.0, 40.0, &w);
    }
    slide
}

#[test]
fn slides_that_repeat_nearly_all_of_each_other_form_a_run() {
    let mut e = engine();
    let title = e.deck().slides[0].id.clone();
    // Five boxes and a title; the second box changes each time: 5 of 6 are the same.
    let a = slide_of(&mut e, 5, &[], "a");
    let b = slide_of(&mut e, 5, &[1], "b");
    let c = slide_of(&mut e, 5, &[1], "c");
    // Then a slide that shares little, and a copy of it with a little changed.
    let x = slide_of(&mut e, 2, &[], "x");
    let y = slide_of(&mut e, 2, &[0], "y");
    let deck = e.deck();
    let at = |id: &String| deck.index_of(id).unwrap_or(usize::MAX);
    let runs = similar_runs(deck);
    assert_eq!(
        runs,
        vec![vec![at(&a), at(&b), at(&c)]],
        "{runs:?} (title slide {})",
        at(&title)
    );
    assert!(
        runs.iter().flatten().all(|i| *i != at(&x) && *i != at(&y)),
        "two boxes and a title change too much"
    );
}

#[test]
fn a_copy_that_changes_nothing_or_differs_in_layout_flags_or_steps_is_not_a_build() {
    let mut e = engine();
    let a = slide_of(&mut e, 6, &[], "a");
    let same = slide_of(&mut e, 6, &[], "a");
    let other = slide_of(&mut e, 6, &[0], "o");
    let deck = e.deck().clone();
    assert!(
        similar_runs(&deck)
            .iter()
            .all(|r| !(r.contains(&deck.index_of(&a).unwrap_or(0))
                && r.contains(&deck.index_of(&same).unwrap_or(0))
                && r.len() == 2
                && !r.contains(&deck.index_of(&other).unwrap_or(0)))),
        "a plain copy is not a build"
    );

    let mut hidden = deck.clone();
    if let Some(s) = hidden.slide_mut(&other) {
        s.hidden = true;
    }
    assert!(
        similar_runs(&hidden)
            .iter()
            .all(|r| !r.contains(&hidden.index_of(&other).unwrap_or(usize::MAX)))
    );
    let mut stepped = deck.clone();
    if let Some(s) = stepped.slide_mut(&other) {
        s.steps = 1;
    }
    assert!(
        similar_runs(&stepped)
            .iter()
            .all(|r| !r.contains(&stepped.index_of(&other).unwrap_or(usize::MAX)))
    );
    let mut layout = deck.clone();
    if let Some(s) = layout.slide_mut(&other) {
        s.layout = "blank".into();
    }
    assert!(
        similar_runs(&layout)
            .iter()
            .all(|r| !r.contains(&layout.index_of(&other).unwrap_or(usize::MAX)))
    );
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(48))]

    /// Whatever the copies hold, the steps of the merged slide show what each copy showed, in the same
    /// stacking order, and one undo brings every copy back.
    #[test]
    fn every_step_shows_what_its_slide_showed_and_undo_brings_the_copies_back(
        picks in prop::collection::vec(1u8..64, 2..7),
        seed in 1u64..1000,
    ) {
        let mut e = Engine::create("Property", "Light", seed).unwrap_or_else(|err| panic!("{err}"));
        let mut ids = Vec::new();
        for pick in &picks {
            let slide = add(&mut e, "title-only", json!({ "title": "T" }));
            for i in 0..6usize {
                if pick & (1 << i) != 0 {
                    text_box(&mut e, &slide, 20.0 + 150.0 * i as f64, 200.0, 140.0, 50.0, &format!("item {i}"));
                }
            }
            ids.push(slide);
        }
        let originals: Vec<Vec<String>> = ids
            .iter()
            .map(|id| e.deck().slide(id).map(|s| shown(s, 0)).unwrap_or_default())
            .collect();
        let before = bytes(e.deck());
        let refs: Vec<&String> = ids.iter().collect();
        collapse(&mut e, &refs);
        let after = bytes(e.deck());
        let merged = e.deck().slide(&ids[0]).unwrap_or_else(|| panic!("the first slide stays"));
        prop_assert_eq!(merged.steps as usize, picks.len() - 1);
        for (step, original) in originals.iter().enumerate() {
            prop_assert_eq!(&shown(merged, step as u32), original, "step {}", step);
        }
        prop_assert_eq!(e.deck().slides.len(), 2, "the title slide and the merged one");
        prop_assert!(e.undo().is_some());
        prop_assert_eq!(bytes(e.deck()), before);
        prop_assert!(e.redo().is_some());
        prop_assert_eq!(bytes(e.deck()), after);
    }
}
