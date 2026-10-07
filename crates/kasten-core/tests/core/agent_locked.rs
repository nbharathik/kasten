//! A locked note is read-only for agents, whichever op would touch it: a
//! sub-page moved along with its parent, or links an op would rewrite.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::agent::{AgentOp, Session};
use kasten_core::history::Actor;
use kasten_core::{Kasten, Kind, NewNote};

fn open() -> (common::TempVault, Kasten, Session) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k, Session::start("claude-code", NOW))
}

fn page(title: &str, parent: Option<String>) -> NewNote {
    NewNote {
        kind: Kind::Page,
        title: title.to_owned(),
        date: "2026-09-24".to_owned(),
        project: None,
        parent,
        template: None,
        icon: None,
    }
}

/// Marks the note at `path` locked, by hand, as a person would.
fn lock(t: &common::TempVault, k: &Kasten, path: &str) {
    let file = t.vault.path_of(path).unwrap();
    let text = fs::read_to_string(&file)
        .unwrap()
        .replacen("---\n", "---\nlocked: true\n", 1);
    fs::write(&file, text).unwrap();
    k.reindex().unwrap();
}

#[test]
fn an_agent_cannot_move_a_page_whose_sub_page_is_locked() {
    let (t, k, s) = open();
    let parent = k
        .create(&Actor::Human, &page("Field notes", None), NOW)
        .unwrap();
    let child = k
        .create(
            &Actor::Human,
            &page("Sample one", Some(parent.meta.path.clone())),
            NOW,
        )
        .unwrap();
    lock(&t, &k, &child.meta.path);
    let op = AgentOp::Move {
        path: parent.meta.path.clone(),
        project: Some("note-taking-study".into()),
    };
    let err = k.agent_run(&s, &op, NOW).unwrap_err();
    assert!(err.to_string().contains("locked"), "{err}");
    assert!(t.vault.exists(&child.meta.path));
}

#[test]
fn an_agent_cannot_make_a_note_whose_title_would_rewrite_a_locked_note_s_links() {
    let (t, k, s) = open();
    let target = k.create(&Actor::Human, &page("Budget", None), NOW).unwrap();
    let locked = "library/ledger.md";
    fs::write(
        t.vault.path_of(locked).unwrap(),
        "---\ntitle: Ledger\n---\nSee [[Budget]].\n",
    )
    .unwrap();
    lock(&t, &k, locked);
    let before = fs::read_to_string(t.vault.path_of(locked).unwrap()).unwrap();
    let op = AgentOp::CreateNote {
        note_type: "page".into(),
        title: "Budget".into(),
        body: String::new(),
        project: Some("note-taking-study".into()),
        tags: vec![],
        props: Default::default(),
        parent: None,
        template: None,
    };
    let err = k.agent_run(&s, &op, NOW).unwrap_err();
    assert!(err.to_string().contains("locked"), "{err}");
    assert_eq!(
        fs::read_to_string(t.vault.path_of(locked).unwrap()).unwrap(),
        before
    );
    assert!(t.vault.exists(&target.meta.path));
}
