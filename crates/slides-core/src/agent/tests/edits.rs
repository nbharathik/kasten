//! Changing decks: operations as tools, batches, and the tools with a shape of their own.

use serde_json::json;

use super::{Kit, OUTLINE};
use crate::canonical;
use crate::model::Element;

#[test]
fn every_operation_is_a_tool_that_saves_the_deck_and_reports_its_problems() {
    let mut kit = Kit::new();
    let name = kit.make(OUTLINE);
    let before = kit.store.decks[&name].clone();
    let out = kit.ok("add_slide", json!({ "deck": name, "layout": "title-body", "content": { "title": "Results", "body": "- **fast**\n- cheap" } }));
    assert_eq!(out["slides"], 7);
    assert_eq!(out["changed"], true);
    assert_eq!(out["result"]["elements"].as_object().unwrap().len(), 2);
    assert_ne!(kit.store.decks[&name], before);
    let deck = kit.deck(&name);
    assert_eq!(
        canonical::write(&deck).unwrap(),
        kit.store.decks[&name],
        "the file is canonical"
    );
    let added = deck.slides.last().unwrap();
    assert!(added.elements[1].text().unwrap().paragraphs[0].runs[0].bold);
    assert_eq!(out["lint"]["errors"], 0);
    // An operation that changes nothing says so and writes nothing.
    let again = kit.ok(
        "set_notes",
        json!({ "deck": name, "slide": added.id, "notes": "" }),
    );
    assert_eq!(again["changed"], false);
    assert!(again.get("lint").is_none());
}

#[test]
fn a_refused_operation_says_why_and_changes_nothing() {
    let mut kit = Kit::new();
    let name = kit.make(OUTLINE);
    let before = kit.store.decks[&name].clone();
    let message = kit.err("add_slide", json!({ "deck": name, "layout": "nope" }));
    assert!(message.contains("title-body"), "{message}");
    assert_eq!(kit.store.decks[&name], before);
    let numbers = kit.err(
        "set_notes",
        json!({ "deck": name, "slide": 99, "notes": "x" }),
    );
    assert!(numbers.contains("99"), "{numbers}");
}

#[test]
fn a_slide_may_be_named_by_its_number() {
    let mut kit = Kit::new();
    let name = kit.make(OUTLINE);
    kit.ok(
        "set_notes",
        json!({ "deck": name, "slide": "3", "notes": "Say this." }),
    );
    assert_eq!(kit.deck(&name).slides[2].notes, "Say this.");
}

#[test]
fn a_batch_takes_effect_all_together_and_later_operations_can_use_earlier_answers() {
    let mut kit = Kit::new();
    let name = kit.make(OUTLINE);
    let out = kit.ok(
        "update_elements",
        json!({ "deck": name, "operations": [
            { "op": "add_slide", "input": { "layout": "title-only", "content": { "title": "The loop" } } },
            { "op": "add_diagram", "input": { "slide": "$1.slide",
                "nodes": [{ "id": "model", "label": "Model" }, { "id": "host", "label": "Host" }, { "id": "tool", "label": "Tool" }],
                "edges": [{ "from": "model", "to": "host" }, { "from": "host", "to": "tool" }] } },
            { "op": "set_notes", "input": { "slide": "$1.slide", "notes": "Walk the loop." } },
        ] }),
    );
    assert_eq!(out["operations"], 3);
    let deck = kit.deck(&name);
    let slide = deck.slides.last().unwrap();
    assert_eq!(slide.notes, "Walk the loop.");
    assert_eq!(
        slide
            .elements
            .iter()
            .filter(|e| matches!(e, Element::Connector(_)))
            .count(),
        2
    );
    assert_eq!(out["lint"]["errors"], 0, "{}", out["lint"]);

    // If the second operation fails, the first is not kept either.
    let before = kit.store.decks[&name].clone();
    let message = kit.err(
        "update_elements",
        json!({ "deck": name, "operations": [
            { "op": "add_slide", "input": { "layout": "blank" } },
            { "op": "set_text", "input": { "slide": "$1.slide", "id": "e-none", "markdown": "x" } },
        ] }),
    );
    assert!(
        message.contains("Operation 2 of 2") && message.contains("none of the batch"),
        "{message}"
    );
    assert_eq!(kit.store.decks[&name], before);
    assert!(
        kit.err(
            "update_elements",
            json!({ "deck": name, "operations": [{ "op": "frobnicate" }] })
        )
        .contains("frobnicate")
    );
    assert!(kit.err("update_elements", json!({ "deck": name, "operations": [{ "op": "add_slide", "input": { "content": { "title": "$9.slide" } } }] })).contains("$9.slide"));
}

