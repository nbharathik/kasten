//! Related notes: the notes that share a note's most telling words, ranked
//! by the full-text index, for connecting notes that were never linked.

use crate::common;

use common::{NOW, dev_vault};
use kasten_core::history::Actor;
use kasten_core::{Kasten, Kind, NewNote};

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    (t, k)
}

fn note(k: &Kasten, title: &str, body: &str) -> String {
    let new = NewNote {
        kind: Kind::Card,
        title: title.into(),
        date: "2026-09-25".into(),
        project: None,
        parent: None,
        template: None,
        icon: None,
    };
    let empty = serde_json::Map::new();
    k.create_with_body(&Actor::Human, &new, body, &[], &empty, "create", NOW)
        .unwrap()
        .meta
        .path
}

#[test]
fn finds_notes_about_the_same_things() {
    let (_t, k) = open();
    let starter = note(
        &k,
        "Sourdough starter",
        "Feed the sourdough starter with rye flour and water every morning. The starter smells sour when it is hungry.\n",
    );
    let bread = note(
        &k,
        "Baking bread",
        "Sourdough bread needs an active starter, flour, water and salt, and a long cold proof.\n",
    );
    let rye = note(
        &k,
        "Rye flour",
        "The [[Sourdough starter]] likes rye flour best.\n",
    );
    note(
        &k,
        "Garden plan",
        "Plant tomatoes and basil in spring, and water them every morning.\n",
    );
    // One word in common is chance, not a subject.
    note(
        &k,
        "Hill run",
        "A run up the hill before breakfast, hungry.\n",
    );

    let related = k.related(&starter, 5).unwrap();
    let titles: Vec<&str> = related.iter().map(|r| r.title.as_str()).collect();
    // Both about starters and flour; a title's words weigh the most.
    let mut top: Vec<&str> = titles.iter().take(2).copied().collect();
    top.sort_unstable();
    assert_eq!(top, ["Baking bread", "Rye flour"], "{titles:?}");
    assert!(!titles.contains(&"Sourdough starter"), "not itself");
    assert!(!titles.contains(&"Hill run"), "{titles:?}");
    assert!(related.iter().all(|r| r.shared.len() >= 2), "{related:?}");
    let by = |title: &str| related.iter().find(|r| r.title == title).unwrap();
    assert!(!by("Baking bread").linked);
    assert!(by("Rye flour").linked, "it links to the starter");
    assert_eq!(by("Baking bread").path, bread);
    assert_eq!(by("Rye flour").path, rye);
    // What they share, the most telling first: the starter's title words.
    let shared = &by("Baking bread").shared;
    assert!(shared.len() <= 3, "{shared:?}");
    let mut first: Vec<&str> = shared.iter().take(2).map(String::as_str).collect();
    first.sort_unstable();
    assert_eq!(first, ["sourdough", "starter"], "{shared:?}");

    // Garden plan shares only common words ("water", "morning") and ranks below them, if at all.
    let garden = titles.iter().position(|t| *t == "Garden plan");
    assert!(garden.is_none_or(|g| g > 1), "{titles:?}");
    assert!(k.related(&starter, 1).unwrap().len() == 1);
}

#[test]
fn a_note_with_nothing_telling_has_no_related_notes() {
    let (_t, k) = open();
    let empty = note(&k, "Zqxvw", "");
    assert!(k.related(&empty, 5).unwrap().is_empty());
    assert!(k.related("library/no-such-note.md", 5).is_err());
}

#[test]
fn long_notes_do_not_crowd_out_close_ones() {
    let (_t, k) = open();
    let kiln = note(
        &k,
        "Kiln firing",
        "Stoneware glaze needs a slow kiln firing to cone six.\n",
    );
    let glaze = note(&k, "Glaze recipes", "A stoneware glaze for cone six.\n");
    // Mentions the same words once each, among thousands of others.
    let filler: String = (0..3000).map(|i| format!("word{i} ")).collect();
    note(
        &k,
        "Everything",
        &format!("{filler}stoneware glaze kiln firing cone six\n"),
    );
    let related = k.related(&kiln, 5).unwrap();
    assert_eq!(related[0].path, glaze, "{related:?}");
}
