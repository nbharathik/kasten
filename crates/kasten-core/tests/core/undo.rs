//! Undoing an agent session: its commits reverted newest first as new
//! commits, back to the exact tree, stopping at a conflicting later edit.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::agent::{AgentOp, Session};
use kasten_core::history::{Actor, History};
use kasten_core::{Kasten, Outcome, frontmatter};

const WELCOME: &str = "library/welcome-to-kasten.md";
const SKETCH: &str = "projects/photo-organiser/cards/duplicate-score-sketch.md";

fn open() -> (common::TempVault, Kasten, History) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let h = History::open(t.vault.root()).unwrap().unwrap();
    (t, k, h)
}

fn run(k: &Kasten, s: &Session, op: AgentOp) -> Outcome {
    k.agent_run(s, &op, NOW).unwrap()
}

#[test]
fn undo_restores_the_exact_tree_before_the_session() {
    let (_t, k, h) = open();
    let before = h.tree_id("HEAD").unwrap();
    let s = Session::start("claude-code", NOW);
    run(
        &k,
        &s,
        AgentOp::Capture {
            markdown: "A captured idea".into(),
            tags: vec!["idea".into()],
        },
    );
    run(
        &k,
        &s,
        AgentOp::Append {
            path: WELCOME.into(),
            markdown: "An agent line.".into(),
            heading: Some("Dump now, organise later".into()),
        },
    );
    run(
        &k,
        &s,
        AgentOp::Tags {
            path: SKETCH.into(),
            add: vec!["paper".into()],
            remove: vec![],
        },
    );
    run(
        &k,
        &s,
        AgentOp::Rename {
            path: SKETCH.into(),
            title: "Metric sketch".into(),
        },
    );
    run(
        &k,
        &s,
        AgentOp::Trash {
            path: "inbox/a-captured-idea.md".into(),
            reason: None,
        },
    );
    // A proposal is part of the session too.
    let body = frontmatter::split(&k.read(WELCOME).unwrap().text)
        .body
        .to_owned();
    run(
        &k,
        &s,
        AgentOp::Edit {
            path: WELCOME.into(),
            body: "Everything replaced.\n".into(),
            base: body,
            reason: None,
        },
    );
    assert_ne!(h.tree_id("HEAD").unwrap(), before);

    let sessions = k.sessions(10).unwrap();
    assert_eq!(sessions[0].id, s.id);
    assert_eq!(sessions[0].client, "claude-code");
    assert_eq!(sessions[0].commits, 6);
    assert!(!sessions[0].undone);

    // What each commit changed, for the history view.
    let last = &k.log(None, 1).unwrap()[0];
    let changed = k.commit_changes(&last.id).unwrap();
    assert_eq!(
        changed[0].path,
        format!(".kasten/proposals/{}.json", k.proposals().unwrap()[0].id)
    );
    assert!(changed[0].before.is_none() && changed[0].after.is_some());

    let undone = k.undo_session(&s.id, NOW).unwrap();
    assert_eq!(undone.conflict, None);
    assert_eq!(undone.reverted.len(), 6);
    assert_eq!(
        h.tree_id("HEAD").unwrap(),
        before,
        "undo must restore the exact tree"
    );
    assert!(k.sessions(10).unwrap()[0].undone);
    assert!(k.log(None, 1).unwrap()[0].summary.starts_with("undo: "));
    assert!(k.log(None, 1).unwrap()[0].undoes.is_some());
    // The index follows the files.
    assert!(k.list().unwrap().iter().any(|n| n.path == SKETCH));
    assert!(
        !k.list()
            .unwrap()
            .iter()
            .any(|n| n.path.starts_with("inbox/a-captured"))
    );
    // Undoing again has nothing left to do.
    assert!(k.undo_session(&s.id, NOW).unwrap().reverted.is_empty());
}

