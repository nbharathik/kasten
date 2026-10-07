use serde_json::json;
use slides_core::{Deck, Engine};

use super::*;

fn deck(theme: &str, seed: u64, titles: &[&str]) -> Deck {
    let mut e = Engine::create("Talk", theme, seed).unwrap_or_else(|err| panic!("{err}"));
    for t in titles {
        e.apply(
            "add_slide",
            json!({ "layout": "title-body", "content": { "title": t, "body": "- a point" } }),
        )
        .unwrap_or_else(|err| panic!("{err}"));
    }
    e.deck().clone()
}

fn apply(existing: &Deck, plan: &Plan) -> Engine {
    let mut e = Engine::new(existing.clone(), 5);
    e.apply_batch(plan.operations.clone())
        .unwrap_or_else(|err| panic!("{err}"));
    e
}

fn titles(deck: &Deck) -> Vec<String> {
    deck.slides
        .iter()
        .map(|s| {
            s.elements
                .iter()
                .find(|e| e.base().placeholder.as_deref() == Some("title"))
                .and_then(|e| e.text().map(|t| t.plain_text()))
                .unwrap_or_default()
        })
        .collect()
}

#[test]
fn slides_are_added_after_the_named_slide_in_the_look_of_the_deck() {
    let existing = deck("Light", 1, &["A", "B"]);
    // The imported deck is in another theme, with the same layout names, and its own slide ids.
    let imported = deck("Serif", 2, &["X", "Y"]);
    let after = existing.slides[2].id.clone();
    let plan = plan_import(
        &existing,
        imported.clone(),
        &Mode::Add { after: Some(after) },
    );
    assert_eq!(plan.operations.len(), 1);
    assert_eq!(plan.operations[0].0, "add_slides");
    let e = apply(&existing, &plan);
    assert_eq!(titles(e.deck()), ["Talk", "A", "B", "Talk", "X", "Y"]);
    assert_eq!(e.deck().theme.name, "Light", "the deck's theme is kept");
    assert_eq!(
        e.deck()
            .slides
            .iter()
            .skip(4)
            .map(|s| s.id.clone())
            .collect::<Vec<_>>(),
        plan.slides[1..]
    );
    // One undo takes the import back.
    assert!(e.can_undo());
}

#[test]
fn a_taken_slide_id_is_replaced_and_the_plan_names_the_ids_that_result() {
    let existing = deck("Light", 7, &["A"]);
    // The same seed makes the same ids in both decks.
    let imported = deck("Light", 7, &["A"]);
    assert_eq!(existing.slides[0].id, imported.slides[0].id);
    let plan = plan_import(&existing, imported, &Mode::Add { after: None });
    let e = apply(&existing, &plan);
    assert_eq!(e.deck().slides.len(), 4);
    let ids: HashSet<&str> = e.deck().slides.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids.len(), 4, "no id twice");
    for id in &plan.slides {
        assert!(e.deck().slide(id).is_some(), "{id} is in the deck");
    }
    assert!(!plan.slides.contains(&existing.slides[0].id));
}

#[test]
fn replacing_puts_the_imported_deck_in_place_of_everything_and_keeps_the_decks_own_id() {
    let existing = deck("Light", 1, &["A", "B"]);
    let imported = deck("Serif", 2, &["X"]);
    let plan = plan_import(&existing, imported.clone(), &Mode::Replace);
    assert_eq!(plan.operations[0].0, "replace_deck");
    let e = apply(&existing, &plan);
    assert_eq!(titles(e.deck()), ["Talk", "X"]);
    assert_eq!(e.deck().theme.name, "Serif");
    assert_eq!(e.deck().id, existing.id);
    assert_eq!(
        plan.slides,
        e.deck()
            .slides
            .iter()
            .map(|s| s.id.clone())
            .collect::<Vec<_>>()
    );
}

#[test]
fn a_new_version_keeps_the_identity_of_what_is_still_there() {
    let existing = deck("Light", 1, &["A", "B"]);
    let mut imported = existing.clone();
    for (n, slide) in imported.slides.iter_mut().enumerate() {
        let was = slide.id.clone();
        slide.id = format!("s-file{n:04}");
        slide.extra.insert(
            "pptxMarker".into(),
            json!({ "slide": was, "step": null, "backup": false }),
        );
    }
    // The file has one slide fewer than the deck.
    imported.slides.remove(1);
    let plan = plan_import(&existing, imported, &Mode::Merge);
    let e = apply(&existing, &plan);
    assert_eq!(e.deck().slides.len(), 3, "the slide the file lacks is kept");
    assert_eq!(
        e.deck()
            .slides
            .iter()
            .map(|s| s.id.clone())
            .collect::<Vec<_>>(),
        existing
            .slides
            .iter()
            .map(|s| s.id.clone())
            .collect::<Vec<_>>()
    );
    assert!(
        plan.notes.iter().any(|n| n.contains("not in the file")),
        "{:?}",
        plan.notes
    );
}
