//! Sections: named stretches of the deck, made, renamed and taken away by
//! operations, and kept sensible when the slides in them are moved.

use serde_json::json;

use super::{add, bytes, engine, first_slide};
use crate::error::Error;
use crate::ops::Engine;

/// A deck of `n` slides, and their ids in order.
fn deck_of(n: usize) -> (Engine, Vec<String>) {
    let mut e = engine();
    let mut ids = vec![first_slide(&e)];
    for _ in 1..n {
        ids.push(add(&mut e, "title-only", json!({})));
    }
    (e, ids)
}

/// The sections as (title, the slide each starts at).
fn sections(e: &Engine) -> Vec<(String, String)> {
    e.deck()
        .sections
        .iter()
        .map(|s| (s.title.clone(), s.starts_at.clone()))
        .collect()
}

fn add_section(e: &mut Engine, at: &str, title: &str) {
    e.apply("add_section", json!({ "at": at, "title": title }))
        .unwrap();
}

fn order(e: &Engine) -> Vec<String> {
    e.deck().slides.iter().map(|s| s.id.clone()).collect()
}

fn refused(result: crate::error::Result<crate::ops::Applied>) -> String {
    match result {
        Err(Error::Refused { message }) => message,
        other => panic!("refused, not {other:?}"),
    }
}

#[test]
fn a_section_starts_at_a_slide_and_is_one_step_of_undo() {
    let (mut e, ids) = deck_of(4);
    let before = bytes(e.deck());
    add_section(&mut e, &ids[1], "Method");
    assert_eq!(sections(&e), [("Method".to_owned(), ids[1].clone())]);
    assert_eq!(e.undo_label(), Some("add_section"));
    let after = bytes(e.deck());
    e.undo().unwrap();
    assert_eq!(bytes(e.deck()), before, "undo takes it away");
    e.redo().unwrap();
    assert_eq!(bytes(e.deck()), after, "redo brings it back");
    crate::canonical::check_structure(e.deck()).unwrap();
}

#[test]
fn sections_are_kept_in_the_order_of_the_slides_whatever_the_order_they_were_made_in() {
    let (mut e, ids) = deck_of(5);
    add_section(&mut e, &ids[3], "Results");
    add_section(&mut e, &ids[1], "Method");
    add_section(&mut e, &ids[0], "Intro");
    let starts: Vec<String> = sections(&e).into_iter().map(|(_, at)| at).collect();
    assert_eq!(starts, [ids[0].clone(), ids[1].clone(), ids[3].clone()]);
}

#[test]
fn the_title_is_trimmed_and_cannot_be_empty() {
    let (mut e, ids) = deck_of(2);
    add_section(&mut e, &ids[1], "  Method \n");
    assert_eq!(sections(&e)[0].0, "Method");
    let before = bytes(e.deck());
    let message = refused(e.apply("add_section", json!({ "at": ids[0], "title": "   " })));
    assert!(message.contains("name"), "{message}");
    assert_eq!(bytes(e.deck()), before);
}

#[test]
fn a_slide_that_starts_a_section_cannot_start_another_and_the_message_says_what_to_do() {
    let (mut e, ids) = deck_of(3);
    add_section(&mut e, &ids[1], "Method");
    let before = bytes(e.deck());
    let message = refused(e.apply("add_section", json!({ "at": ids[1], "title": "Again" })));
    assert!(
        message.contains("Method") && message.contains(&ids[1]),
        "{message}"
    );
    assert!(
        message.contains("rename_section") && message.contains("remove_section"),
        "{message}"
    );
    assert_eq!(bytes(e.deck()), before, "nothing changed");
    assert_eq!(
        e.undo_label(),
        Some("add_section"),
        "the refusal made no step"
    );
}

#[test]
fn a_section_has_to_start_at_a_slide_that_is_there() {
    let (mut e, _) = deck_of(2);
    assert!(matches!(
        e.apply("add_section", json!({ "at": "s-none", "title": "Lost" })),
        Err(Error::NoSuchSlide { .. })
    ));
    assert!(matches!(
        e.apply("rename_section", json!({ "at": "s-none", "title": "Lost" })),
        Err(Error::NoSuchSlide { .. })
    ));
    assert!(matches!(
        e.apply("remove_section", json!({ "at": "s-none" })),
        Err(Error::NoSuchSlide { .. })
    ));
    assert!(e.deck().sections.is_empty());
}

