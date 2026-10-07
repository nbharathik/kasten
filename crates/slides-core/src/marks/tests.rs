//! The marks on an assistant's work: who made which elements, until a person
//! changes them or accepts them.

use serde_json::{Value, json};

use super::{AgentBatch, Author, KEY, batches, marked_ids, stamp, stamp_new};
use crate::canonical;
use crate::model::Deck;
use crate::ops::Engine;

fn author(by: &str, session: &str, at: u64) -> Author {
    Author {
        by: by.to_owned(),
        session: session.to_owned(),
        at,
    }
}

fn bytes(deck: &Deck) -> String {
    canonical::write(deck).unwrap()
}

/// A deck with one blank slide holding the text boxes `a`, `b` and `c`.
fn deck_of_three() -> (Engine, String) {
    let mut e = Engine::create("Marks", "Light", 3).unwrap();
    let slide = e
        .apply("add_slide", json!({ "layout": "blank" }))
        .unwrap()
        .output["slide"]
        .as_str()
        .unwrap()
        .to_owned();
    let boxes: Vec<Value> = ["a", "b", "c"]
        .iter()
        .enumerate()
        .map(|(i, id)| {
            json!({ "type": "text", "id": id, "x": 60 + i * 200, "y": 100, "w": 160, "h": 60,
                "text": { "paragraphs": [{ "runs": [{ "t": id }] }] } })
        })
        .collect();
    e.apply("add_elements", json!({ "slide": slide, "elements": boxes }))
        .unwrap();
    (e, slide)
}

fn move_to(e: &mut Engine, slide: &str, id: &str, x: u32) {
    e.apply(
        "transform_elements",
        json!({ "slide": slide, "items": [{ "id": id, "x": x }] }),
    )
    .unwrap();
}

fn marked(deck: &Deck, slide: &str) -> Vec<String> {
    let mut ids: Vec<String> = marked_ids(deck.slide(slide).unwrap()).into_iter().collect();
    ids.sort();
    ids
}

#[test]
fn the_elements_an_agent_made_or_changed_are_marked_and_the_rest_are_not() {
    let (mut e, slide) = deck_of_three();
    let before = e.deck().clone();
    move_to(&mut e, &slide, "b", 500);
    e.apply(
        "add_elements",
        json!({ "slide": slide, "elements": [{ "type": "text", "id": "d", "x": 60, "y": 300, "w": 100, "h": 40,
            "text": { "paragraphs": [{ "runs": [{ "t": "d" }] }] } }] }),
    )
    .unwrap();
    let mut after = e.deck().clone();
    stamp(&before, &mut after, &author("kasten-chat", "s1", 1000));
    let found = batches(after.slide(&slide).unwrap());
    assert_eq!(found.len(), 1, "{found:?}");
    let batch = &found[0];
    assert_eq!(
        (batch.at, batch.by.as_str(), batch.session.as_str()),
        (1000, "kasten-chat", "s1")
    );
    assert_eq!(batch.ids, ["b", "d"], "in the order they are on the slide");
    // The title slide the deck started with was not touched.
    let first = &after.slides[0].id;
    assert!(batches(after.slide(first).unwrap()).is_empty());
}

#[test]
fn work_that_leaves_an_element_as_it_was_marks_nothing() {
    let (e, slide) = deck_of_three();
    let before = e.deck().clone();
    let mut after = before.clone();
    stamp(&before, &mut after, &author("claude-code", "s1", 5));
    assert!(marked(&after, &slide).is_empty());
    assert_eq!(
        bytes(&before),
        bytes(&after),
        "not even an empty key is written"
    );
}

#[test]
fn earlier_marks_stay_and_a_later_author_takes_over_what_it_changed() {
    let (e, slide) = deck_of_three();
    let start = e.deck().clone();
    // The first agent moves `a`.
    let mut engine = Engine::new(start.clone(), 1);
    move_to(&mut engine, &slide, "a", 300);
    let mut first = engine.deck().clone();
    stamp(&start, &mut first, &author("claude-code", "s1", 10));
    // A second one opens the file, marks and all, and moves `b`.
    let mut engine = Engine::new(first.clone(), 2);
    move_to(&mut engine, &slide, "b", 320);
    let mut second = engine.deck().clone();
    stamp(&first, &mut second, &author("kasten-chat", "s2", 20));
    let found = batches(second.slide(&slide).unwrap());
    assert_eq!(found.len(), 2, "{found:?}");
    assert_eq!(
        (found[0].by.as_str(), found[0].ids.as_slice()),
        ("claude-code", ["a".to_owned()].as_slice())
    );
    assert_eq!(
        (found[1].by.as_str(), found[1].ids.as_slice()),
        ("kasten-chat", ["b".to_owned()].as_slice())
    );
    // The second one changes `a` too: `a` is now its work, and the two batches of its session are one.
    let mut engine = Engine::new(second.clone(), 3);
    move_to(&mut engine, &slide, "a", 41);
    let mut third = engine.deck().clone();
    stamp(&second, &mut third, &author("kasten-chat", "s2", 30));
    let found = batches(third.slide(&slide).unwrap());
    assert_eq!(found.len(), 1, "{found:?}");
    assert_eq!(found[0].ids, ["a", "b"]);
    assert_eq!(found[0].at, 30, "as of the latest work");
}

