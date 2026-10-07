//! A connector between two elements needs no box of its own: the operation puts it
//! between them.

use serde_json::json;

use super::{bytes, engine, first_slide};
use crate::error::Error;

fn shape(id: &str, x: f64, y: f64) -> serde_json::Value {
    json!({ "type": "shape", "id": id, "shape": "rect", "x": x, "y": y, "w": 100, "h": 50 })
}

#[test]
fn a_connector_joining_two_elements_is_placed_between_them() {
    let mut e = engine();
    let slide = first_slide(&e);
    e.apply(
        "add_elements",
        json!({ "slide": slide, "elements": [shape("a", 100.0, 100.0), shape("b", 400.0, 300.0)] }),
    )
    .unwrap();
    let added = e
        .apply(
            "add_elements",
            json!({ "slide": slide, "elements": [{
                "type": "connector", "id": "c", "route": "elbow",
                "from": { "el": "a", "side": "right" },
                "to": { "el": "b", "side": "left" }
            }] }),
        )
        .unwrap();
    assert_eq!(added.output["ids"][0], "c");
    let connector = e
        .deck()
        .slide(&slide)
        .unwrap()
        .elements
        .iter()
        .find(|x| x.id() == "c")
        .unwrap()
        .base()
        .rect()
        .unwrap();
    // From the right middle of a (200, 125) to the left middle of b (400, 325).
    assert_eq!(connector, (200.0, 125.0, 200.0, 200.0));
}

#[test]
fn it_may_join_elements_added_in_the_same_batch() {
    let mut e = engine();
    let slide = first_slide(&e);
    e.apply(
        "add_elements",
        json!({ "slide": slide, "elements": [
            shape("a", 0.0, 0.0),
            shape("b", 300.0, 0.0),
            { "type": "connector", "id": "c", "route": "straight", "from": { "el": "a", "side": "right" }, "to": { "el": "b", "side": "left" } }
        ] }),
    )
    .unwrap();
    let connector = e
        .deck()
        .slide(&slide)
        .unwrap()
        .elements
        .iter()
        .find(|x| x.id() == "c")
        .unwrap();
    assert_eq!(connector.base().rect().unwrap(), (100.0, 25.0, 200.0, 0.0));
}

#[test]
fn a_connector_to_nothing_that_exists_is_refused_and_changes_nothing() {
    let mut e = engine();
    let slide = first_slide(&e);
    e.apply(
        "add_elements",
        json!({ "slide": slide, "elements": [shape("a", 0.0, 0.0)] }),
    )
    .unwrap();
    let before = bytes(e.deck());
    let result = e.apply(
        "add_elements",
        json!({ "slide": slide, "elements": [{ "type": "connector", "route": "straight", "from": { "el": "a", "side": "right" }, "to": { "el": "ghost", "side": "left" } }] }),
    );
    let Err(Error::BadInput { message, .. }) = result else {
        panic!("expected a refusal, got {result:?}");
    };
    assert!(message.contains("ghost"), "{message}");
    assert_eq!(bytes(e.deck()), before);
}

#[test]
fn a_connector_with_one_free_end_still_needs_its_box() {
    let mut e = engine();
    let slide = first_slide(&e);
    e.apply(
        "add_elements",
        json!({ "slide": slide, "elements": [shape("a", 0.0, 0.0)] }),
    )
    .unwrap();
    let result = e.apply(
        "add_elements",
        json!({ "slide": slide, "elements": [{ "type": "connector", "route": "straight", "from": { "el": "a", "side": "right" } }] }),
    );
    assert!(matches!(result, Err(Error::BadInput { .. })), "{result:?}");
}
