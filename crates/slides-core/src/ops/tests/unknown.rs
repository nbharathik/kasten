//! A deck written by a newer build may carry fields this build does not know,
//! in any object of the file. Reading and saving must keep every one of them,
//! and so must any operation that has nothing to do with them. The deck in
//! `fixtures/decks/unknown-fields-deep.deck` has one in every kind of object
//! that has a name in the model; `write_unknown_fields_deep` (run by hand with
//! `--ignored`) makes it from a deck the operations made, and never rewrites it.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use serde_json::{Value, json};

use super::{add, bytes, text_box};
use crate::canonical;
use crate::ops::Engine;

fn path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/decks/unknown-fields-deep.deck")
}

/// Where, in a deck, each kind of object is, and the field a newer build gives it. A `*` stands
/// for every item of a list (or every value of a map).
const KINDS: &[(&str, &str, &str)] = &[
    ("Size", "size", "futureSizeField"),
    ("Present", "present", "futurePresentField"),
    ("Section", "sections/*", "futureSectionField"),
    ("Transition", "slides/*/transition", "futureTransitionField"),
    ("Background", "slides/*/background", "futureBackgroundField"),
    ("Colors", "theme/colors", "futureColorsField"),
    ("FontSpec", "theme/fonts/*", "futureFontSpecField"),
    ("Fonts", "theme/fonts", "futureFontsField"),
    ("TextStyle", "theme/textStyles/*", "futureTextStyleField"),
    ("Layout", "theme/layouts/*", "futureLayoutField"),
    (
        "PlaceholderDef",
        "theme/layouts/*/placeholders/*",
        "futurePlaceholderField",
    ),
    ("Highlight", "theme/highlight", "futureHighlightField"),
    ("Fill", "slides/*/elements/*/style/fill", "futureFillField"),
    (
        "Stroke",
        "slides/*/elements/*/style/stroke",
        "futureStrokeField",
    ),
    (
        "Shadow",
        "slides/*/elements/*/style/shadow",
        "futureShadowField",
    ),
    (
        "Insets",
        "slides/*/elements/*/text/insets",
        "futureInsetsField",
    ),
    ("Crop", "slides/*/elements/*/crop", "futureCropField"),
    ("Anchor", "slides/*/elements/*/from", "futureFromField"),
    ("Anchor", "slides/*/elements/*/to", "futureToField"),
    ("TableRow", "slides/*/elements/*/rows/*", "futureRowField"),
    (
        "TableCell",
        "slides/*/elements/*/rows/*/cells/*",
        "futureCellField",
    ),
    (
        "ChatMessage",
        "slides/*/elements/*/messages/*",
        "futureMessageField",
    ),
    (
        "NextToken",
        "slides/*/elements/*/next/*",
        "futureNextTokenField",
    ),
    ("Card", "slides/*/elements/*/cards/*", "futureCardField"),
];

