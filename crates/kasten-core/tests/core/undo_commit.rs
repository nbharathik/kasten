//! Undoing one commit, such as an import: its changes reverted as a new
//! commit, back to the exact files before it, stopping at a later edit on
//! the same lines instead of overwriting it.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::history::{Actor, History};
use kasten_core::{Error, Kasten, Kind, NewNote, content_hash};

const WELCOME: &str = "library/welcome-to-kasten.md";

fn open() -> (common::TempVault, Kasten, History) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let h = History::open(t.vault.root()).unwrap().unwrap();
    (t, k, h)
}

fn page(title: &str) -> NewNote {
    NewNote {
        kind: Kind::Page,
        title: title.into(),
        date: "2026-09-25".into(),
        project: None,
        parent: None,
        template: None,
        icon: None,
    }
}

fn head(k: &Kasten) -> String {
    k.log(None, 1).unwrap()[0].id.clone()
}

#[test]
fn undoes_a_commit_back_to_the_exact_tree() {
    let (t, k, h) = open();
    let before = h.tree_id("HEAD").unwrap();
    let note = k.create(&Actor::Human, &page("Scratch"), NOW).unwrap();
    let commit = head(&k);
    let undone = k.undo_commit(&commit, NOW).unwrap();
    assert_eq!(undone.reverted, vec![commit.clone()]);
    assert!(undone.conflict.is_none());
    assert!(!t.vault.root().join(&note.meta.path).exists());
    assert_eq!(h.tree_id("HEAD").unwrap(), before);
    let log = k.log(None, 1).unwrap();
    assert_eq!(log[0].summary, "undo: create: Scratch");
    assert_eq!(log[0].undoes.as_deref(), Some(commit.as_str()));
    assert!(k.list().unwrap().iter().all(|n| n.path != note.meta.path));

    // Undone once is enough.
    match k.undo_commit(&commit, NOW) {
        Err(Error::Invalid(why)) => assert!(why.contains("already undone"), "{why}"),
        other => panic!("{other:?}"),
    }
}

#[test]
fn keeps_later_edits_to_other_lines() {
    let (t, k, _h) = open();
    let text = fs::read_to_string(t.vault.root().join(WELCOME)).unwrap();
    let appended = format!("{}\nA line added.\n", text.trim_end_matches('\n'));
    let agent = Actor::Agent {
        client: "test".into(),
        session: "S".into(),
    };
    k.save_body(&agent, WELCOME, &body(&appended), &content_hash(&text), NOW)
        .unwrap();
    let commit = head(&k);
    // A later edit near the top of the page, far from the added line.
    let now = fs::read_to_string(t.vault.root().join(WELCOME)).unwrap();
    let edited = now.replacen("Kasten", "KASTEN", 1);
    assert_ne!(edited, now);
    fs::write(t.vault.root().join(WELCOME), &edited).unwrap();
    k.commit_external().unwrap();

    let undone = k.undo_commit(&commit, NOW).unwrap();
    assert!(undone.conflict.is_none(), "{:?}", undone.conflict);
    let after = fs::read_to_string(t.vault.root().join(WELCOME)).unwrap();
    assert!(!after.contains("A line added."), "{after}");
    assert!(after.contains("KASTEN"), "{after}");
}

#[test]
fn stops_at_a_later_edit_on_the_same_lines() {
    let (t, k, _h) = open();
    let note = k.create(&Actor::Human, &page("Scratch"), NOW).unwrap();
    let commit = head(&k);
    let path = t.vault.root().join(&note.meta.path);
    fs::write(&path, format!("{}Written since.\n", note.text)).unwrap();
    k.commit_external().unwrap();
    let before = head(&k);

    let undone = k.undo_commit(&commit, NOW).unwrap();
    assert!(undone.reverted.is_empty());
    let conflict = undone.conflict.expect("a conflict");
    assert_eq!(conflict.path, note.meta.path);
    assert_eq!(conflict.commit, commit);
    assert!(path.exists());
    assert_eq!(head(&k), before, "nothing written");
}

#[test]
fn a_merge_is_never_undone_as_one_commit() {
    let (t, k, _h) = open();
    // Two lines of history joined, as getting the latest from another
    // computer joins them.
    let repo = git2::Repository::open(t.vault.root()).unwrap();
    let base = repo.head().unwrap().peel_to_commit().unwrap();
    let sig = git2::Signature::now("Other computer", "other@example.com").unwrap();
    let side = repo
        .commit(
            None,
            &sig,
            &sig,
            "edit: elsewhere",
            &base.tree().unwrap(),
            &[&base],
        )
        .unwrap();
    let side = repo.find_commit(side).unwrap();
    let merge = repo
        .commit(
            Some("HEAD"),
            &sig,
            &sig,
            "latest: from the other computer",
            &base.tree().unwrap(),
            &[&base, &side],
        )
        .unwrap()
        .to_string();
    let log = k.log(None, 2).unwrap();
    assert!(log[0].merge && !log[1].merge);
    let err = k.undo_commit(&merge, NOW).unwrap_err();
    assert!(
        err.to_string().contains("joins two lines of history"),
        "{err}"
    );
    assert_eq!(head(&k), merge, "nothing written");
}

#[test]
fn refuses_an_unknown_commit() {
    let (_t, k, _h) = open();
    assert!(
        k.undo_commit("0000000000000000000000000000000000000000", NOW)
            .is_err()
    );
    assert!(k.undo_commit("not a commit", NOW).is_err());
}

/// The body under a note's frontmatter.
fn body(text: &str) -> String {
    kasten_core::frontmatter::split(text).body.to_owned()
}
