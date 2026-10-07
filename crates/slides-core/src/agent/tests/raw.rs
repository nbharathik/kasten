//! An assistant does not make raw elements, and does not change the ones an import made. It can
//! still move, resize, copy and delete them, and keep them through a change that replaces a deck.

use serde_json::{Value, json};

use super::{Kit, OUTLINE};
use crate::canonical;
use crate::model::{Base, Deck, Element, Extra, RawEl};

fn chart(id: &str) -> Element {
    Element::Raw(RawEl {
        base: Base::new(id).place(100.0, 120.0, 300.0, 200.0),
        original: Some("pptx:chart".into()),
        xml: Some("<p:graphicFrame/>".into()),
        preview: None,
        extra: Extra::new(),
    })
}

/// A store holding a deck whose second slide has a chart an import made, and an agent that has
/// not seen it yet. Returns the deck's name and that slide's id.
fn kit_with_a_chart() -> (Kit, String, String) {
    let mut kit = Kit::new();
    let name = kit.make(OUTLINE);
    let mut deck = kit.deck(&name);
    let slide = deck.slides[1].id.clone();
    deck.slides[1].elements.push(chart("e-chart"));
    kit.store.put(&name, &canonical::write(&deck).unwrap());
    kit.agent = super::super::Agent::new();
    (kit, name, slide)
}

fn refused(kit: &mut Kit, tool: &str, args: Value) -> String {
    let name = args["deck"].as_str().unwrap_or_default().to_owned();
    let before = kit.store.decks[&name].clone();
    let why = kit.err(tool, args);
    assert_eq!(kit.store.decks[&name], before, "the deck is as it was");
    why
}

fn said_why(why: &str) {
    assert!(
        why.contains("raw") && why.contains("importing a PowerPoint file"),
        "the sentence says where raw elements come from: {why}"
    );
}

#[test]
fn a_raw_element_cannot_be_added_however_it_is_asked_for() {
    let (mut kit, name, slide) = kit_with_a_chart();
    let made = json!({ "type": "raw", "x": 10, "y": 10, "w": 100, "h": 100, "original": "pptx:chart", "xml": "<p:graphicFrame><p:oleObj progId=\"Package\"/></p:graphicFrame>" });
    said_why(&refused(
        &mut kit,
        "add_elements",
        json!({ "deck": name, "slide": slide, "elements": [made] }),
    ));
    // Inside a group too.
    let group = json!({ "type": "group", "children": [made] });
    said_why(&refused(
        &mut kit,
        "add_elements",
        json!({ "deck": name, "slide": slide, "elements": [group] }),
    ));
    // And in a batch, with nothing of the batch kept.
    let why = refused(
        &mut kit,
        "update_elements",
        json!({ "deck": name, "operations": [
            { "op": "add_slide", "input": { "layout": "blank" } },
            { "op": "paste_elements", "input": { "slide": slide, "elements": [made] } },
        ] }),
    );
    said_why(&why);
    assert!(
        why.contains("Operation 2 of 2") && why.contains("paste_elements"),
        "{why}"
    );
}

#[test]
fn whole_slides_and_whole_decks_cannot_carry_a_new_raw_element_in() {
    let (mut kit, name, _) = kit_with_a_chart();
    let mut theirs: Deck = kit.deck(&name);
    let mut slide = theirs.slides[0].clone();
    slide.id = "s-theirs".to_owned();
    slide.elements.push(chart("e-theirs"));
    said_why(&refused(
        &mut kit,
        "update_elements",
        json!({ "deck": name, "operations": [{ "op": "add_slides", "input": { "slides": [slide] } }] }),
    ));
    theirs.slides[0].elements.push(chart("e-theirs"));
    said_why(&refused(
        &mut kit,
        "update_elements",
        json!({ "deck": name, "operations": [{ "op": "replace_deck", "input": { "deck": theirs } }] }),
    ));
}

