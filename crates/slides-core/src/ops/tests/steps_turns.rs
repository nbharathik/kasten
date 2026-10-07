//! Walk through, spotlight and clear: the builds that put a state on every element in turn.

use serde_json::json;

use super::steps_kit::{
    boxes, build, entries, four, list_box, paragraph_steps, set_states, steps_of,
};
use super::{bytes, element, engine, first_slide};
use crate::error::Error;
use crate::model::StepState::*;
use crate::ops::{steps_in_use, steps_required};

// ---- walk through and spotlight

#[test]
fn a_walkthrough_highlights_each_element_in_turn_and_dims_the_others() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = boxes(
        &mut e,
        &slide,
        &[
            (60.0, 100.0, 100.0, 50.0),
            (260.0, 100.0, 100.0, 50.0),
            (460.0, 100.0, 100.0, 50.0),
        ],
    );
    let all: Vec<&String> = ids.iter().collect();
    let out = build(&mut e, &slide, &all, "walkthrough");
    assert_eq!(out["steps"], 3);
    assert_eq!(
        entries(&e, &slide, &ids[0]),
        [(1, Highlighted), (2, Dimmed)]
    );
    assert_eq!(
        entries(&e, &slide, &ids[1]),
        [(1, Dimmed), (2, Highlighted), (3, Dimmed)]
    );
    assert_eq!(
        entries(&e, &slide, &ids[2]),
        [(1, Dimmed), (3, Highlighted)]
    );
    let at = |step: u32| -> Vec<_> {
        ids.iter()
            .map(|id| element(&e, &slide, id).base().state_at(step))
            .collect()
    };
    assert_eq!(
        at(0),
        [Normal, Normal, Normal],
        "the slide arrives as it is"
    );
    assert_eq!(
        at(1),
        [Highlighted, Dimmed, Dimmed],
        "the first click highlights the first"
    );
    assert_eq!(at(2), [Dimmed, Highlighted, Dimmed]);
    assert_eq!(at(3), [Dimmed, Dimmed, Highlighted]);
}

#[test]
fn a_walkthrough_of_one_element_just_highlights_it() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = boxes(&mut e, &slide, &[(60.0, 100.0, 100.0, 50.0)]);
    build(&mut e, &slide, &[&ids[0]], "walkthrough");
    assert_eq!(entries(&e, &slide, &ids[0]), [(1, Highlighted)]);
    assert_eq!(steps_of(&e, &slide), 1);
}

#[test]
fn a_spotlight_leaves_the_current_element_as_it_is_and_dims_every_other() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = boxes(
        &mut e,
        &slide,
        &[
            (60.0, 100.0, 100.0, 50.0),
            (260.0, 100.0, 100.0, 50.0),
            (460.0, 100.0, 100.0, 50.0),
        ],
    );
    let all: Vec<&String> = ids.iter().collect();
    build(&mut e, &slide, &all, "spotlight");
    assert_eq!(entries(&e, &slide, &ids[0]), [(2, Dimmed)]);
    assert_eq!(
        entries(&e, &slide, &ids[1]),
        [(1, Dimmed), (2, Normal), (3, Dimmed)]
    );
    assert_eq!(entries(&e, &slide, &ids[2]), [(1, Dimmed), (3, Normal)]);
    assert_eq!(steps_of(&e, &slide), 3);
}

#[test]
fn a_spotlight_needs_something_to_dim() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = boxes(&mut e, &slide, &[(60.0, 100.0, 100.0, 50.0)]);
    let before = bytes(e.deck());
    let error = e
        .apply(
            "build_steps",
            json!({ "slide": slide, "ids": [ids[0]], "recipe": "spotlight" }),
        )
        .unwrap_err();
    let Error::Refused { message } = error else {
        panic!("a refusal, not {error:?}")
    };
    assert!(message.contains("two"), "{message}");
    assert_eq!(bytes(e.deck()), before);
}

// ---- clear

#[test]
fn clear_takes_every_state_and_paragraph_step_from_the_elements_named() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = four(&mut e, &slide);
    let list = list_box(&mut e, &slide, &["a", "b", "c"]);
    build(&mut e, &slide, &[&list], "reveal");
    set_states(
        &mut e,
        &slide,
        &ids[0],
        json!({ "0": "hidden", "3": "normal" }),
    );
    set_states(&mut e, &slide, &ids[1], json!({ "2": "dimmed" }));
    assert_eq!(steps_of(&e, &slide), 3);

    let out = build(&mut e, &slide, &[&ids[0], &list], "clear");
    assert_eq!(entries(&e, &slide, &ids[0]), []);
    assert_eq!(paragraph_steps(&e, &slide, &list), [None; 4]);
    assert_eq!(
        entries(&e, &slide, &ids[1]),
        [(2, Dimmed)],
        "the others keep theirs"
    );
    assert_eq!(out["steps"], 2, "what the rest still need");
    assert_eq!(steps_of(&e, &slide), 2);

    build(&mut e, &slide, &[&ids[1]], "clear");
    assert_eq!(steps_of(&e, &slide), 0);
    assert!(!bytes(e.deck()).contains("stepStates"));
}

#[test]
fn clear_keeps_the_steps_a_code_walkthrough_asks_for() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = four(&mut e, &slide);
    e.apply(
            "add_elements",
            json!({ "slide": slide, "elements": [{ "type": "code", "x": 60, "y": 400, "w": 400, "h": 100,
                "language": "python", "code": "a\nb\nc", "focus": ["1", "2", "3"] }] }),
    )
    .unwrap();
    build(&mut e, &slide, &[&ids[0], &ids[1]], "reveal");
    build(&mut e, &slide, &[&ids[0], &ids[1]], "clear");
    assert_eq!(steps_of(&e, &slide), 3, "the code block needs its three");
    assert_eq!(steps_required(e.deck().slide(&slide).unwrap()), 3);
    assert_eq!(steps_in_use(e.deck().slide(&slide).unwrap()), 0);
}