#[test]
fn marks_the_work_itself_took_off_come_back_because_the_work_is_still_the_agents() {
    // An agent's own operations take the mark off what they touch (they are edits like any other);
    // the tool layer writes the marks from what differs, so they are back, as the agent's.
    let (e, slide) = deck_of_three();
    let start = e.deck().clone();
    let mut marked_deck = start.clone();
    stamp_new(&mut marked_deck, &author("claude-code", "s1", 1));
    let mut engine = Engine::new(marked_deck.clone(), 2);
    move_to(&mut engine, &slide, "c", 480);
    assert_eq!(
        marked(engine.deck(), &slide),
        ["a", "b"],
        "the operation cleared c"
    );
    let mut after = engine.deck().clone();
    stamp(&marked_deck, &mut after, &author("claude-code", "s1", 2));
    assert_eq!(marked(&after, &slide), ["a", "b", "c"]);
}

#[test]
fn a_group_is_marked_for_its_own_change_and_a_child_for_its_own() {
    let (mut e, slide) = deck_of_three();
    e.apply(
        "group_elements",
        json!({ "slide": slide, "ids": ["a", "b"] }),
    )
    .unwrap();
    let group = e.deck().slide(&slide).unwrap().elements[0].id().to_owned();
    let before = e.deck().clone();
    // Only the child `a` changes: the group as such does not.
    let mut after_engine = Engine::new(before.clone(), 4);
    after_engine
        .apply(
            "patch_elements",
            json!({ "slide": slide, "patches": [{ "id": "a", "patch": { "alt": "words" } }] }),
        )
        .unwrap();
    let mut after = after_engine.deck().clone();
    stamp(&before, &mut after, &author("claude-code", "s", 1));
    assert_eq!(marked(&after, &slide), ["a"], "not the group {group}");
}

#[test]
fn everything_in_a_new_deck_is_marked() {
    let (e, slide) = deck_of_three();
    let mut deck = e.deck().clone();
    stamp_new(&mut deck, &author("claude-code", "s", 7));
    assert_eq!(marked(&deck, &slide), ["a", "b", "c"]);
    let first = deck.slides[0].id.clone();
    assert!(!marked(&deck, &first).is_empty(), "the cover's boxes too");
}

#[test]
fn marks_are_kept_when_a_deck_is_written_and_read_again() {
    let (e, slide) = deck_of_three();
    let mut deck = e.deck().clone();
    stamp_new(&mut deck, &author("claude-code", "01J", 99));
    let text = bytes(&deck);
    assert!(text.contains(&format!("\"{KEY}\"")), "{text}");
    let back = canonical::parse(&text).unwrap();
    assert_eq!(bytes(&back), text);
    assert_eq!(
        batches(back.slide(&slide).unwrap()),
        batches(deck.slide(&slide).unwrap())
    );
    // A build that does not know the key still keeps it: it is one of `extra`'s.
    let value: Value = serde_json::from_str(&text).unwrap();
    assert!(value["slides"][1][KEY].is_array(), "{value}");
}

#[test]
fn a_person_changing_a_marked_element_takes_its_mark_off_in_the_same_step() {
    let (e, slide) = deck_of_three();
    let mut deck = e.deck().clone();
    stamp_new(&mut deck, &author("claude-code", "s", 1));
    let marked_bytes = bytes(&deck);
    let mut editor = Engine::new(deck, 2);
    move_to(&mut editor, &slide, "b", 480);
    assert_eq!(marked(editor.deck(), &slide), ["a", "c"]);
    // One undo brings back the move and the mark together, exactly.
    editor.undo().unwrap();
    assert_eq!(bytes(editor.deck()), marked_bytes);
    editor.redo().unwrap();
    assert_eq!(marked(editor.deck(), &slide), ["a", "c"]);
}

