//! The one-click builds, from the reveal to the input they refuse and how they undo.
//! Walk through, spotlight and clear are in `steps_turns.rs`.

use serde_json::json;

use super::steps_kit::{
    boxes, build, entries, four, list_box, names, paragraph_steps, set_states, steps_of, texts,
};
use super::{bytes, engine, first_slide, text_box};
use crate::error::Error;
use crate::model::StepState::*;

// ---- reveal

#[test]
fn reveal_shows_the_elements_one_by_one_in_reading_order() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = four(&mut e, &slide);
    // Given in any order, they come in reading order: top row left to right, then the row below.
    let out = build(
        &mut e,
        &slide,
        &[&ids[0], &ids[2], &ids[1], &ids[3]],
        "reveal",
    );
    assert_eq!(names(&out), texts(&[&ids[1], &ids[2], &ids[3], &ids[0]]));
    assert_eq!(out["steps"], 4);
    assert_eq!(steps_of(&e, &slide), 4);
    for (place, id) in [&ids[1], &ids[2], &ids[3], &ids[0]].into_iter().enumerate() {
        let step = place as u32 + 1;
        assert_eq!(entries(&e, &slide, id), [(0, Hidden), (step, Normal)]);
    }
}

#[test]
fn a_row_a_little_out_of_line_still_reads_left_to_right() {
    let mut e = engine();
    let slide = first_slide(&e);
    // The loop diagram: three boxes of different heights on one row, an arrow under them,
    // and two connecting lines at the height of their middles.
    let shapes = boxes(
        &mut e,
        &slide,
        &[
            (650.0, 185.0, 220.0, 120.0),
            (90.0, 200.0, 220.0, 90.0),
            (370.0, 200.0, 220.0, 90.0),
            (90.0, 340.0, 780.0, 60.0),
        ],
    );
    let lines: Vec<String> = [(590.0, 245.0), (310.0, 245.0)]
        .iter()
        .map(|(x, y)| {
            e.apply(
                "add_elements",
                json!({ "slide": slide, "elements": [{ "type": "line", "x": x, "y": y, "w": 60, "h": 0 }] }),
            )
            .unwrap()
            .output["ids"][0]
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect();
    let all = [
        &shapes[0], &shapes[3], &lines[0], &shapes[1], &lines[1], &shapes[2],
    ];
    let out = build(&mut e, &slide, &all, "reveal");
    assert_eq!(
        names(&out),
        texts(&[
            &shapes[1], &lines[1], &shapes[2], &lines[0], &shapes[0], &shapes[3]
        ]),
        "model, line, host, line, tool, and then the arrow below"
    );
}

#[test]
fn the_paragraphs_of_a_single_list_appear_one_by_one() {
    let mut e = engine();
    let slide = first_slide(&e);
    let list = list_box(&mut e, &slide, &["one", "two", "three", "four"]);
    set_states(&mut e, &slide, &list, json!({ "0": "dimmed" }));
    let out = build(&mut e, &slide, &[&list], "reveal");
    assert_eq!(out["steps"], 4);
    assert_eq!(names(&out), texts(&[&list]));
    assert_eq!(
        paragraph_steps(&e, &slide, &list),
        [None, Some(1), Some(2), Some(3), Some(4)],
        "the heading is not a list item and is always there"
    );
    assert_eq!(
        entries(&e, &slide, &list),
        [],
        "the box itself is always there"
    );
    assert_eq!(steps_of(&e, &slide), 4);
}

#[test]
fn a_single_box_without_a_list_or_with_one_item_appears_whole() {
    let mut e = engine();
    let slide = first_slide(&e);
    let plain = text_box(&mut e, &slide, 60.0, 60.0, 200.0, 50.0, "just words");
    let out = build(&mut e, &slide, &[&plain], "reveal");
    assert_eq!(out["steps"], 1);
    assert_eq!(entries(&e, &slide, &plain), [(0, Hidden), (1, Normal)]);
    let one = list_box(&mut e, &slide, &["only"]);
    build(&mut e, &slide, &[&one], "reveal");
    assert_eq!(entries(&e, &slide, &one), [(0, Hidden), (1, Normal)]);
    assert_eq!(paragraph_steps(&e, &slide, &one), [None, None]);
}

#[test]
fn boxes_that_hold_lists_appear_whole_when_there_are_several() {
    let mut e = engine();
    let slide = first_slide(&e);
    let list = list_box(&mut e, &slide, &["a", "b", "c"]);
    let other = text_box(&mut e, &slide, 600.0, 120.0, 200.0, 50.0, "beside");
    build(&mut e, &slide, &[&list], "reveal");
    assert_eq!(paragraph_steps(&e, &slide, &list)[1], Some(1));
    build(&mut e, &slide, &[&list, &other], "reveal");
    assert_eq!(entries(&e, &slide, &list), [(0, Hidden), (1, Normal)]);
    assert_eq!(
        paragraph_steps(&e, &slide, &list),
        [None; 4],
        "an old build of the words is replaced"
    );
    assert_eq!(entries(&e, &slide, &other), [(0, Hidden), (2, Normal)]);
    assert_eq!(steps_of(&e, &slide), 2);
}

#[test]
fn a_build_overwrites_the_chosen_elements_and_leaves_the_others_alone() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = four(&mut e, &slide);
    set_states(
        &mut e,
        &slide,
        &ids[0],
        json!({ "1": "dimmed", "6": "highlighted" }),
    );
    set_states(&mut e, &slide, &ids[1], json!({ "0": "highlighted" }));
    set_states(&mut e, &slide, &ids[3], json!({ "2": "hidden" }));
    build(&mut e, &slide, &[&ids[1], &ids[2]], "reveal");
    assert_eq!(entries(&e, &slide, &ids[1]), [(0, Hidden), (1, Normal)]);
    assert_eq!(entries(&e, &slide, &ids[2]), [(0, Hidden), (2, Normal)]);
    assert_eq!(
        entries(&e, &slide, &ids[0]),
        [(1, Dimmed), (6, Highlighted)]
    );
    assert_eq!(entries(&e, &slide, &ids[3]), [(2, Hidden)]);
    assert_eq!(steps_of(&e, &slide), 6, "what the others still need");
}

#[test]
fn a_build_sets_the_steps_to_what_the_slide_needs_and_no_more() {
    let mut e = engine();
    let slide = first_slide(&e);
    e.apply("set_slide_steps", json!({ "slide": slide, "steps": 9 }))
        .unwrap();
    let ids = four(&mut e, &slide);
    build(&mut e, &slide, &[&ids[0], &ids[1]], "reveal");
    assert_eq!(steps_of(&e, &slide), 2);
}

// ---- input

#[test]
fn a_build_names_its_elements_and_a_recipe_the_engine_has() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = four(&mut e, &slide);
    let before = bytes(e.deck());
    let none = e
        .apply(
            "build_steps",
            json!({ "slide": slide, "ids": [], "recipe": "reveal" }),
        )
        .unwrap_err();
    assert!(matches!(none, Error::BadInput { .. }));
    assert!(matches!(
        e.apply(
            "build_steps",
            json!({ "slide": slide, "ids": [ids[0], "e-nope"], "recipe": "reveal" })
        ),
        Err(Error::NoSuchElement { .. })
    ));
    assert!(matches!(
        e.apply(
            "build_steps",
            json!({ "slide": "s-nope", "ids": [ids[0]], "recipe": "reveal" })
        ),
        Err(Error::NoSuchSlide { .. })
    ));
    let Err(Error::BadInput { message, .. }) = e.apply(
        "build_steps",
        json!({ "slide": slide, "ids": [ids[0]], "recipe": "explode" }),
    ) else {
        panic!("an unknown recipe is bad input")
    };
    assert!(
        message.contains("reveal") && message.contains("walkthrough"),
        "says what the recipes are: {message}"
    );
    assert_eq!(bytes(e.deck()), before);
    assert_ne!(
        e.undo_label(),
        Some("build_steps"),
        "a refused build is not a step of undo"
    );
}

#[test]
fn an_element_named_twice_is_built_once() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = four(&mut e, &slide);
    let out = build(&mut e, &slide, &[&ids[0], &ids[1], &ids[0]], "reveal");
    assert_eq!(out["steps"], 2);
    assert_eq!(names(&out).len(), 2);
}

#[test]
fn a_build_is_one_step_of_undo_and_can_reach_inside_a_group() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = four(&mut e, &slide);
    e.apply(
        "group_elements",
        json!({ "slide": slide, "ids": [ids[0], ids[1]] }),
    )
    .unwrap();
    let before = bytes(e.deck());
    build(&mut e, &slide, &[&ids[0], &ids[1], &ids[2]], "walkthrough");
    let after = bytes(e.deck());
    assert_eq!(e.undo_label(), Some("build_steps"));
    assert_eq!(steps_of(&e, &slide), 3);
    assert!(!entries(&e, &slide, &ids[0]).is_empty(), "inside the group");
    e.undo().unwrap();
    assert_eq!(bytes(e.deck()), before);
    e.redo().unwrap();
    assert_eq!(bytes(e.deck()), after);
}
