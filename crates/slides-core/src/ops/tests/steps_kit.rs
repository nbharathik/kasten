//! What the tests of steps share: text boxes at places, and readers of what a slide's
//! steps and states came to.

use serde_json::{Value, json};

use super::{element, text_box};
use crate::error::Error;
use crate::model::StepState;
use crate::ops::Engine;

/// Adds text boxes at the given places and returns their ids, in that order.
pub(super) fn boxes(e: &mut Engine, slide: &str, places: &[(f64, f64, f64, f64)]) -> Vec<String> {
    places
        .iter()
        .enumerate()
        .map(|(n, (x, y, w, h))| text_box(e, slide, *x, *y, *w, *h, &format!("box {n}")))
        .collect()
}

/// The states of an element as `(step, state)` pairs, in step order.
pub(super) fn entries(e: &Engine, slide: &str, id: &str) -> Vec<(u32, StepState)> {
    element(e, slide, id)
        .base()
        .step_states
        .iter()
        .map(|(step, state)| (*step, state.clone()))
        .collect()
}

pub(super) fn steps_of(e: &Engine, slide: &str) -> u32 {
    e.deck().slide(slide).unwrap().steps
}

/// The `step` of each paragraph of a text element.
pub(super) fn paragraph_steps(e: &Engine, slide: &str, id: &str) -> Vec<Option<u32>> {
    element(e, slide, id)
        .text()
        .unwrap()
        .paragraphs
        .iter()
        .map(|p| p.step)
        .collect()
}

/// A text box holding a heading and then `items` bullets.
pub(super) fn list_box(e: &mut Engine, slide: &str, items: &[&str]) -> String {
    let mut paragraphs = vec![json!({ "runs": [{ "t": "Heading" }] })];
    paragraphs.extend(
        items
            .iter()
            .map(|t| json!({ "list": "bullet", "runs": [{ "t": t }] })),
    );
    let element = json!({ "type": "text", "x": 60, "y": 120, "w": 500, "h": 300, "text": { "paragraphs": paragraphs } });
    let out = e
        .apply(
            "add_elements",
            json!({ "slide": slide, "elements": [element] }),
        )
        .unwrap();
    out.output["ids"][0].as_str().unwrap().to_owned()
}

/// Puts states on an element through the operation, as a person would.
pub(super) fn set_states(e: &mut Engine, slide: &str, id: &str, states: Value) {
    e.apply(
        "set_step_states",
        json!({ "slide": slide, "id": id, "states": states }),
    )
    .unwrap();
}

pub(super) fn message(error: Error) -> String {
    match error {
        Error::BadInput { message, .. } | Error::Refused { message } => message,
        other => panic!("not a refusal of the input: {other:?}"),
    }
}

pub(super) fn build(e: &mut Engine, slide: &str, ids: &[&String], recipe: &str) -> Value {
    e.apply(
        "build_steps",
        json!({ "slide": slide, "ids": ids, "recipe": recipe }),
    )
    .unwrap()
    .output
}

pub(super) fn names(value: &Value) -> Vec<String> {
    value["order"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_owned())
        .collect()
}

/// The ids in the list, as text, for comparing with the order a build reports.
pub(super) fn texts(list: &[&String]) -> Vec<String> {
    list.iter().map(|s| (*s).clone()).collect()
}

/// Four text boxes: the second and third side by side at the top, the fourth and
/// the first side by side below them. Their ids, in that order of creation.
pub(super) fn four(e: &mut Engine, slide: &str) -> Vec<String> {
    boxes(
        e,
        slide,
        &[
            (400.0, 300.0, 100.0, 50.0),
            (60.0, 100.0, 100.0, 50.0),
            (400.0, 100.0, 100.0, 50.0),
            (60.0, 300.0, 100.0, 50.0),
        ],
    )
}
