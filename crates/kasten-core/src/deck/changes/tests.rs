//! What a change did to a deck, read from the two texts.

use serde_json::json;

use super::*;

fn slide(id: &str, title: &str) -> Value {
    json!({
        "elements": [{
            "id": format!("e-{id}"), "placeholder": "title", "type": "text",
            "text": { "paragraphs": [{ "runs": [{ "t": title }] }] },
        }],
        "id": id,
        "layout": "title-body",
    })
}

fn deck(title: &str, slides: &[Value]) -> String {
    json!({ "format": "kasten-deck", "formatVersion": 1, "title": title, "slides": slides })
        .to_string()
}

#[test]
fn slides_added_removed_changed_and_reordered_are_told_apart() {
    let (a, b, c, d) = (
        slide("s-a", "A"),
        slide("s-b", "B"),
        slide("s-c", "C"),
        slide("s-d", "D"),
    );
    let before = deck("Talk", &[a.clone(), b.clone(), c.clone()]);
    let same = slide_changes(&before, &before);
    assert!(same.is_empty(), "{same:?}");

    let after = deck("Talk", &[a.clone(), slide("s-b", "B, reworded"), d.clone()]);
    let diff = slide_changes(&before, &after);
    let ids = |list: &[SlideRef]| list.iter().map(|s| s.id.clone()).collect::<Vec<_>>();
    assert_eq!(ids(&diff.removed), ["s-c"]);
    assert_eq!(ids(&diff.added), ["s-d"]);
    assert_eq!(ids(&diff.changed), ["s-b"]);
    assert_eq!(diff.changed[0].title, "B, reworded", "named as it is now");
    assert!(!diff.reordered && !diff.settings);

    let swapped = deck("Talk", &[b, a, c]);
    let diff = slide_changes(&before, &swapped);
    assert!(
        diff.reordered
            && diff.added.is_empty()
            && diff.removed.is_empty()
            && diff.changed.is_empty()
    );
    // Slides added or removed are not a new order.
    let fewer = deck("Talk", &[slide("s-c", "C"), slide("s-a", "A")]);
    assert!(slide_changes(&before, &fewer).reordered);
    let last_gone = deck("Talk", &[slide("s-a", "A"), slide("s-b", "B")]);
    assert!(!slide_changes(&before, &last_gone).reordered);
}

#[test]
fn what_is_outside_the_slides_is_the_decks_settings() {
    let one = [slide("s-a", "A")];
    let before = deck("Talk", &one);
    let renamed = slide_changes(&before, &deck("Talk, 2nd", &one));
    assert!(renamed.settings && renamed.added.is_empty() && renamed.changed.is_empty());
    let with_theme = json!({ "format": "kasten-deck", "formatVersion": 1, "title": "Talk", "slides": one, "theme": { "name": "Dark" } });
    assert!(slide_changes(&before, &with_theme.to_string()).settings);
}

#[test]
fn a_slide_is_named_by_its_title_then_its_first_words_then_its_layout() {
    let titled = slide("s-a", "  The   plan \n now ");
    assert_eq!(title_of(&titled), "The plan now");
    let untitled = json!({ "id": "s-b", "layout": "blank", "elements": [
        { "id": "e-1", "type": "shape", "text": { "paragraphs": [{ "runs": [{ "t": "First " }, { "t": "words" }] }] } }
    ]});
    assert_eq!(title_of(&untitled), "First words");
    let empty = json!({ "id": "s-c", "layout": "blank", "elements": [] });
    assert_eq!(title_of(&empty), "blank");
    assert_eq!(title_of(&json!({ "id": "s-d" })), "slide");
    let long = slide("s-e", &"word ".repeat(40));
    assert!(title_of(&long).ends_with('…') && title_of(&long).chars().count() <= TITLE_CHARS + 1);
}

#[test]
fn a_change_in_words() {
    let slides_of: Vec<Value> = ["Intro", "Method", "Data", "Results", "Limits", "Thanks"]
        .iter()
        .enumerate()
        .map(|(n, t)| slide(&format!("s-{n}"), t))
        .collect();
    let before = deck("Talk", &slides_of);
    let after = deck("Talk", &slides_of[4..]);
    assert_eq!(
        slide_changes(&before, &after).words(),
        "Removes 4 slides (“Intro”, “Method”, “Data” and “Results”)"
    );
    let many = deck("Talk", &[]);
    assert_eq!(
        slide_changes(&before, &many).words(),
        "Removes 6 slides (“Intro”, “Method”, “Data”, “Results” and 2 more)"
    );
    let grown = deck(
        "Talk",
        &[slides_of.clone(), vec![slide("s-x", "Extra")]].concat(),
    );
    assert_eq!(
        slide_changes(&before, &grown).words(),
        "Adds 1 slide (“Extra”)"
    );
    let one = deck("Talk", &slides_of[..1]);
    assert_eq!(slide_changes(&one, &one).words(), "Changes nothing");
}

fn slide_with(id: &str, elements: Value) -> Value {
    json!({ "id": id, "layout": "title-body", "elements": elements })
}

