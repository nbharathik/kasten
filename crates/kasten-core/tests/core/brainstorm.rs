//! "Brainstorm on this board": ideas placed as cards in a
//! new section, all in one agent session, so the History view lists them
//! together and "Undo session" takes every one back.

use crate::common;

use common::{NOW, dev_vault};
use kasten_core::agent::Session;
use kasten_core::history::History;
use kasten_core::{Idea, Kasten};

const BOARD: &str = "projects/photo-organiser/boards/brainstorm.canvas";

fn open() -> (common::TempVault, Kasten, History) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let h = History::open(t.vault.root()).unwrap().unwrap();
    (t, k, h)
}

fn ideas(n: usize) -> Vec<Idea> {
    (1..=n)
        .map(|i| Idea {
            title: format!("Idea {i}"),
            text: format!("Why idea {i} might work."),
        })
        .collect()
}

#[test]
fn places_ideas_as_cards_in_a_new_section_as_one_session() {
    let (t, k, _h) = open();
    let before = k.board(BOARD).unwrap();
    let s = Session::start("kasten-brainstorm", NOW);
    let done = k
        .brainstorm(&s, BOARD, "Ways to measure edits", &ideas(5), NOW)
        .unwrap();
    assert_eq!(done.session, s.id);
    assert_eq!(done.cards.len(), 5);
    for path in &done.cards {
        assert!(
            path.starts_with("projects/photo-organiser/cards/"),
            "{path}"
        );
        let text = std::fs::read_to_string(t.vault.root().join(path)).unwrap();
        assert!(text.contains("might work."), "{text}");
    }

    let after = k.board(BOARD).unwrap();
    assert_eq!(
        after.nodes.len(),
        before.nodes.len() + 6,
        "five cards and a section"
    );
    let section = after.nodes.iter().find(|n| n.id == done.section).unwrap();
    assert_eq!(section.kind, "group");
    assert_eq!(section.label.as_deref(), Some("Ways to measure edits"));
    let inside = |n: &kasten_core::board::NodeView| {
        n.x >= section.x
            && n.y >= section.y
            && n.x + n.width <= section.x + section.width
            && n.y + n.height <= section.y + section.height
    };
    let cards: Vec<_> = after
        .nodes
        .iter()
        .filter(|n| n.file.as_ref().is_some_and(|f| done.cards.contains(f)))
        .collect();
    assert_eq!(cards.len(), 5);
    assert!(
        cards.iter().all(|n| inside(n)),
        "every card sits in the section"
    );
    // Below what was on the board already, with the gap anything added
    // below gets, and in line with it.
    let bottom = before
        .nodes
        .iter()
        .map(|n| n.y + n.height)
        .max()
        .unwrap_or(0);
    let left = before.nodes.iter().map(|n| n.x).min().unwrap_or(0);
    assert_eq!((section.x, section.y), (left, bottom + 80));

    let session = k
        .sessions(20)
        .unwrap()
        .into_iter()
        .find(|x| x.id == s.id)
        .unwrap();
    assert_eq!(session.client, "kasten-brainstorm");
    assert_eq!(
        session.commits, 7,
        "a commit per card, the placing and the section"
    );
    // Agent-marked: every card shows the agent's writing.
    assert_eq!(k.agent_marked(&done.cards).unwrap(), done.cards);
}

#[test]
fn undoing_the_session_takes_every_card_and_the_section_back() {
    let (_t, k, h) = open();
    let tree = h.tree_id("HEAD").unwrap();
    let s = Session::start("kasten-brainstorm", NOW);
    let done = k.brainstorm(&s, BOARD, "Ideas", &ideas(4), NOW).unwrap();
    let undone = k.undo_session(&s.id, NOW).unwrap();
    assert!(undone.conflict.is_none(), "{:?}", undone.conflict);
    assert_eq!(undone.reverted.len(), 6);
    assert_eq!(h.tree_id("HEAD").unwrap(), tree, "exactly as before");
    assert!(
        k.board(BOARD)
            .unwrap()
            .nodes
            .iter()
            .all(|n| n.id != done.section)
    );
}

#[test]
fn refuses_no_ideas_or_too_many_and_skips_blank_titles() {
    let (_t, k, _h) = open();
    let s = Session::start("kasten-brainstorm", NOW);
    assert!(k.brainstorm(&s, BOARD, "Ideas", &[], NOW).is_err());
    assert!(k.brainstorm(&s, BOARD, "Ideas", &ideas(21), NOW).is_err());
    assert!(
        k.brainstorm(&s, "library/nowhere.canvas", "Ideas", &ideas(2), NOW)
            .is_err()
    );
    let blank = [
        Idea {
            title: "  ".into(),
            text: "No title".into(),
        },
        Idea {
            title: "A real one".into(),
            text: String::new(),
        },
    ];
    let done = k.brainstorm(&s, BOARD, "Ideas", &blank, NOW).unwrap();
    assert_eq!(done.cards.len(), 1);
}