#[test]
fn a_batch_takes_the_layout_tool_by_its_name_and_says_when_a_tool_cannot_be_batched() {
    let mut kit = Kit::new();
    let name = kit.make("# D\n\n## A\n- x\n\n## Empty");
    kit.ok(
        "update_elements",
        json!({ "deck": name, "operations": [
            { "op": "apply_layout", "input": { "slide": 3, "layout": "title-only" } },
            { "op": "set_notes", "input": { "slide": 3, "notes": "Said aloud." } },
        ] }),
    );
    let deck = kit.deck(&name);
    assert_eq!(deck.slides[2].layout, "title-only");
    assert_eq!(deck.slides[2].notes, "Said aloud.");

    let before = kit.store.decks[&name].clone();
    let message = kit.err(
        "update_elements",
        json!({ "deck": name, "operations": [{ "op": "reorder_slides", "input": { "order": [1, 2, 3] } }] }),
    );
    assert!(
        message.contains("`reorder_slides`")
            && message.contains("a tool of its own")
            && message.contains("call it by itself")
            && message.contains("move_slides"),
        "{message}"
    );
    let unknown = kit.err(
        "update_elements",
        json!({ "deck": name, "operations": [{ "op": "frobnicate" }] }),
    );
    assert!(unknown.contains("which is not an operation"), "{unknown}");
    assert_eq!(kit.store.decks[&name], before);
}

#[test]
fn new_text_elements_may_say_their_words_in_markdown() {
    let mut kit = Kit::new();
    let name = kit.make("# D\n\n## A\n- x");
    kit.ok(
        "add_elements",
        json!({ "deck": name, "slide": 2, "elements": [{ "type": "text", "id": "note", "x": 64, "y": 400, "w": 400, "h": 60, "markdown": "*Source:* the **survey**" }] }),
    );
    let deck = kit.deck(&name);
    let note = deck.slides[1].element("note").unwrap();
    let runs = &note.text().unwrap().paragraphs[0].runs;
    assert!(
        runs.iter().any(|r| r.italic && r.t == "Source:")
            && runs.iter().any(|r| r.bold && r.t == "survey")
    );
}

#[test]
fn slides_can_be_copied_reordered_and_put_on_another_layout() {
    let mut kit = Kit::new();
    let name = kit.make(OUTLINE);
    let ids: Vec<String> = kit
        .deck(&name)
        .slides
        .iter()
        .map(|s| s.id.clone())
        .collect();
    let copies = kit.ok(
        "duplicate_slide",
        json!({ "deck": name, "slide": 2, "count": 2 }),
    );
    assert_eq!(copies["result"]["slides"].as_array().unwrap().len(), 2);
    assert_eq!(kit.deck(&name).slides.len(), 8);
    assert!(
        kit.err(
            "duplicate_slide",
            json!({ "deck": name, "slide": 2, "count": 11 })
        )
        .contains("between 1 and 10")
    );

    let deck = kit.deck(&name);
    let mut order: Vec<String> = deck.slides.iter().map(|s| s.id.clone()).collect();
    order.reverse();
    kit.ok("reorder_slides", json!({ "deck": name, "order": order }));
    let reordered: Vec<String> = kit
        .deck(&name)
        .slides
        .iter()
        .map(|s| s.id.clone())
        .collect();
    assert_eq!(reordered, order);
    assert!(
        kit.err("reorder_slides", json!({ "deck": name, "order": [ids[0]] }))
            .contains("every slide once")
    );

    let target = reordered[0].clone();
    let moved = kit.ok(
        "apply_layout",
        json!({ "deck": name, "slide": target, "layout": "title-only" }),
    );
    assert_eq!(kit.deck(&name).slide(&target).unwrap().layout, "title-only");
    assert!(moved["result"]["detached"].is_array());
}