fn text_box(id: &str, placeholder: Option<&str>, words: &str) -> Value {
    let mut e = json!({ "id": id, "type": "text", "text": { "paragraphs": [{ "runs": [{ "t": words }] }] } });
    if let Some(p) = placeholder {
        e["placeholder"] = json!(p);
    }
    e
}

#[test]
fn a_slide_left_with_nothing_on_it_is_taken_out_though_its_id_is_still_there() {
    let full = |id: &str| {
        slide_with(
            id,
            json!([text_box("e-1", Some("title"), "Results"), text_box("e-2", Some("body"), "Words"), { "id": "e-3", "type": "shape" }]),
        )
    };
    let before = deck(
        "Talk",
        &[full("s-a"), full("s-b"), full("s-c"), full("s-d")],
    );
    // Every element deleted: no elements at all.
    let bare = slide_with("s-a", json!([]));
    // Only the empty boxes of the layout left, as a slide is after its words are deleted.
    let hollow = slide_with(
        "s-b",
        json!([
            text_box("e-1", Some("title"), ""),
            text_box("e-2", Some("body"), "  \n ")
        ]),
    );
    // A group of nothing but empty boxes is nothing too.
    let group = slide_with(
        "s-c",
        json!([{ "id": "g-1", "type": "group", "children": [text_box("e-1", None, "")] }]),
    );
    // A picture or a shape is something, and so is a title with words.
    let kept = slide_with("s-d", json!([text_box("e-1", Some("title"), "Still here")]));
    let diff = slide_changes(&before, &deck("Talk", &[bare, hollow, group, kept]));
    let ids = |list: &[SlideRef]| list.iter().map(|s| s.id.clone()).collect::<Vec<_>>();
    assert_eq!(ids(&diff.emptied), ["s-a", "s-b", "s-c"]);
    assert_eq!(ids(&diff.changed), ["s-d"]);
    assert!(diff.removed.is_empty());
    assert_eq!(diff.taken_out(), 3);
    assert!(
        diff.words().starts_with("Empties 3 slides (“"),
        "{}",
        diff.words()
    );
}

#[test]
fn a_slide_that_was_empty_already_is_not_counted_and_a_removed_one_counts_once() {
    let empty = slide_with("s-a", json!([text_box("e-1", Some("title"), "")]));
    let full = slide_with("s-b", json!([text_box("e-1", Some("title"), "Words")]));
    let before = deck("Talk", &[empty.clone(), full]);
    // The empty slide stays empty; the other is deleted.
    let diff = slide_changes(&before, &deck("Talk", &[empty]));
    assert!(diff.emptied.is_empty());
    assert_eq!(diff.taken_out(), 1);
    // Both a removal and an emptying count.
    let before = deck(
        "Talk",
        &[
            slide_with("s-a", json!([text_box("e-1", None, "x")])),
            slide_with("s-b", json!([text_box("e-1", None, "y")])),
        ],
    );
    let after = deck("Talk", &[slide_with("s-a", json!([]))]);
    let diff = slide_changes(&before, &after);
    assert_eq!(
        (diff.removed.len(), diff.emptied.len(), diff.taken_out()),
        (1, 1, 2)
    );
    assert_eq!(diff.words(), "Removes 1 slide (“y”), empties 1 slide (“x”)");
    assert!(!diff.is_empty());
}

#[test]
fn a_deck_with_all_its_slides_replaced_by_blank_ones_of_the_same_ids_is_emptied_throughout() {
    let full = |i: usize| {
        slide_with(
            &format!("s-{i}"),
            json!([text_box("e-1", Some("title"), &format!("Slide {i}"))]),
        )
    };
    let blank = |i: usize| slide_with(&format!("s-{i}"), json!([]));
    let before = deck("Talk", &(0..30).map(full).collect::<Vec<_>>());
    let after = deck("Talk", &(0..30).map(blank).collect::<Vec<_>>());
    assert_eq!(slide_changes(&before, &after).taken_out(), 30);
}

#[test]
fn a_replacement_counts_every_slide_it_does_not_leave_as_it_was() {
    let full = |i: usize, words: &str| {
        slide_with(
            &format!("s-{i}"),
            json!([text_box("e-1", Some("title"), words)]),
        )
    };
    let before = deck("Talk", &(0..6).map(|i| full(i, "Old")).collect::<Vec<_>>());
    // Two rewritten, one blanked, one removed and two left alone.
    let after = deck(
        "Talk",
        &[
            full(0, "New"),
            full(1, "New"),
            slide_with("s-2", json!([])),
            full(4, "Old"),
            full(5, "Old"),
        ],
    );
    let diff = slide_changes(&before, &after);
    assert_eq!(
        (diff.removed.len(), diff.emptied.len(), diff.changed.len()),
        (1, 1, 2)
    );
    assert_eq!(diff.taken_out(), 2, "an ordinary edit takes out only these");
    assert_eq!(diff.replaced(), 4);
    assert_eq!(slide_changes(&before, &before).replaced(), 0);
}

#[test]
fn text_that_is_not_a_deck_has_no_slides() {
    let before = deck("Talk", &[slide("s-a", "A")]);
    assert_eq!(slide_changes("nonsense", &before).added.len(), 1);
    assert_eq!(slide_changes(&before, "[]").removed.len(), 1);
    assert!(slide_changes("x", "y").is_empty());
}