#[test]
fn an_operation_that_changes_nothing_of_an_element_keeps_its_mark() {
    let (e, slide) = deck_of_three();
    let mut deck = e.deck().clone();
    stamp_new(&mut deck, &author("claude-code", "s", 1));
    let mut editor = Engine::new(deck, 2);
    // Where an element stands in the stack is not the element.
    editor
        .apply(
            "reorder_elements",
            json!({ "slide": slide, "ids": ["a"], "to": "front" }),
        )
        .unwrap();
    // Saying the x it has already changes nothing.
    move_to(&mut editor, &slide, "b", 260);
    assert_eq!(marked(editor.deck(), &slide), ["a", "b", "c"]);
    // A change to c takes only c's mark.
    move_to(&mut editor, &slide, "c", 470);
    assert_eq!(marked(editor.deck(), &slide), ["a", "b"]);
}

#[test]
fn deleting_a_marked_element_takes_its_mark_and_the_batch_when_it_was_the_last() {
    let (e, slide) = deck_of_three();
    let mut deck = e.deck().clone();
    let start = deck.clone();
    move_to_deck(&mut deck, &slide, "b");
    stamp(&start, &mut deck, &author("claude-code", "s", 1));
    let mut editor = Engine::new(deck, 2);
    assert_eq!(marked(editor.deck(), &slide), ["b"]);
    editor
        .apply("delete_elements", json!({ "slide": slide, "ids": ["b"] }))
        .unwrap();
    assert!(batches(editor.deck().slide(&slide).unwrap()).is_empty());
    assert!(
        editor
            .deck()
            .slide(&slide)
            .unwrap()
            .extra
            .get(KEY)
            .is_none(),
        "no empty key is left behind"
    );
}

fn move_to_deck(deck: &mut Deck, slide: &str, id: &str) {
    let mut e = Engine::new(deck.clone(), 5);
    move_to(&mut e, slide, id, 700);
    *deck = e.deck().clone();
}

#[test]
fn a_copy_of_a_slide_is_as_marked_as_the_slide() {
    let (e, slide) = deck_of_three();
    let mut deck = e.deck().clone();
    stamp_new(&mut deck, &author("claude-code", "s", 1));
    let mut editor = Engine::new(deck, 2);
    let copy = editor
        .apply("duplicate_slides", json!({ "ids": [slide] }))
        .unwrap()
        .output["slides"][0]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(marked(editor.deck(), &copy), ["a", "b", "c"]);
}

#[test]
fn accepting_takes_the_marks_off_a_slide_or_the_deck_or_some_elements_and_undo_puts_them_back() {
    let (e, slide) = deck_of_three();
    let mut deck = e.deck().clone();
    stamp_new(&mut deck, &author("claude-code", "s", 1));
    let first = deck.slides[0].id.clone();
    let start = bytes(&deck);
    let mut editor = Engine::new(deck, 2);

    let done = editor
        .apply("accept_marks", json!({ "slide": slide, "ids": ["b"] }))
        .unwrap();
    assert_eq!(done.output["count"], json!(1));
    assert_eq!(marked(editor.deck(), &slide), ["a", "c"]);

    editor
        .apply("accept_marks", json!({ "slide": slide }))
        .unwrap();
    assert!(marked(editor.deck(), &slide).is_empty());
    assert!(
        !marked(editor.deck(), &first).is_empty(),
        "another slide is untouched"
    );

    let all = editor.apply("accept_marks", json!({})).unwrap();
    assert!(all.output["count"].as_u64().unwrap() > 0);
    assert!(marked(editor.deck(), &first).is_empty());
    for slide in &editor.deck().slides {
        assert!(!slide.extra.contains_key(KEY));
    }
    // Nothing left to accept changes nothing and leaves nothing to undo.
    let steps = editor.can_undo();
    let none = editor.apply("accept_marks", json!({})).unwrap();
    assert_eq!(none.output["count"], json!(0));
    assert!(none.changes.is_empty() && steps);

    while editor.can_undo() {
        editor.undo().unwrap();
    }
    assert_eq!(
        bytes(editor.deck()),
        start,
        "undo gives back the bytes there were"
    );
}

#[test]
fn accepting_elements_needs_the_slide_they_are_on_and_a_slide_that_exists() {
    let (e, _) = deck_of_three();
    let mut editor = Engine::new(e.deck().clone(), 2);
    assert!(
        editor
            .apply("accept_marks", json!({ "ids": ["a"] }))
            .is_err()
    );
    assert!(
        editor
            .apply("accept_marks", json!({ "slide": "s-nope" }))
            .is_err()
    );
}

