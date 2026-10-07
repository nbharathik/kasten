//! Steps: how many clicks a slide has, and how one element looks at each.
//! The builds are in `steps_build.rs`, `steps_turns.rs` and `steps_order.rs`.

use serde_json::json;

use super::steps_kit::{boxes, entries, list_box, message, paragraph_steps, set_states, steps_of};
use super::{add, bytes, element, engine, first_slide};
use crate::error::Error;
use crate::model::StepState;

// ---- set_slide_steps

#[test]
fn raising_the_steps_adds_empty_steps_and_is_one_step_of_undo() {
    let mut e = engine();
    let slide = first_slide(&e);
    let before = bytes(e.deck());
    e.apply("set_slide_steps", json!({ "slide": slide, "steps": 3 }))
        .unwrap();
    assert_eq!(steps_of(&e, &slide), 3);
    assert_ne!(bytes(e.deck()), before);
    e.undo().unwrap();
    assert_eq!(bytes(e.deck()), before);
    assert!(!e.can_undo());
}

#[test]
fn a_slide_has_between_none_and_fifty_steps() {
    let mut e = engine();
    let slide = first_slide(&e);
    e.apply("set_slide_steps", json!({ "slide": slide, "steps": 50 }))
        .unwrap();
    assert_eq!(steps_of(&e, &slide), 50);
    let before = bytes(e.deck());
    let too_many = e
        .apply("set_slide_steps", json!({ "slide": slide, "steps": 51 }))
        .unwrap_err();
    assert!(message(too_many).contains("50"), "says the limit");
    assert!(matches!(
        e.apply("set_slide_steps", json!({ "slide": slide, "steps": -1 })),
        Err(Error::BadInput { .. })
    ));
    assert!(matches!(
        e.apply("set_slide_steps", json!({ "slide": "s-nope", "steps": 2 })),
        Err(Error::NoSuchSlide { .. })
    ));
    assert_eq!(
        bytes(e.deck()),
        before,
        "a refused operation changes nothing"
    );
    e.apply("set_slide_steps", json!({ "slide": slide, "steps": 0 }))
        .unwrap();
    assert_eq!(steps_of(&e, &slide), 0);
    assert!(
        !bytes(e.deck()).contains("\"steps\""),
        "a slide without steps says nothing"
    );
}

#[test]
fn lowering_the_steps_keeps_what_the_audience_sees_at_the_end() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = boxes(
        &mut e,
        &slide,
        &[
            (0.0, 0.0, 50.0, 50.0),
            (0.0, 60.0, 50.0, 50.0),
            (0.0, 120.0, 50.0, 50.0),
        ],
    );
    set_states(
        &mut e,
        &slide,
        &ids[0],
        json!({ "0": "hidden", "3": "normal" }),
    );
    set_states(
        &mut e,
        &slide,
        &ids[1],
        json!({ "1": "highlighted", "4": "dimmed", "5": "normal" }),
    );
    set_states(
        &mut e,
        &slide,
        &ids[2],
        json!({ "1": "dimmed", "4": "dimmed" }),
    );
    assert_eq!(steps_of(&e, &slide), 5);

    e.apply("set_slide_steps", json!({ "slide": slide, "steps": 2 }))
        .unwrap();
    assert_eq!(steps_of(&e, &slide), 2);
    // What came at step 3 comes at the last step now.
    assert_eq!(
        entries(&e, &slide, &ids[0]),
        [(0, StepState::Hidden), (2, StepState::Normal)]
    );
    // Only where it ends up different from what holds already.
    assert_eq!(
        entries(&e, &slide, &ids[1]),
        [(1, StepState::Highlighted), (2, StepState::Normal)]
    );
    assert_eq!(
        entries(&e, &slide, &ids[2]),
        [(1, StepState::Dimmed)],
        "a change that keeps the state it already had leaves no entry"
    );
    for id in &ids {
        assert!(entries(&e, &slide, id).iter().all(|(step, _)| *step <= 2));
    }
}

#[test]
fn lowering_the_steps_to_none_leaves_no_entry_that_says_nothing() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = boxes(&mut e, &slide, &[(0.0, 0.0, 50.0, 50.0)]);
    set_states(
        &mut e,
        &slide,
        &ids[0],
        json!({ "0": "hidden", "2": "normal" }),
    );
    e.apply("set_slide_steps", json!({ "slide": slide, "steps": 0 }))
        .unwrap();
    assert_eq!(steps_of(&e, &slide), 0);
    assert_eq!(
        entries(&e, &slide, &ids[0]),
        [],
        "shown at the end, so nothing is stored"
    );
}