/// A deck with one of every kind of object that KINDS names, made by the operations.
fn everything() -> Engine {
    let mut e = Engine::create("Unknown fields deep in the objects", "Light", 23).unwrap();
    let s = add(&mut e, "blank", json!({}));
    let cell = |t: &str| json!({ "text": { "paragraphs": [{ "runs": [{ "t": t }] }] } });
    let elements = vec![
        json!({ "type": "shape", "shape": "roundRect", "id": "shape-a", "x": 40, "y": 40, "w": 200, "h": 100,
            "style": { "fill": { "color": "accent1", "alpha": 0.5 }, "stroke": { "color": "accent2", "width": 2, "dash": "dash" },
                "shadow": { "color": "text1", "blur": 6, "dx": 2, "dy": 2, "alpha": 0.3 }, "radius": 8 },
            "text": { "paragraphs": [{ "runs": [{ "t": "A shape" }] }], "insets": { "left": 6, "top": 4, "right": 6, "bottom": 4 } } }),
        json!({ "type": "shape", "shape": "ellipse", "id": "shape-b", "x": 300, "y": 40, "w": 100, "h": 100 }),
        json!({ "type": "connector", "id": "link-1", "route": "elbow", "x": 0, "y": 0, "w": 1, "h": 1,
            "from": { "el": "shape-a", "side": "right" }, "to": { "el": "shape-b", "side": "left" } }),
        json!({ "type": "image", "id": "image-1", "x": 460, "y": 40, "w": 200, "h": 120, "src": "assets/figure.png",
            "crop": { "left": 0.1, "top": 0.0, "right": 0.1, "bottom": 0.0 } }),
        json!({ "type": "table", "id": "table-1", "x": 40, "y": 180, "w": 400, "h": 90, "columns": [200, 200], "headerRow": true,
            "rows": [{ "cells": [cell("a"), cell("b")] }, { "cells": [cell("c"), cell("d")] }] }),
        json!({ "type": "card-grid", "id": "cards-1", "x": 480, "y": 290, "w": 440, "h": 200,
            "cards": [{ "title": "One", "body": "First" }, { "title": "Two" }] }),
    ];
    e.apply("add_elements", json!({ "slide": s, "elements": elements }))
        .unwrap();
    // A conversation and the odds of a next word have a slide each, at the size the composites fixture gives them.
    let talk = add(&mut e, "blank", json!({}));
    let odds = add(&mut e, "blank", json!({}));
    // A short conversation does not come back from a PowerPoint file as a conversation, so this is as long as the fixture of the composites.
    let messages = json!([
        { "role": "system", "text": "You are a helpful assistant with a weather tool." },
        { "role": "user", "text": "Do I need an umbrella in Oslo today?" },
        { "role": "toolCall", "text": "get_weather(city=\"Oslo\", day=\"today\")" },
        { "role": "toolResult", "text": "{\"temp_c\": 4, \"sky\": \"rain\", \"chance\": 0.9}" },
        { "role": "assistant", "text": "Yes: it is 4 degrees with a 90% chance of rain." }
    ]);
    let next = json!([
        { "token": " mat", "p": 0.42 }, { "token": " floor", "p": 0.3 }, { "token": " sofa", "p": 0.14 },
        { "token": " bed", "p": 0.09 }, { "token": " roof", "p": 0.05 }
    ]);
    e.apply(
        "add_elements",
        json!({ "slide": talk, "elements": [{ "type": "chat", "id": "chat-1", "x": 64, "y": 148, "w": 832, "h": 344, "messages": messages }] }),
    )
    .unwrap();
    e.apply(
        "add_elements",
        json!({ "slide": odds, "elements": [{ "type": "token-probs", "id": "probs-1", "x": 64, "y": 148, "w": 832, "h": 344,
            "tokens": ["The", " cat", " sat", " on", " the"], "chosen": 0, "next": next }] }),
    )
    .unwrap();
    e.apply(
        "set_transition",
        json!({ "ids": [s], "transition": { "kind": "fade", "duration": 0.4, "easing": "ease" } }),
    )
    .unwrap();
    e.apply(
        "set_background",
        json!({ "slide": s, "background": { "color": "bg2" } }),
    )
    .unwrap();
    let first = e.deck().slides[0].id.clone();
    e.apply("add_section", json!({ "at": first, "title": "Opening" }))
        .unwrap();
    e.apply("add_section", json!({ "at": s, "title": "Body" }))
        .unwrap();
    e
}

/// Puts `key` in every object at `path` of the deck, and says how many that was.
fn sow(value: &mut Value, path: &[&str], key: &str) -> usize {
    let Some((first, rest)) = path.split_first() else {
        return match value {
            Value::Object(map) => {
                map.insert(key.to_owned(), json!({ "kept": ["as it was", 1] }));
                1
            }
            _ => 0,
        };
    };
    match (*first, value) {
        ("*", Value::Array(items)) => items.iter_mut().map(|item| sow(item, rest, key)).sum(),
        ("*", Value::Object(map)) => map.values_mut().map(|item| sow(item, rest, key)).sum(),
        (name, Value::Object(map)) => map.get_mut(name).map_or(0, |child| sow(child, rest, key)),
        _ => 0,
    }
}

/// The deck as its file would be, with a field a newer build wrote in every kind of object.
fn sown_text() -> String {
    let mut value = canonical::to_value(everything().deck()).unwrap();
    for (kind, path, key) in KINDS {
        let planted = sow(&mut value, &path.split('/').collect::<Vec<_>>(), key);
        assert!(
            planted > 0,
            "the deck has no {kind} at {path} to plant {key} in"
        );
    }
    canonical::canonicalize(&mut value);
    let mut text = serde_json::to_string_pretty(&value).unwrap();
    text.push('\n');
    text
}