#[test]
fn a_patch_of_the_theme_cannot_put_one_in_the_master_either() {
    let (mut kit, name, _) = kit_with_a_chart();
    let master = json!([{ "type": "raw", "id": "e-mine", "x": 0, "y": 0, "w": 50, "h": 50, "original": "pptx:chart", "xml": "<p:graphicFrame/>" }]);
    said_why(&refused(
        &mut kit,
        "edit_theme",
        json!({ "deck": name, "patch": { "master": master } }),
    ));
    said_why(&refused(
        &mut kit,
        "update_elements",
        json!({ "deck": name, "operations": [{ "op": "edit_theme", "input": { "patch": { "master": master } } }] }),
    ));
    // A patch that has nothing to do with raw elements is as it ever was.
    kit.ok(
        "edit_theme",
        json!({ "deck": name, "patch": { "dimmedOpacity": 0.4 } }),
    );
}

#[test]
fn a_raw_element_that_is_there_cannot_be_changed_but_can_be_moved_and_deleted() {
    let (mut kit, name, slide) = kit_with_a_chart();
    let why = refused(
        &mut kit,
        "patch_elements",
        json!({ "deck": name, "slide": slide, "patches": [{ "id": "e-chart", "patch": { "xml": "<p:graphicFrame><p:oleObj/></p:graphicFrame>" } }] }),
    );
    said_why(&why);
    assert!(
        why.contains("e-chart") && why.contains("transform_elements"),
        "{why}"
    );
    // Named by the slide's number, and in a batch: the same.
    said_why(&refused(
        &mut kit,
        "update_elements",
        json!({ "deck": name, "operations": [{ "op": "patch_elements", "input": { "slide": 2, "patches": [{ "id": "e-chart", "patch": { "name": "Mine" } }] } }] }),
    ));

    kit.ok(
        "transform_elements",
        json!({ "deck": name, "slide": slide, "items": [{ "id": "e-chart", "x": 300, "y": 200 }] }),
    );
    let now = kit.deck(&name);
    assert_eq!(
        now.slides[1].element("e-chart").and_then(|e| e.base().x),
        Some(300.0)
    );
    kit.ok(
        "delete_elements",
        json!({ "deck": name, "slide": slide, "ids": ["e-chart"] }),
    );
    assert!(kit.deck(&name).slides[1].element("e-chart").is_none());
}

#[test]
fn what_is_already_there_may_be_kept_through_a_change_that_brings_it_in_again() {
    let (mut kit, name, slide) = kit_with_a_chart();
    // The deck as read, sent back with a new title: the chart in it is the one that is there.
    let mut same = kit.deck(&name);
    same.title = "Renamed".to_owned();
    kit.ok(
        "update_elements",
        json!({ "deck": name, "operations": [{ "op": "replace_deck", "input": { "deck": same } }] }),
    );
    let now = kit.deck(&name);
    assert_eq!(now.title, "Renamed");
    assert!(
        now.slides[1].element("e-chart").is_some(),
        "the chart was kept"
    );
    // A copy of it is a copy, not a new thing.
    let copy = serde_json::to_value(chart("e-chart")).unwrap_or_default();
    kit.ok(
        "update_elements",
        json!({ "deck": name, "operations": [{ "op": "paste_elements", "input": { "slide": slide, "elements": [copy] } }] }),
    );
    assert_eq!(
        kit.deck(&name).slides[1]
            .elements
            .iter()
            .filter(|e| matches!(e, Element::Raw(_)))
            .count(),
        2
    );
    // Ordinary elements are as easy to add and change as ever.
    kit.ok(
        "add_elements",
        json!({ "deck": name, "slide": slide, "elements": [{ "type": "shape", "shape": "rect", "x": 10, "y": 10, "w": 50, "h": 50 }] }),
    );
}

#[test]
fn the_tools_do_not_offer_raw_as_a_kind_of_element() {
    let offered = super::super::tools()
        .iter()
        .map(|t| t.input_schema.to_string())
        .collect::<Vec<_>>()
        .join("\n");
    assert!(offered.contains("\"table\""), "the kinds are listed");
    assert!(!offered.contains("\"raw\""), "raw is not one of them");
}