#[test]
fn lowering_the_steps_moves_late_paragraphs_to_the_last_step_and_reaches_into_groups() {
    let mut e = engine();
    let slide = first_slide(&e);
    let list = list_box(&mut e, &slide, &["a", "b", "c", "d"]);
    let mut text = element(&e, &slide, &list).text().unwrap().clone();
    for (n, p) in text.paragraphs.iter_mut().enumerate() {
        p.step = (n > 0).then_some(n as u32);
    }
    e.apply(
        "set_rich_text",
        json!({ "slide": slide, "id": list, "text": text }),
    )
    .unwrap();
    let inside = boxes(
        &mut e,
        &slide,
        &[(300.0, 0.0, 50.0, 50.0), (300.0, 60.0, 50.0, 50.0)],
    );
    set_states(
        &mut e,
        &slide,
        &inside[0],
        json!({ "0": "hidden", "4": "normal" }),
    );
    let group = e
        .apply("group_elements", json!({ "slide": slide, "ids": inside }))
        .unwrap()
        .output["group"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(steps_of(&e, &slide), 4);

    e.apply("set_slide_steps", json!({ "slide": slide, "steps": 2 }))
        .unwrap();
    assert_eq!(
        paragraph_steps(&e, &slide, &list),
        [None, Some(1), Some(2), Some(2), Some(2)]
    );
    assert_eq!(
        entries(&e, &slide, &inside[0]),
        [(0, StepState::Hidden), (2, StepState::Normal)],
        "an element inside a group is reached too"
    );
    assert!(entries(&e, &slide, &group).is_empty());
}

// ---- set_step_states

#[test]
fn states_are_merged_into_an_elements_entries_and_null_takes_one_away() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = boxes(&mut e, &slide, &[(0.0, 0.0, 50.0, 50.0)]);
    set_states(
        &mut e,
        &slide,
        &ids[0],
        json!({ "0": "hidden", "1": "dimmed" }),
    );
    set_states(
        &mut e,
        &slide,
        &ids[0],
        json!({ "1": null, "2": "highlighted" }),
    );
    assert_eq!(
        entries(&e, &slide, &ids[0]),
        [(0, StepState::Hidden), (2, StepState::Highlighted)]
    );
    let file = bytes(e.deck());
    assert!(file.contains("\"stepStates\""), "{file}");
    set_states(&mut e, &slide, &ids[0], json!({ "0": null, "2": null }));
    assert!(
        !bytes(e.deck()).contains("stepStates"),
        "an element with no entry stores no map"
    );
}

#[test]
fn the_slide_grows_to_cover_the_steps_named_and_never_shrinks_by_it() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = boxes(&mut e, &slide, &[(0.0, 0.0, 50.0, 50.0)]);
    set_states(&mut e, &slide, &ids[0], json!({ "0": "dimmed" }));
    assert_eq!(steps_of(&e, &slide), 0, "state 0 needs no click");
    set_states(&mut e, &slide, &ids[0], json!({ "3": "hidden" }));
    assert_eq!(steps_of(&e, &slide), 3);
    set_states(&mut e, &slide, &ids[0], json!({ "1": "normal" }));
    assert_eq!(steps_of(&e, &slide), 3);
    set_states(&mut e, &slide, &ids[0], json!({ "3": null }));
    assert_eq!(
        steps_of(&e, &slide),
        3,
        "taking an entry away leaves the steps"
    );
}

#[test]
fn a_change_of_state_is_one_step_of_undo_and_reaches_inside_groups() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = boxes(
        &mut e,
        &slide,
        &[(0.0, 0.0, 50.0, 50.0), (0.0, 60.0, 50.0, 50.0)],
    );
    e.apply("group_elements", json!({ "slide": slide, "ids": ids }))
        .unwrap();
    let before = bytes(e.deck());
    set_states(
        &mut e,
        &slide,
        &ids[1],
        json!({ "0": "dimmed", "2": "highlighted" }),
    );
    assert_eq!(steps_of(&e, &slide), 2);
    assert_eq!(e.undo_label(), Some("set_step_states"));
    e.undo().unwrap();
    assert_eq!(bytes(e.deck()), before);
    e.redo().unwrap();
    assert_eq!(entries(&e, &slide, &ids[1]).len(), 2);
}

#[test]
fn a_step_must_be_a_whole_number_in_range_and_a_state_one_the_format_has() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = boxes(&mut e, &slide, &[(0.0, 0.0, 50.0, 50.0)]);
    let before = bytes(e.deck());
    let last_step = e.undo_label().map(str::to_owned);
    for key in ["one", "-1", "1.5", "01", " 2", "+2", "", "51", "4294967296"] {
        let error = e
            .apply(
                "set_step_states",
                json!({ "slide": slide, "id": ids[0], "states": { key: "hidden" } }),
            )
            .unwrap_err();
        let words = message(error);
        assert!(words.contains("step"), "{key:?}: {words}");
    }
    let unknown = e.apply(
        "set_step_states",
        json!({ "slide": slide, "id": ids[0], "states": { "1": "shown" } }),
    );
    assert!(matches!(unknown, Err(Error::BadInput { .. })));
    assert!(matches!(
        e.apply(
            "set_step_states",
            json!({ "slide": slide, "id": "e-nope", "states": { "1": "hidden" } })
        ),
        Err(Error::NoSuchElement { .. })
    ));
    assert!(matches!(
        e.apply(
            "set_step_states",
            json!({ "slide": "s-nope", "id": ids[0], "states": { "1": "hidden" } })
        ),
        Err(Error::NoSuchSlide { .. })
    ));
    assert_eq!(bytes(e.deck()), before);
    assert_eq!(
        e.undo_label().map(str::to_owned),
        last_step,
        "a refused operation is not a step of undo"
    );
}

#[test]
fn asking_for_no_change_is_not_a_step_of_undo() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = boxes(&mut e, &slide, &[(0.0, 0.0, 50.0, 50.0)]);
    let steps = e.undo_label().map(str::to_owned);
    set_states(&mut e, &slide, &ids[0], json!({}));
    set_states(&mut e, &slide, &ids[0], json!({ "2": null }));
    assert_eq!(e.undo_label().map(str::to_owned), steps);
}

#[test]
fn steps_and_states_are_saved_and_read_back_unchanged() {
    let mut e = engine();
    let slide = first_slide(&e);
    let second = add(&mut e, "blank", json!({}));
    let ids = boxes(&mut e, &second, &[(0.0, 0.0, 50.0, 50.0)]);
    set_states(
        &mut e,
        &second,
        &ids[0],
        json!({ "0": "hidden", "10": "normal", "2": "dimmed" }),
    );
    let text = bytes(e.deck());
    assert_eq!(bytes(&crate::canonical::parse(&text).unwrap()), text);
    assert_eq!(steps_of(&e, &second), 10);
    assert_eq!(steps_of(&e, &slide), 0);
}