/// How many times each planted field is in a file.
fn planted(text: &str) -> BTreeMap<&'static str, usize> {
    KINDS
        .iter()
        .map(|(_, _, key)| (*key, text.matches(&format!("\"{key}\"")).count()))
        .collect()
}

fn fixture() -> String {
    fs::read_to_string(path()).unwrap_or_else(|e| panic!("{}: {e}", path().display()))
}

#[test]
#[ignore = "writes fixtures/decks; run by hand"]
fn write_unknown_fields_deep() {
    // A fixture is never rewritten to make a test pass: delete it on purpose first.
    if !path().exists() {
        fs::write(path(), sown_text()).unwrap();
    }
}

#[test]
fn the_plan_finds_every_kind_of_object_in_a_deck_the_operations_make() {
    let counts = planted(&sown_text());
    for (kind, path, key) in KINDS {
        assert!(counts[key] > 0, "{key} ({kind} at {path}) is planted");
    }
}

#[test]
fn the_fixture_has_a_field_nobody_knows_in_every_kind_of_object() {
    let counts = planted(&fixture());
    for (kind, path, key) in KINDS {
        assert!(
            counts[key] > 0,
            "{key} ({kind} at {path}) is in the fixture"
        );
    }
}

#[test]
fn every_object_keeps_the_fields_it_does_not_know_through_a_read_and_a_save() {
    let text = fixture();
    let saved = canonical::write(&canonical::parse(&text).unwrap()).unwrap();
    let (before, after) = (planted(&text), planted(&saved));
    let lost: Vec<String> = KINDS
        .iter()
        .filter(|(_, _, key)| before[key] != after[key])
        .map(|(kind, path, key)| {
            format!(
                "{key}: {kind} at {path} kept {} of {}",
                after[key], before[key]
            )
        })
        .collect();
    assert!(lost.is_empty(), "fields were lost:\n{}", lost.join("\n"));
    assert_eq!(saved, text, "and the file is the same, byte for byte");
}

#[test]
fn an_operation_that_has_nothing_to_do_with_them_leaves_them_as_they_were() {
    let text = fixture();
    let mut e = Engine::new(canonical::parse(&text).unwrap(), 5);
    let mut mirror = e.deck().clone();
    let slide = e.deck().slides[1].id.clone();
    let shape = "shape-a";
    let operations = [
        ("set_title", json!({ "title": "Another title" })),
        (
            "set_notes",
            json!({ "slide": slide, "notes": "Words to say" }),
        ),
        (
            "transform_elements",
            json!({ "slide": slide, "items": [{ "id": shape, "x": 60.0, "y": 70.0 }] }),
        ),
        ("add_slide", json!({ "layout": "title-body" })),
        ("set_slide_flags", json!({ "ids": [slide], "hidden": true })),
        (
            "move_slides",
            json!({ "ids": [e.deck().slides[0].id.clone()], "to": 1 }),
        ),
    ];
    let start = planted(&text);
    let mut states = vec![bytes(e.deck())];
    for (name, input) in operations {
        let applied = e
            .apply(name, input)
            .unwrap_or_else(|err| panic!("{name}: {err}"));
        applied.changes.apply_to(&mut mirror);
        assert_eq!(
            planted(&bytes(e.deck())),
            start,
            "{name} lost a field it had nothing to do with"
        );
        assert_eq!(
            bytes(&mirror),
            bytes(e.deck()),
            "{name}: the changes it reports do not carry the fields"
        );
        states.push(bytes(e.deck()));
    }
    // Taking every step back gives the file that was read, and doing them again gives what they made.
    while e.undo().is_some() {}
    assert_eq!(bytes(e.deck()), text);
    while e.redo().is_some() {}
    assert_eq!(bytes(e.deck()), *states.last().unwrap());
}

#[test]
fn a_field_planted_in_an_object_an_operation_writes_is_kept_when_that_operation_is_undone() {
    let text = fixture();
    let mut e = Engine::new(canonical::parse(&text).unwrap(), 6);
    let slide = e.deck().slides[1].id.clone();
    let words = text_box(&mut e, &slide, 10.0, 10.0, 100.0, 40.0, "new");
    e.apply(
        "delete_elements",
        json!({ "slide": slide, "ids": [words, "shape-a"] }),
    )
    .unwrap();
    e.undo().unwrap();
    e.undo().unwrap();
    assert_eq!(bytes(e.deck()), text);
}
