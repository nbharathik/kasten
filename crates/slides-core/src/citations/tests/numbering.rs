use serde_json::{Value, json};

use crate::citations::Numbering;
use crate::ops::Engine;

fn engine() -> Engine {
    Engine::create("Numbers", "Light", 1).unwrap()
}

fn slide(e: &mut Engine) -> String {
    e.apply("add_slide", json!({ "layout": "blank" }))
        .unwrap()
        .output["slide"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn cite(id: &str, keys: &[&str], x: f64, y: f64) -> Value {
    json!({ "type": "citation", "id": id, "x": x, "y": y, "w": 300, "h": 30, "keys": keys })
}

fn put(e: &mut Engine, slide: &str, elements: Vec<Value>) {
    e.apply(
        "add_elements",
        json!({ "slide": slide, "elements": elements }),
    )
    .unwrap();
}

fn order(e: &Engine) -> Vec<String> {
    Numbering::of(e.deck()).keys().map(str::to_owned).collect()
}

#[test]
fn the_works_are_numbered_in_the_order_they_first_appear_in_the_deck() {
    let mut e = engine();
    let (s1, s2, s3) = (slide(&mut e), slide(&mut e), slide(&mut e));
    put(&mut e, &s1, vec![cite("c1", &["a", "b"], 60.0, 480.0)]);
    put(&mut e, &s2, vec![cite("c2", &["b", "c"], 60.0, 480.0)]);
    put(&mut e, &s3, vec![cite("c3", &["a", "d"], 60.0, 480.0)]);
    let n = Numbering::of(e.deck());
    assert_eq!(n.keys().collect::<Vec<_>>(), ["a", "b", "c", "d"]);
    assert_eq!(n.number("a"), Some(1));
    assert_eq!(n.number("c"), Some(3));
    assert_eq!(n.number("d"), Some(4));
    assert_eq!(n.number("z"), None);
    assert_eq!(n.len(), 4);
}

#[test]
fn a_deck_that_cites_nothing_numbers_nothing() {
    let mut e = engine();
    slide(&mut e);
    let n = Numbering::of(e.deck());
    assert!(n.is_empty());
    assert_eq!(n, Numbering::default());
}

#[test]
fn on_one_slide_the_works_are_numbered_as_they_are_read_not_as_they_are_stacked() {
    let mut e = engine();
    let s = slide(&mut e);
    // The lowest element of the stack is the last one read.
    put(
        &mut e,
        &s,
        vec![
            cite("low", &["last"], 60.0, 400.0),
            cite("right", &["second"], 500.0, 100.0),
            cite("left", &["first"], 60.0, 100.0),
        ],
    );
    assert_eq!(order(&e), ["first", "second", "last"]);
}

#[test]
fn a_citation_in_a_group_counts_where_the_group_stands() {
    let mut e = engine();
    let s = slide(&mut e);
    put(
        &mut e,
        &s,
        vec![
            cite("top", &["a"], 60.0, 50.0),
            cite("inner", &["b"], 60.0, 200.0),
            json!({ "type": "text", "id": "pad", "x": 60, "y": 240, "w": 100, "h": 30, "text": { "paragraphs": [{ "runs": [{ "t": "x" }] }] } }),
            cite("bottom", &["c"], 60.0, 450.0),
        ],
    );
    e.apply(
        "group_elements",
        json!({ "slide": s, "ids": ["inner", "pad"] }),
    )
    .unwrap();
    assert_eq!(order(&e), ["a", "b", "c"]);
}

#[test]
fn every_slide_counts_a_hidden_one_and_the_keys_of_a_list_too() {
    let mut e = engine();
    let (s1, s2, s3) = (slide(&mut e), slide(&mut e), slide(&mut e));
    put(&mut e, &s1, vec![cite("c1", &["a"], 60.0, 480.0)]);
    put(&mut e, &s2, vec![cite("c2", &["hidden"], 60.0, 480.0)]);
    e.apply("set_slide_flags", json!({ "ids": [s2], "hidden": true }))
        .unwrap();
    put(
        &mut e,
        &s3,
        vec![
            json!({ "type": "citation", "id": "refs", "x": 60, "y": 100, "w": 800, "h": 300, "format": "list", "keys": ["extra", "a"] }),
        ],
    );
    assert_eq!(order(&e), ["a", "hidden", "extra"]);
}

#[test]
fn moving_a_slide_renumbers_the_works() {
    let mut e = engine();
    let (s1, s2) = (slide(&mut e), slide(&mut e));
    put(&mut e, &s1, vec![cite("c1", &["first"], 60.0, 480.0)]);
    put(&mut e, &s2, vec![cite("c2", &["second"], 60.0, 480.0)]);
    assert_eq!(order(&e), ["first", "second"]);
    e.apply("move_slides", json!({ "ids": [s2], "to": 0 }))
        .unwrap();
    assert_eq!(order(&e), ["second", "first"]);
    e.undo().unwrap();
    assert_eq!(order(&e), ["first", "second"]);
}

#[test]
fn a_list_of_keys_makes_a_numbering_and_repeats_are_dropped() {
    let n = Numbering::new(["b", "a", "b", "c", "a"]);
    assert_eq!(n.keys().collect::<Vec<_>>(), ["b", "a", "c"]);
    assert_eq!(n.number("b"), Some(1));
    assert_eq!(n.number("c"), Some(3));
}