#[test]
fn morph_needs_a_slide_before_and_says_when_nothing_is_shared() {
    let mut kit = Kit::new();
    let name = kit.make(OUTLINE);
    assert!(
        kit.err("set_morph", json!({ "deck": name, "slide": 1 }))
            .contains("first slide")
    );
    let plain = kit.ok(
        "set_morph",
        json!({ "deck": name, "slide": 3, "duration": 0.8 }),
    );
    assert_eq!(plain["result"]["sharedWithPrevious"], 0);
    assert!(
        plain["result"]["note"]
            .as_str()
            .unwrap()
            .contains("duplicate_slide")
    );
    let copies = kit.ok("duplicate_slide", json!({ "deck": name, "slide": 2 }));
    let copy = copies["result"]["slides"][0].as_str().unwrap().to_owned();
    let morph = kit.ok("set_morph", json!({ "deck": name, "slide": copy }));
    assert!(morph["result"]["sharedWithPrevious"].as_u64().unwrap() >= 2);
    let deck = kit.deck(&name);
    assert_eq!(
        deck.slide(&copy).unwrap().transition.as_ref().unwrap().kind,
        crate::model::TransitionKind::Morph
    );
}

#[test]
fn steps_are_built_by_recipe_or_set_state_by_state() {
    let mut kit = Kit::new();
    let name = kit.make("# D\n\n## Loop\n- a\n- b\n- c");
    kit.ok("add_diagram", json!({ "deck": name, "slide": 2, "nodes": [{ "id": "a", "label": "A" }, { "id": "b", "label": "B" }, { "id": "c", "label": "C" }], "edges": [{ "from": "a", "to": "b" }, { "from": "b", "to": "c" }] }));
    let built = kit.ok(
        "set_steps",
        json!({ "deck": name, "slide": 2, "recipe": "reveal" }),
    );
    assert!(built["result"]["steps"].as_u64().unwrap() >= 3, "{built}");
    let deck = kit.deck(&name);
    assert_eq!(
        deck.slides[1].steps as u64,
        built["result"]["steps"].as_u64().unwrap()
    );
    let clear = kit.ok(
        "set_steps",
        json!({ "deck": name, "slide": 2, "recipe": "clear" }),
    );
    assert_eq!(clear["result"]["steps"], 0);

    let body = kit.deck(&name).slides[1].elements[1].id().to_owned();
    kit.ok("set_steps", json!({ "deck": name, "slide": 2, "states": { body.clone(): { "0": "hidden", "2": "normal" } } }));
    let deck = kit.deck(&name);
    assert_eq!(deck.slides[1].steps, 2);
    assert_eq!(
        deck.slides[1]
            .element(&body)
            .unwrap()
            .base()
            .step_states
            .len(),
        2
    );
    kit.ok("set_steps", json!({ "deck": name, "slide": 2, "steps": 4 }));
    assert_eq!(kit.deck(&name).slides[1].steps, 4);

    assert!(
        kit.err("set_steps", json!({ "deck": name, "slide": 2 }))
            .contains("recipe")
    );
    assert!(
        kit.err(
            "set_steps",
            json!({ "deck": name, "slide": 2, "recipe": "dance" })
        )
        .contains("dance")
    );
}

#[test]
fn deleting_slides_keeps_a_copy_of_the_deck_first() {
    let mut kit = Kit::new();
    let name = kit.make(OUTLINE);
    let before = kit.store.decks[&name].clone();
    let doomed = kit.deck(&name).slides[3].id.clone();
    kit.ok("delete_slides", json!({ "deck": name, "ids": [doomed] }));
    assert_eq!(kit.deck(&name).slides.len(), 5);
    let kept = kit
        .store
        .trashed
        .iter()
        .find(|(place, _)| place.contains("before delete_slides"))
        .expect("a copy was kept");
    assert_eq!(kept.1, before);
}

