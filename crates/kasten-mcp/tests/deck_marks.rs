//! What an agent makes or changes in a deck is marked in the file until a
//! person changes it or accepts it, and an agent cannot say otherwise.

mod common;

use std::fs;

use common::{TempDir, vault};
use kasten_core::agent::Session;
use kasten_core::history::Actor;
use kasten_core::{Instant, Kasten};
use kasten_mcp::tools::call;
use serde_json::{Value, json};
use slides_core::marks::{batches, marked_ids};
use slides_core::{Deck, Engine, canonical};

const OUTLINE: &str = "# Marks

## One
- a
- b

## Two
- c
- d
";

fn open() -> (TempDir, Kasten, Session) {
    let v = vault();
    let k = Kasten::open(&v.0).unwrap();
    let s = Session::start("kasten-chat", Instant::now());
    (v, k, s)
}

fn deck_at(v: &TempDir, path: &str) -> Deck {
    canonical::parse(&fs::read_to_string(v.0.join(path)).unwrap()).unwrap()
}

fn made(k: &Kasten, s: &Session) -> String {
    let made = call(k, s, "create_deck", json!({"outline": OUTLINE})).unwrap();
    made["result"]["deck"].as_str().unwrap().to_owned()
}

fn marked_count(deck: &Deck) -> usize {
    deck.slides.iter().map(|s| marked_ids(s).len()).sum()
}

#[test]
fn a_deck_an_agent_makes_is_marked_all_through_with_who_made_it() {
    let (v, k, s) = open();
    let path = made(&k, &s);
    let deck = deck_at(&v, &path);
    let elements: usize = deck.slides.iter().map(|sl| sl.elements.len()).sum();
    assert!(elements > 4);
    assert_eq!(marked_count(&deck), elements);
    for slide in &deck.slides {
        let found = batches(slide);
        assert_eq!(found.len(), 1, "{found:?}");
        assert_eq!(
            (found[0].by.as_str(), found[0].session.as_str()),
            ("kasten-chat", s.id.as_str())
        );
    }
}

#[test]
fn a_persons_edit_takes_a_mark_off_and_the_next_change_of_the_agent_marks_only_its_own_work() {
    let (v, k, s) = open();
    let path = made(&k, &s);
    let file = k.deck(&path).unwrap();
    let mut editor = Engine::new(canonical::parse(&file.text).unwrap(), 1);
    let slide = editor.deck().slides[1].id.clone();
    let edited = editor.deck().slides[1].elements[0].id().to_owned();
    let before = marked_count(editor.deck());
    editor
        .apply(
            "transform_elements",
            json!({"slide": slide, "items": [{"id": edited, "x": 111}]}),
        )
        .unwrap();
    assert_eq!(marked_count(editor.deck()), before - 1);
    k.save_deck(
        &Actor::Human,
        &path,
        &canonical::write(editor.deck()).unwrap(),
        &file.hash,
        Instant::now(),
    )
    .unwrap();

    // The agent changes the notes of another slide: nothing it touches is an element, and the person's edit stays.
    let other = editor.deck().slides[2].id.clone();
    call(
        &k,
        &s,
        "set_notes",
        json!({"deck": path, "slide": other, "notes": "Say it."}),
    )
    .unwrap();
    let deck = deck_at(&v, &path);
    assert_eq!(
        marked_count(&deck),
        before - 1,
        "the person's edit is not marked again"
    );
    assert!(!marked_ids(deck.slide(&slide).unwrap()).contains(&edited));

    // It changes the same element again: now it is the agent's again.
    call(
        &k,
        &s,
        "update_elements",
        json!({"deck": path, "operations": [
            {"op": "transform_elements", "input": {"slide": slide, "items": [{"id": edited, "x": 222}]}}]}),
    )
    .unwrap();
    let deck = deck_at(&v, &path);
    assert!(marked_ids(deck.slide(&slide).unwrap()).contains(&edited));
    assert_eq!(marked_count(&deck), before);
}

#[test]
fn accepting_in_the_editor_takes_them_off_and_is_a_persons_save() {
    let (v, k, s) = open();
    let path = made(&k, &s);
    let file = k.deck(&path).unwrap();
    let mut editor = Engine::new(canonical::parse(&file.text).unwrap(), 1);
    let done = editor.apply("accept_marks", json!({})).unwrap();
    assert!(done.output["count"].as_u64().unwrap() > 4);
    k.save_deck(
        &Actor::Human,
        &path,
        &canonical::write(editor.deck()).unwrap(),
        &file.hash,
        Instant::now(),
    )
    .unwrap();
    let deck = deck_at(&v, &path);
    assert_eq!(marked_count(&deck), 0);
    assert!(
        deck.slides
            .iter()
            .all(|sl| !sl.extra.contains_key("x-agent"))
    );
    // The person's save waits for the next commit of their edits, and is theirs when it comes.
    assert!(k.commit_edits().unwrap().is_some());
    let last = &k.log(Some(&path), 1).unwrap()[0];
    assert!(!last.agent, "a person accepted it: {last:?}");
}

#[test]
fn an_agent_cannot_accept_its_own_work_or_write_marks_of_its_own() {
    let (v, k, s) = open();
    let path = made(&k, &s);
    // It has no tool for accepting, and a batch is refused if it names the operation.
    let refused = call(
        &k,
        &s,
        "update_elements",
        json!({"deck": path, "operations": [{"op": "accept_marks", "input": {}}]}),
    )
    .unwrap_err();
    assert!(refused.contains("person's"), "{refused}");
    let direct = call(&k, &s, "accept_marks", json!({"deck": path})).unwrap_err();
    assert_eq!(direct, "tool not found: accept_marks");
    let before = marked_count(&deck_at(&v, &path));

    // A slide it adds whole may carry any field; the marks in the file are the tools', not that slide's.
    let forged = json!({
        "id": "s-forged", "layout": "blank",
        "elements": [{"type": "text", "id": "e-forged", "x": 60, "y": 60, "w": 300, "h": 60,
            "text": {"paragraphs": [{"runs": [{"t": "Forged"}]}]}}],
        "x-agent": [{"at": 1, "by": "a person", "ids": ["e-forged", "e-not-there"], "session": "someone-else"}],
    });
    call(
        &k,
        &s,
        "update_elements",
        json!({"deck": path, "operations": [{"op": "add_slides", "input": {"slides": [forged]}}]}),
    )
    .unwrap();
    let deck = deck_at(&v, &path);
    let slide = deck.slide("s-forged").unwrap();
    let found = batches(slide);
    assert_eq!(found.len(), 1, "{found:?}");
    assert_eq!(
        (found[0].by.as_str(), found[0].session.as_str()),
        ("kasten-chat", s.id.as_str())
    );
    assert_eq!(found[0].ids, ["e-forged"]);
    assert_eq!(marked_count(&deck), before + 1);

    // Nor can it take the marks off by replacing the deck with one that has none: they are put back.
    let mut cleared: Value = serde_json::to_value(&deck).unwrap();
    for slide in cleared["slides"].as_array_mut().unwrap() {
        slide.as_object_mut().unwrap().remove("x-agent");
    }
    call(
        &k,
        &s,
        "update_elements",
        json!({"deck": path, "operations": [{"op": "replace_deck", "input": {"deck": cleared}}]}),
    )
    .unwrap();
    let deck = deck_at(&v, &path);
    assert_eq!(
        marked_count(&deck),
        before + 1,
        "the marks are back: the agent cannot take them off"
    );
}