#[test]
fn a_section_is_renamed_where_it_starts_in_one_step_of_undo() {
    let (mut e, ids) = deck_of(3);
    add_section(&mut e, &ids[0], "Intro");
    add_section(&mut e, &ids[2], "End");
    let before = bytes(e.deck());
    e.apply(
        "rename_section",
        json!({ "at": ids[2], "title": " Wrap-up " }),
    )
    .unwrap();
    assert_eq!(
        sections(&e),
        [
            ("Intro".to_owned(), ids[0].clone()),
            ("Wrap-up".to_owned(), ids[2].clone())
        ]
    );
    assert_eq!(e.undo_label(), Some("rename_section"));
    e.undo().unwrap();
    assert_eq!(bytes(e.deck()), before);
}

#[test]
fn a_section_is_removed_and_its_slides_stay_in_one_step_of_undo() {
    let (mut e, ids) = deck_of(4);
    add_section(&mut e, &ids[1], "Method");
    add_section(&mut e, &ids[3], "End");
    let before = bytes(e.deck());
    e.apply("remove_section", json!({ "at": ids[1] })).unwrap();
    assert_eq!(sections(&e), [("End".to_owned(), ids[3].clone())]);
    assert_eq!(order(&e), ids, "the slides are all there, in their places");
    assert_eq!(e.undo_label(), Some("remove_section"));
    e.undo().unwrap();
    assert_eq!(bytes(e.deck()), before);
}

#[test]
fn renaming_or_removing_needs_a_section_that_starts_at_the_slide_and_says_how_to_make_one() {
    let (mut e, ids) = deck_of(3);
    add_section(&mut e, &ids[0], "Intro");
    let before = bytes(e.deck());
    for (op, input) in [
        ("rename_section", json!({ "at": ids[1], "title": "X" })),
        ("remove_section", json!({ "at": ids[1] })),
    ] {
        let message = refused(e.apply(op, input));
        assert!(
            message.contains(&ids[1]) && message.contains("add_section"),
            "{op}: {message}"
        );
        assert!(
            message.contains(&ids[0]),
            "it names the slides that do start one: {message}"
        );
    }
    let message = refused(e.apply("rename_section", json!({ "at": ids[0], "title": "" })));
    assert!(message.contains("name"), "{message}");
    assert_eq!(bytes(e.deck()), before);
}

// ---- moving slides

/// A deck of `n` slides with sections starting at the given positions, named after them.
fn sectioned(n: usize, starts: &[usize]) -> (Engine, Vec<String>) {
    let (mut e, ids) = deck_of(n);
    for &at in starts {
        add_section(&mut e, &ids[at], &format!("S{at}"));
    }
    (e, ids)
}

fn starts(e: &Engine) -> Vec<String> {
    sections(e).into_iter().map(|(_, at)| at).collect()
}

#[test]
fn moving_the_slide_that_starts_a_section_leaves_the_section_with_the_slide_that_follows() {
    // [a b c] [d e]: take the first slide of the first section to the end.
    let (mut e, ids) = sectioned(5, &[0, 3]);
    e.apply("move_slides", json!({ "ids": [ids[0]], "to": 4 }))
        .unwrap();
    assert_eq!(
        order(&e),
        [&ids[1], &ids[2], &ids[3], &ids[4], &ids[0]].map(String::clone)
    );
    assert_eq!(starts(&e), [ids[1].clone(), ids[3].clone()]);
}

#[test]
fn moving_a_start_and_some_of_the_rest_hands_the_section_to_the_first_slide_that_stays() {
    // [a b c d] [e]: a and b go, c stays and takes the section.
    let (mut e, ids) = sectioned(5, &[0, 4]);
    e.apply("move_slides", json!({ "ids": [ids[0], ids[1]], "to": 3 }))
        .unwrap();
    assert_eq!(starts(&e), [ids[2].clone(), ids[4].clone()]);
    // A slide that stays but is not next to the start counts too: a and c go, b stays.
    let (mut e, ids) = sectioned(4, &[0]);
    e.apply("move_slides", json!({ "ids": [ids[0], ids[2]], "to": 2 }))
        .unwrap();
    assert_eq!(starts(&e), [ids[1].clone()]);
}