#[test]
fn a_change_to_a_deck_someone_else_changed_is_kept_beside_it_and_the_deck_is_left_alone() {
    let mut kit = Kit::new();
    let name = kit.make(OUTLINE);
    kit.call("get_deck", json!({ "deck": name })).unwrap();
    // A person edits the deck (here: renames it), after the agent looked.
    let mut theirs = kit.deck(&name);
    theirs.title = "Renamed by a person".to_owned();
    let their_text = canonical::write(&theirs).unwrap();
    kit.store.put(&name, &their_text);

    let message = kit.err("add_slide", json!({ "deck": name, "layout": "blank" }));
    assert!(
        message.contains("changed by someone else") && message.contains("conflict"),
        "{message}"
    );
    assert_eq!(
        kit.store.decks[&name], their_text,
        "their deck is untouched"
    );
    let copy = kit
        .store
        .decks
        .keys()
        .find(|k| k.contains("(conflict"))
        .expect("the agent's change is kept as a copy");
    let copy = canonical::parse(&kit.store.decks[copy]).unwrap();
    assert_eq!(
        copy.slides.len(),
        7,
        "the copy holds the change, made to what the agent had seen"
    );
    assert_eq!(copy.title, "Tool use in models");

    // After reading again, the change goes through, on top of their version.
    kit.call("get_deck", json!({ "deck": name })).unwrap();
    kit.ok("add_slide", json!({ "deck": name, "layout": "blank" }));
    let now = kit.deck(&name);
    assert_eq!(
        (now.title.as_str(), now.slides.len()),
        ("Renamed by a person", 7)
    );
}

#[test]
fn an_agent_that_has_not_read_a_deck_changes_it_as_it_is_now() {
    let mut kit = Kit::new();
    let name = kit.make(OUTLINE);
    let mut theirs = kit.deck(&name);
    theirs.title = "Theirs".to_owned();
    kit.store.put(&name, &canonical::write(&theirs).unwrap());
    // A new connection has seen nothing, so it works from the deck as it is.
    let mut fresh = super::Agent::new();
    fresh
        .call(
            &mut kit.store,
            "add_slide",
            json!({ "deck": name, "layout": "blank" }),
        )
        .unwrap();
    let now = kit.deck(&name);
    assert_eq!((now.title.as_str(), now.slides.len()), ("Theirs", 7));
    assert_eq!(kit.store.decks.len(), 1, "no copy was needed");
}

#[test]
fn diagrams_are_drawn_by_the_tool_and_come_out_clean() {
    let mut kit = Kit::new();
    let name = kit.make("# D\n\n## Loop\n- a");
    kit.ok(
        "delete_elements",
        json!({ "deck": name, "slide": 2, "ids": [kit.deck(&name).slides[1].elements[1].id()] }),
    );
    let out = kit.ok("add_diagram", json!({ "deck": name, "slide": 2, "direction": "topDown",
        "nodes": [{ "id": "q", "label": "Question", "emphasis": true }, { "id": "a", "label": "Answer" }],
        "edges": [{ "from": "q", "to": "a", "label": "ask" }] }));
    assert_eq!(out["result"]["connectors"].as_array().unwrap().len(), 1);
    assert_eq!(out["lint"]["errors"], 0, "{}", out["lint"]);
    assert_eq!(out["lint"]["warnings"], 0, "{}", out["lint"]);
}

#[test]
fn an_agent_cannot_accept_its_own_work() {
    let mut kit = Kit::new();
    let name = kit.make(OUTLINE);
    let before = kit.store.decks[&name].clone();
    assert!(
        crate::agent::tools()
            .iter()
            .all(|tool| tool.name != "accept_marks"),
        "the operation is the editor's, not a tool"
    );
    let direct = kit.err("accept_marks", json!({ "deck": name }));
    assert!(direct.contains("the person's"), "{direct}");
    let batch = kit.err(
        "update_elements",
        json!({ "deck": name, "operations": [
            { "op": "set_notes", "input": { "slide": 1, "notes": "Said first." } },
            { "op": "accept_marks", "input": {} },
        ] }),
    );
    assert!(
        batch.contains("Operation 2") && batch.contains("the person's"),
        "{batch}"
    );
    assert_eq!(
        kit.store.decks[&name], before,
        "none of the batch was applied"
    );
    let other = kit.err(
        "update_elements",
        json!({ "deck": name, "operations": [{ "op": "nope", "input": {} }] }),
    );
    assert!(!other.contains("accept_marks"), "not offered: {other}");
}
