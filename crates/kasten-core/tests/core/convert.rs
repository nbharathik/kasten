//! Turning a card into a page and back: the note's `type` changes and it
//! moves to the folder
//! its new kind lives in, with boards following it, in one commit.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::Kasten;
use kasten_core::history::Actor;

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

#[test]
fn an_inbox_card_becomes_a_page_in_the_library() {
    let (t, k) = open();
    let before = fs::read_to_string(t.vault.root().join("inbox/capture-ideas-here.md")).unwrap();
    let note = k
        .convert_note(&Actor::Human, "inbox/capture-ideas-here.md", "page", NOW)
        .unwrap();
    assert_eq!(note.meta.path, "library/capture-ideas-here.md");
    assert_eq!(note.meta.kind, "page");
    assert!(!t.vault.root().join("inbox/capture-ideas-here.md").exists());
    // Only `type` and `updated` change; the body stays byte for byte.
    let body = |text: &str| text.split_once("\n---\n").map(|(_, b)| b.to_owned());
    assert_eq!(body(&note.text), body(&before));
    assert!(note.text.contains("\ntype: page\n"));
    let log = k.log(None, 3).unwrap();
    assert_eq!(log[0].summary, "convert: Capture ideas here to a page");
}

#[test]
fn a_project_card_moves_to_pages_and_its_board_follows() {
    let (t, k) = open();
    let note = k
        .convert_note(
            &Actor::Human,
            "projects/photo-organiser/cards/duplicate-score-sketch.md",
            "page",
            NOW,
        )
        .unwrap();
    assert_eq!(
        note.meta.path,
        "projects/photo-organiser/pages/duplicate-score-sketch.md"
    );
    let board = fs::read_to_string(
        t.vault
            .root()
            .join("projects/photo-organiser/boards/brainstorm.canvas"),
    )
    .unwrap();
    assert!(
        board.contains("projects/photo-organiser/pages/duplicate-score-sketch.md"),
        "{board}"
    );
    assert!(!board.contains("projects/photo-organiser/cards/duplicate-score-sketch.md"));
    // And back again.
    let card = k
        .convert_note(&Actor::Human, &note.meta.path, "card", NOW)
        .unwrap();
    assert_eq!(
        card.meta.path,
        "projects/photo-organiser/cards/duplicate-score-sketch.md"
    );
    assert_eq!(card.meta.kind, "card");
}

#[test]
fn only_cards_and_pages_convert() {
    let (_t, k) = open();
    let journal = k
        .list()
        .unwrap()
        .into_iter()
        .find(|n| n.kind == "journal")
        .unwrap();
    assert!(
        k.convert_note(&Actor::Human, &journal.path, "page", NOW)
            .is_err()
    );
    assert!(
        k.convert_note(
            &Actor::Human,
            "library/zettelkasten-method.md",
            "project",
            NOW
        )
        .is_err()
    );
    // Already a page: nothing to do, and no commit.
    let head = k.log(None, 1).unwrap()[0].id.clone();
    let same = k
        .convert_note(&Actor::Human, "library/zettelkasten-method.md", "page", NOW)
        .unwrap();
    assert_eq!(same.meta.path, "library/zettelkasten-method.md");
    assert_eq!(k.log(None, 1).unwrap()[0].id, head);
}
