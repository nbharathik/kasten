//! Saving a chat: a
//! note of type `chat` in `chats/`, named by its day and title, in one
//! commit, that lists, searches and opens like any other note.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::agent::{AgentOp, Session};
use kasten_core::history::Actor;
use kasten_core::{Kasten, frontmatter};

fn open(t: &common::TempVault) -> Kasten {
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    k
}

const TRANSCRIPT: &str =
    "**You:** Plan three days by the sea\n\n**Kasten:** Day one: the harbour walk…\n";

#[test]
fn saves_a_chat_as_one_commit() {
    let t = dev_vault();
    let k = open(&t);
    let note = k
        .save_chat(
            &Actor::Human,
            "Seaside plans",
            TRANSCRIPT,
            "2026-09-24",
            NOW,
        )
        .unwrap();
    assert_eq!(note.meta.path, "chats/2026-09-24-seaside-plans.md");
    assert_eq!(note.meta.kind, "chat");
    assert_eq!(note.meta.title, "Seaside plans");
    assert!(note.meta.id.is_some());
    assert!(note.text.contains("\ntype: chat\n"), "{}", note.text);
    assert_eq!(frontmatter::split(&note.text).body, TRANSCRIPT);
    let last = &k.log(None, 1).unwrap()[0];
    assert_eq!(last.summary, "chat: Seaside plans");
    assert!(!last.agent);
    assert!(k.dirty().unwrap().is_empty(), "{:?}", k.dirty().unwrap());
}

#[test]
fn a_second_chat_of_the_same_name_gets_the_next_free_file() {
    let t = dev_vault();
    let k = open(&t);
    let first = k
        .save_chat(&Actor::Human, "Seaside plans", "One\n", "2026-09-24", NOW)
        .unwrap();
    let second = k
        .save_chat(&Actor::Human, "Seaside plans", "Two\n", "2026-09-24", NOW)
        .unwrap();
    assert_eq!(first.meta.path, "chats/2026-09-24-seaside-plans.md");
    assert_eq!(second.meta.path, "chats/2026-09-24-seaside-plans-2.md");
    assert_eq!(
        fs::read_to_string(t.vault.root().join(&first.meta.path)).unwrap(),
        first.text,
        "the first chat is untouched"
    );
}

#[test]
fn saved_chats_list_search_and_open_as_notes() {
    let t = dev_vault();
    let k = open(&t);
    let note = k
        .save_chat(
            &Actor::Human,
            "Seaside plans",
            TRANSCRIPT,
            "2026-09-24",
            NOW,
        )
        .unwrap();
    let listed = k.list().unwrap();
    let meta = listed.iter().find(|n| n.path == note.meta.path).unwrap();
    assert_eq!(meta.kind, "chat");
    let hits = k.search("harbour walk", 10).unwrap();
    assert_eq!(hits[0].path, note.meta.path, "{hits:?}");
    let typed = k.search("harbour type:chat", 10).unwrap();
    assert_eq!(typed.len(), 1, "{typed:?}");
    assert_eq!(k.read(&note.meta.path).unwrap().text, note.text);
    // A file in chats/ that names no type still reads as a chat.
    fs::write(t.vault.root().join("chats/old-chat.md"), "Just text\n").unwrap();
    k.reindex().unwrap();
    let old = k.notes_at(&["chats/old-chat.md".to_owned()]).unwrap();
    assert_eq!(old[0].kind, "chat");
}

#[test]
fn titles_are_cleaned_and_never_empty() {
    let t = dev_vault();
    let k = open(&t);
    let note = k
        .save_chat(
            &Actor::Human,
            "  [[Plans]] |  for\nthe trip ",
            "x\n",
            "2026-09-24",
            NOW,
        )
        .unwrap();
    assert_eq!(note.meta.title, "Plans for the trip");
    assert_eq!(note.meta.path, "chats/2026-09-24-plans-for-the-trip.md");
    let bare = k
        .save_chat(&Actor::Human, " \n ", "x\n", "2026-09-24", NOW)
        .unwrap();
    assert_eq!(bare.meta.title, "Chat");
    assert_eq!(bare.meta.path, "chats/2026-09-24-chat.md");
    assert!(
        k.save_chat(&Actor::Human, "Plans", "x\n", "yesterday", NOW)
            .is_err()
    );
}

#[test]
fn chats_stay_in_chats() {
    let t = dev_vault();
    let k = open(&t);
    let note = k
        .save_chat(
            &Actor::Human,
            "Seaside plans",
            TRANSCRIPT,
            "2026-09-24",
            NOW,
        )
        .unwrap();
    let path = note.meta.path.clone();
    let moved = k.move_note(&Actor::Human, &path, Some("photo-organiser"));
    assert!(moved.unwrap_err().to_string().contains("chat"));
    assert!(k.convert_note(&Actor::Human, &path, "page", NOW).is_err());
    // Renaming keeps the dated file name.
    let renamed = k
        .rename(&Actor::Human, &path, "Harbour plans", NOW)
        .unwrap();
    assert_eq!(renamed.note.meta.path, path);
    assert_eq!(renamed.note.meta.title, "Harbour plans");
    // Agents make cards and pages; saving a chat is the person's.
    let session = Session::start("claude-code", NOW);
    let op = AgentOp::CreateNote {
        note_type: "chat".into(),
        title: "Sneaky".into(),
        body: String::new(),
        project: None,
        tags: vec![],
        props: Default::default(),
        parent: None,
        template: None,
    };
    assert!(k.agent_run(&session, &op, NOW).is_err());
}
