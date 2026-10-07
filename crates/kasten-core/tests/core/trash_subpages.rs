//! Moving a page to the trash takes its sub-pages with it, all the way
//! down, in one commit, as in Notion. The trash shows the page with how
//! many went inside it, and restoring it brings every one back under it.

use crate::common;

use common::{NOW, dev_vault};
use kasten_core::agent::{AgentOp, Session};
use kasten_core::history::Actor;
use kasten_core::{Instant, Kasten, Kind, NewNote, NoteFile, Outcome};

fn page(title: &str, parent: Option<String>) -> NewNote {
    NewNote {
        kind: Kind::Page,
        title: title.to_owned(),
        date: "2026-09-28".to_owned(),
        project: None,
        parent,
        template: None,
        icon: None,
    }
}

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

/// A page with a sub-page, which has one of its own.
fn tree(k: &Kasten) -> [NoteFile; 3] {
    let h = Actor::Human;
    let top = k.create(&h, &page("Trip plan", None), NOW).unwrap();
    let mid = k
        .create(&h, &page("Packing", Some(top.meta.path.clone())), NOW)
        .unwrap();
    let low = k
        .create(&h, &page("Shoes", Some(mid.meta.path.clone())), NOW)
        .unwrap();
    [top, mid, low]
}

fn later(minutes: u64) -> Instant {
    Instant {
        millis: NOW.millis + minutes * 60_000,
    }
}

#[test]
fn trashing_a_page_takes_every_sub_page_along_in_one_commit() {
    let (t, k) = open();
    let [top, mid, low] = tree(&k);
    let other = k
        .create(&Actor::Human, &page("Other page", None), NOW)
        .unwrap();

    let trashed = k.trash(&Actor::Human, &top.meta.path, NOW).unwrap();
    let stamp = trashed.rsplit_once(&top.meta.path).unwrap().0.to_owned();
    for note in [&top, &mid, &low] {
        assert!(!t.vault.exists(&note.meta.path), "{}", note.meta.path);
        assert!(
            t.vault
                .root()
                .join(format!("{stamp}{}", note.meta.path))
                .is_file(),
            "{} is not in the trash beside its parent",
            note.meta.path
        );
    }
    assert!(t.vault.exists(&other.meta.path));
    let listed: Vec<String> = k.list().unwrap().into_iter().map(|n| n.path).collect();
    for note in [&top, &mid, &low] {
        assert!(!listed.contains(&note.meta.path), "{}", note.meta.path);
    }
    let top_commit = &k.log(None, 1).unwrap()[0];
    assert_eq!(top_commit.summary, "trash: Trip plan and 2 sub-pages");

    // The trash shows the page, with what went inside it.
    let trash = k.list_trash().unwrap();
    assert_eq!(trash.len(), 1, "{trash:?}");
    assert_eq!((trash[0].title.as_str(), trash[0].inside), ("Trip plan", 2));

    // Undo brings the whole tree back.
    k.undo_commit(&top_commit.id, NOW).unwrap();
    for note in [&top, &mid, &low] {
        assert!(t.vault.exists(&note.meta.path), "{}", note.meta.path);
    }
}

#[test]
fn restoring_the_page_brings_its_sub_pages_back_under_it() {
    let (t, k) = open();
    let [top, mid, low] = tree(&k);
    let trashed = k.trash(&Actor::Human, &top.meta.path, NOW).unwrap();

    let back = k.restore_trashed(&Actor::Human, &trashed).unwrap();
    assert_eq!(back.meta.path, top.meta.path);
    for note in [&top, &mid, &low] {
        let now = k.read(&note.meta.path).unwrap();
        assert_eq!(now.text, note.text, "{}", note.meta.path);
    }
    assert_eq!(k.read(&low.meta.path).unwrap().meta.parent, mid.meta.id);
    assert!(k.list_trash().unwrap().is_empty());
    assert!(!t.vault.root().join(&trashed).exists());
    assert_eq!(
        k.log(None, 1).unwrap()[0].summary,
        "restore: Trip plan and 2 sub-pages"
    );
}

#[test]
fn a_sub_page_trashed_before_its_parent_stays_apart() {
    let (t, k) = open();
    let [top, mid, low] = tree(&k);
    k.trash(&Actor::Human, &mid.meta.path, NOW).unwrap();
    let parent = k.trash(&Actor::Human, &top.meta.path, later(1)).unwrap();

    let trash = k.list_trash().unwrap();
    let shown: Vec<(&str, usize)> = trash.iter().map(|x| (x.title.as_str(), x.inside)).collect();
    assert_eq!(shown, [("Trip plan", 0), ("Packing", 1)]);

    k.restore_trashed(&Actor::Human, &parent).unwrap();
    assert!(t.vault.exists(&top.meta.path));
    assert!(!t.vault.exists(&mid.meta.path));
    assert!(!t.vault.exists(&low.meta.path));
    assert_eq!(k.list_trash().unwrap().len(), 1);
}

#[test]
fn a_restored_page_whose_place_is_taken_keeps_its_sub_pages() {
    let (t, k) = open();
    let [top, mid, _low] = tree(&k);
    let trashed = k.trash(&Actor::Human, &top.meta.path, NOW).unwrap();
    // A new page takes the old one's file name meanwhile.
    let again = k
        .create(&Actor::Human, &page("Trip plan", None), later(1))
        .unwrap();
    assert_eq!(again.meta.path, top.meta.path);

    let back = k.restore_trashed(&Actor::Human, &trashed).unwrap();
    assert_ne!(back.meta.path, top.meta.path);
    assert_eq!(back.meta.id, top.meta.id);
    // The sub-pages follow their parent by id, wherever it went.
    assert_eq!(k.read(&mid.meta.path).unwrap().meta.parent, top.meta.id);
    assert!(t.vault.exists(&again.meta.path));
}

#[test]
fn an_agent_cannot_trash_a_page_whose_sub_page_is_locked() {
    let (t, k) = open();
    let [top, mid, _low] = tree(&k);
    let file = t.vault.path_of(&mid.meta.path).unwrap();
    let text = std::fs::read_to_string(&file)
        .unwrap()
        .replacen("---\n", "---\nlocked: true\n", 1);
    std::fs::write(&file, text).unwrap();
    k.reindex().unwrap();
    let s = Session::start("claude-code", NOW);
    let op = AgentOp::Trash {
        path: top.meta.path.clone(),
        reason: None,
    };
    let err = k.agent_run(&s, &op, NOW).unwrap_err();
    assert!(err.to_string().contains("locked"), "{err}");
    assert!(t.vault.exists(&top.meta.path));
}

#[test]
fn every_sub_page_counts_against_an_agent_s_trash_limit() {
    let (t, k) = open();
    let mut config = k.config();
    config.guardrails.max_trash_per_session = 2;
    k.set_config(config).unwrap();
    let [top, ..] = tree(&k);
    let s = Session::start("claude-code", NOW);
    let op = AgentOp::Trash {
        path: top.meta.path.clone(),
        reason: Some("tidy".into()),
    };
    let outcome = k.agent_run(&s, &op, NOW).unwrap();
    let Outcome::PendingReview { reason, .. } = outcome else {
        panic!("{outcome:?}")
    };
    assert!(reason.contains("3 notes"), "{reason}");
    assert!(t.vault.exists(&top.meta.path));
}
