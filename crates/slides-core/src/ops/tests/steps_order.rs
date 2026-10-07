//! The helpers other code calls to read a slide's steps: reading order, and the steps in use.

use serde_json::json;

use super::steps_kit::{boxes, build, four, list_box, names, set_states, texts};
use super::{add, engine, first_slide, text_box};
use crate::model::{Base, Element, Text};
use crate::ops::{reading_order, steps_in_use};

// ---- helpers other code calls

#[test]
fn reading_order_is_rows_from_top_to_bottom_and_left_to_right_within_a_row() {
    let mut e = engine();
    let slide = add(&mut e, "blank", json!({}));
    let ids = four(&mut e, &slide);
    let deck = e.deck();
    let slide = deck.slide(&slide).unwrap();
    let ordered: Vec<&str> = reading_order(&deck.theme, &slide.layout, slide.elements.iter())
        .iter()
        .map(|e| e.id())
        .collect();
    assert_eq!(
        ordered,
        [
            ids[1].as_str(),
            ids[2].as_str(),
            ids[3].as_str(),
            ids[0].as_str()
        ]
    );
}

#[test]
fn a_title_at_the_top_reads_before_the_boxes_under_it() {
    let mut e = engine();
    let slide = add(&mut e, "title-only", json!({ "title": "Heading" }));
    let below = text_box(&mut e, &slide, 60.0, 300.0, 100.0, 50.0, "below");
    let deck = e.deck();
    let shown = deck.slide(&slide).unwrap();
    let ordered: Vec<&str> = reading_order(&deck.theme, &shown.layout, shown.elements.iter())
        .iter()
        .map(|e| e.id())
        .collect();
    assert_eq!(ordered.len(), 2);
    assert_eq!(ordered[1], below, "the title comes first");
}

#[test]
fn a_tall_box_and_a_short_one_that_start_together_read_left_to_right() {
    let mut e = engine();
    let slide = add(&mut e, "blank", json!({}));
    let ids = boxes(
        &mut e,
        &slide,
        &[
            (600.0, 120.0, 200.0, 50.0),
            (60.0, 120.0, 500.0, 300.0),
            (600.0, 260.0, 200.0, 50.0),
        ],
    );
    let all: Vec<&String> = ids.iter().collect();
    let out = build(&mut e, &slide, &all, "reveal");
    assert_eq!(
        names(&out),
        texts(&[&ids[1], &ids[0], &ids[2]]),
        "the tall one on the left, then the column beside it from the top down"
    );
}

#[test]
fn an_element_with_no_box_comes_last_in_the_order_given() {
    let mut e = engine();
    let slide = first_slide(&e);
    let ids = four(&mut e, &slide);
    let deck = e.deck();
    let shown = deck.slide(&slide).unwrap();
    let loose = |id: &str| Element::text_el(Base::new(id), Text::plain(""));
    let (first, second) = (loose("loose-1"), loose("loose-2"));
    let held: Vec<&Element> = vec![
        &first,
        shown.element(&ids[0]).unwrap(),
        &second,
        shown.element(&ids[1]).unwrap(),
    ];
    let ordered: Vec<&str> = reading_order(&deck.theme, &shown.layout, held)
        .iter()
        .map(|e| e.id())
        .collect();
    assert_eq!(
        ordered,
        [ids[1].as_str(), ids[0].as_str(), "loose-1", "loose-2"]
    );
}

#[test]
fn the_steps_in_use_are_the_highest_any_state_or_paragraph_names() {
    let mut e = engine();
    let slide = first_slide(&e);
    assert_eq!(steps_in_use(e.deck().slide(&slide).unwrap()), 0);
    let ids = four(&mut e, &slide);
    set_states(
        &mut e,
        &slide,
        &ids[0],
        json!({ "0": "hidden", "2": "normal" }),
    );
    assert_eq!(steps_in_use(e.deck().slide(&slide).unwrap()), 2);
    let list = list_box(&mut e, &slide, &["a", "b", "c", "d", "e"]);
    build(&mut e, &slide, &[&list], "reveal");
    assert_eq!(steps_in_use(e.deck().slide(&slide).unwrap()), 5);
    e.apply(
        "group_elements",
        json!({ "slide": slide, "ids": [ids[1], ids[2]] }),
    )
    .unwrap();
    set_states(&mut e, &slide, &ids[2], json!({ "8": "hidden" }));
    assert_eq!(
        steps_in_use(e.deck().slide(&slide).unwrap()),
        8,
        "states inside groups count"
    );
}