#[test]
fn moving_all_the_slides_of_a_section_takes_it_along() {
    // [a b] [c d e]: the first section goes to the end, whole.
    let (mut e, ids) = sectioned(5, &[0, 2]);
    e.apply("move_slides", json!({ "ids": [ids[0], ids[1]], "to": 3 }))
        .unwrap();
    assert_eq!(
        order(&e),
        [&ids[2], &ids[3], &ids[4], &ids[0], &ids[1]].map(String::clone)
    );
    assert_eq!(
        starts(&e),
        [ids[2].clone(), ids[0].clone()],
        "it still starts at its first slide, and the sections are in the order of the slides"
    );
    let names: Vec<String> = sections(&e).into_iter().map(|(title, _)| title).collect();
    assert_eq!(names, ["S2", "S0"]);
}

#[test]
fn a_section_of_one_slide_moves_with_that_slide() {
    // [a] [b] [c d]: the second section is all of b.
    let (mut e, ids) = sectioned(4, &[0, 1, 2]);
    e.apply("move_slides", json!({ "ids": [ids[1]], "to": 3 }))
        .unwrap();
    assert_eq!(
        order(&e),
        [&ids[0], &ids[2], &ids[3], &ids[1]].map(String::clone)
    );
    assert_eq!(starts(&e), [ids[0].clone(), ids[2].clone(), ids[1].clone()]);
    let names: Vec<String> = sections(&e).into_iter().map(|(title, _)| title).collect();
    assert_eq!(names, ["S0", "S2", "S1"], "it is still called what it was");
}

#[test]
fn moving_slides_that_start_no_section_changes_no_section() {
    let (mut e, ids) = sectioned(5, &[0, 3]);
    e.apply("move_slides", json!({ "ids": [ids[1], ids[4]], "to": 0 }))
        .unwrap();
    assert_eq!(starts(&e), [ids[0].clone(), ids[3].clone()]);
}

#[test]
fn two_sections_can_be_handed_over_and_carried_by_the_same_move() {
    // [a] [b c] [d]: a goes whole (it is all of its section); b goes without c.
    let (mut e, ids) = sectioned(4, &[0, 1, 3]);
    e.apply("move_slides", json!({ "ids": [ids[0], ids[1]], "to": 2 }))
        .unwrap();
    assert_eq!(
        order(&e),
        [&ids[2], &ids[3], &ids[0], &ids[1]].map(String::clone)
    );
    assert_eq!(starts(&e), [ids[2].clone(), ids[3].clone(), ids[0].clone()]);
}

#[test]
fn moving_a_start_is_one_step_of_undo_that_brings_the_sections_back_exactly() {
    let (mut e, ids) = sectioned(5, &[0, 3]);
    let before = bytes(e.deck());
    e.apply("move_slides", json!({ "ids": [ids[0]], "to": 4 }))
        .unwrap();
    let after = bytes(e.deck());
    e.undo().unwrap();
    assert_eq!(bytes(e.deck()), before);
    e.redo().unwrap();
    assert_eq!(bytes(e.deck()), after);
    crate::canonical::check_structure(e.deck()).unwrap();
}

#[test]
fn the_reported_changes_carry_the_sections_that_a_move_handed_over() {
    let (mut e, ids) = sectioned(4, &[0]);
    let mut copy = e.deck().clone();
    let applied = e
        .apply("move_slides", json!({ "ids": [ids[0]], "to": 3 }))
        .unwrap();
    applied.changes.apply_to(&mut copy);
    assert_eq!(bytes(&copy), bytes(e.deck()));
}

#[test]
fn the_operations_are_in_the_registry_for_agents_and_the_editor() {
    let specs = crate::ops::specs();
    for name in ["add_section", "rename_section", "remove_section"] {
        let spec = specs.iter().find(|s| s.name == name).expect(name);
        assert!(spec.input["properties"]["at"].is_object(), "{name}");
    }
}