#[test]
fn a_batch_that_is_not_what_it_should_be_is_left_alone() {
    let (e, slide) = deck_of_three();
    let mut deck = e.deck().clone();
    deck.slide_mut(&slide)
        .unwrap()
        .extra
        .insert(KEY.to_owned(), json!("by hand"));
    assert!(batches(deck.slide(&slide).unwrap()).is_empty());
    let text = bytes(&deck);
    assert_eq!(
        bytes(&canonical::parse(&text).unwrap()),
        text,
        "kept as written"
    );
    let mut editor = Engine::new(deck, 2);
    move_to(&mut editor, &slide, "a", 33);
    assert_eq!(
        editor.deck().slide(&slide).unwrap().extra[KEY],
        json!("by hand")
    );
}

#[test]
fn a_batch_is_json_of_at_by_ids_and_session() {
    let batch = AgentBatch {
        at: 5,
        by: "claude-code".to_owned(),
        ids: vec!["e-1".to_owned()],
        session: "01J".to_owned(),
    };
    assert_eq!(
        serde_json::to_value(&batch).unwrap(),
        json!({ "at": 5, "by": "claude-code", "ids": ["e-1"], "session": "01J" })
    );
    let bare: AgentBatch =
        serde_json::from_value(json!({ "at": 1, "by": "x", "ids": [] })).unwrap();
    assert_eq!(bare.session, "");
}

#[test]
fn what_the_agents_operations_wrote_in_the_field_is_not_what_is_kept() {
    let (e, slide) = deck_of_three();
    let start = e.deck().clone();
    // The tools' operations made a mark up, and a string on another slide.
    let mut after = start.clone();
    after.slide_mut(&slide).unwrap().extra.insert(
        KEY.to_owned(),
        json!([{ "at": 1, "by": "nobody", "ids": ["a", "b", "c"] }]),
    );
    after.slides[0].extra.insert(KEY.to_owned(), json!("junk"));
    stamp(&start, &mut after, &author("claude-code", "s", 5));
    assert!(marked(&after, &slide).is_empty(), "nothing was changed");
    assert!(!after.slides[0].extra.contains_key(KEY));
    assert_eq!(bytes(&after), bytes(&start));

    // A value a person left there before the agent came is left alone, while the work does not touch it.
    let mut by_hand = start.clone();
    by_hand.slides[0]
        .extra
        .insert(KEY.to_owned(), json!("by hand"));
    let mut same = by_hand.clone();
    stamp(&by_hand, &mut same, &author("claude-code", "s", 5));
    assert_eq!(same.slides[0].extra[KEY], json!("by hand"));

    // And what the work changed is marked whatever the field said.
    let mut engine = Engine::new(start.clone(), 3);
    move_to(&mut engine, &slide, "b", 500);
    let mut forged = engine.deck().clone();
    forged.slide_mut(&slide).unwrap().extra.insert(
        KEY.to_owned(),
        json!([{ "at": 9, "by": "someone else", "ids": ["a"] }]),
    );
    stamp(&start, &mut forged, &author("claude-code", "s", 7));
    let found = batches(forged.slide(&slide).unwrap());
    assert_eq!(found.len(), 1, "{found:?}");
    assert_eq!(
        (found[0].by.as_str(), found[0].ids.as_slice()),
        ("claude-code", ["b".to_owned()].as_slice())
    );
}

#[test]
fn marks_that_come_with_slides_made_elsewhere_are_not_kept() {
    // `add_slides` and `replace_deck` take whole slides, so a mark could be put in one.
    let (e, slide) = deck_of_three();
    let mut made_up = e.deck().slide(&slide).unwrap().clone();
    made_up.id = "s-elsewhere".to_owned();
    made_up.extra.insert(
        KEY.to_owned(),
        json!([{ "at": 1, "by": "someone", "ids": ["a"] }]),
    );
    let mut editor = Engine::new(e.deck().clone(), 2);
    editor
        .apply("add_slides", json!({ "slides": [made_up] }))
        .unwrap();
    assert!(marked(editor.deck(), "s-elsewhere").is_empty());
    assert!(
        !editor
            .deck()
            .slide("s-elsewhere")
            .unwrap()
            .extra
            .contains_key(KEY)
    );

    let mut other = e.deck().clone();
    other.slide_mut(&slide).unwrap().extra.insert(
        KEY.to_owned(),
        json!([{ "at": 1, "by": "someone", "ids": ["a", "b"] }]),
    );
    editor
        .apply("replace_deck", json!({ "deck": other }))
        .unwrap();
    assert!(marked(editor.deck(), &slide).is_empty());
    assert!(!editor.deck().slide(&slide).unwrap().extra.contains_key(KEY));
}