#[test]
fn keeps_later_edits_on_other_lines_and_stops_at_conflicting_ones() {
    let (t, k, _h) = open();
    let s = Session::start("claude-code", NOW);
    run(
        &k,
        &s,
        AgentOp::Append {
            path: WELCOME.into(),
            markdown: "Agent line one.".into(),
            heading: None,
        },
    );
    run(
        &k,
        &s,
        AgentOp::Append {
            path: SKETCH.into(),
            markdown: "Agent sketch line.".into(),
            heading: None,
        },
    );
    // A person edits the welcome page at the top, away from the agent's line…
    let note = k.read(WELCOME).unwrap();
    let body = frontmatter::split(&note.text).body;
    let edited = format!("A person's first line.\n\n{body}");
    k.save_body(&Actor::Human, WELCOME, &edited, &note.hash, NOW)
        .unwrap();
    // …and rewrites the agent's line in the sketch.
    let sketch = k.read(SKETCH).unwrap();
    let body = frontmatter::split(&sketch.text)
        .body
        .replace("Agent sketch line.", "Person's sketch line.");
    k.save_body(&Actor::Human, SKETCH, &body, &sketch.hash, NOW)
        .unwrap();
    k.commit_edits().unwrap();

    let undone = k.undo_session(&s.id, NOW).unwrap();
    // Newest first: the sketch append conflicts, so the undo stops there.
    let conflict = undone.conflict.expect("a conflict");
    assert_eq!(conflict.path, SKETCH);
    assert!(undone.reverted.is_empty());
    let text = fs::read_to_string(t.vault.root().join(SKETCH)).unwrap();
    assert!(text.contains("Person's sketch line."), "never overwritten");
    let welcome = fs::read_to_string(t.vault.root().join(WELCOME)).unwrap();
    assert!(welcome.contains("Agent line one."));
}

#[test]
fn merges_the_undo_around_later_edits() {
    let (t, k, _h) = open();
    let s = Session::start("claude-code", NOW);
    run(
        &k,
        &s,
        AgentOp::Append {
            path: WELCOME.into(),
            markdown: "Agent line one.".into(),
            heading: None,
        },
    );
    let note = k.read(WELCOME).unwrap();
    let body = frontmatter::split(&note.text).body;
    k.save_body(
        &Actor::Human,
        WELCOME,
        &format!("A person's first line.\n\n{body}"),
        &note.hash,
        NOW,
    )
    .unwrap();
    k.commit_edits().unwrap();
    let undone = k.undo_session(&s.id, NOW).unwrap();
    assert_eq!(undone.conflict, None);
    let welcome = fs::read_to_string(t.vault.root().join(WELCOME)).unwrap();
    assert!(!welcome.contains("Agent line one."));
    assert!(welcome.contains("A person's first line."));
}

#[test]
fn undoing_an_agent_keeps_typing_that_was_waiting_for_its_commit() {
    let (_t, k, h) = open();
    let before = k.read(WELCOME).unwrap();
    let typed = format!(
        "{}Typed by the person.\n",
        frontmatter::split(&before.text).body
    );
    // Typing waits out its batch, not yet in history.
    k.save_body(&Actor::Human, WELCOME, &typed, &before.hash, NOW)
        .unwrap();
    let s = Session::start("claude-code", NOW);
    run(
        &k,
        &s,
        AgentOp::Append {
            path: WELCOME.into(),
            markdown: "An agent line.".into(),
            heading: None,
        },
    );
    // The typing is the person's own commit, before the agent's.
    let log = h.log(None, 2).unwrap();
    assert_eq!(log[0].session.as_deref(), Some(s.id.as_str()));
    assert!(log[1].summary.starts_with("edit:"), "{}", log[1].summary);

    k.undo_session(&s.id, NOW).unwrap();
    let after = k.read(WELCOME).unwrap().text;
    assert!(after.contains("Typed by the person.\n"));
    assert!(!after.contains("An agent line."));
}
