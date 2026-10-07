//! A new page is made by its first input: a body, a title or an icon, each
//! as one file and one commit, so a page that was only opened leaves
//! nothing behind and a page that was written in has one clean commit.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::history::Actor;
use kasten_core::{Kasten, Kind, NewNote};
use serde_json::Map;

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

fn page(title: &str, icon: Option<&str>) -> NewNote {
    NewNote {
        kind: Kind::Page,
        title: title.into(),
        date: "2026-09-28".into(),
        project: None,
        parent: None,
        template: None,
        icon: icon.map(Into::into),
    }
}

fn library(t: &common::TempVault) -> usize {
    fs::read_dir(t.vault.root().join("library"))
        .unwrap()
        .count()
}

#[test]
fn a_body_alone_makes_one_file_and_one_commit() {
    let (t, k) = open();
    let (files, commits) = (library(&t), k.log(None, 500).unwrap().len());
    let note = k
        .create_with_body(
            &Actor::Human,
            &page("", None),
            "First thought",
            &[],
            &Map::new(),
            "create",
            NOW,
        )
        .unwrap();
    assert!(note.text.ends_with("First thought\n"), "{}", note.text);
    assert_eq!(library(&t), files + 1);
    assert_eq!(k.log(None, 500).unwrap().len(), commits + 1);
    // Nothing is left to commit: the body went in with the file.
    assert_eq!(k.commit_edits().unwrap(), None);
}

#[test]
fn a_title_or_an_icon_alone_makes_one_file_and_one_commit() {
    let (t, k) = open();
    let (files, commits) = (library(&t), k.log(None, 500).unwrap().len());
    let titled = k
        .create(&Actor::Human, &page("Garden plans", None), NOW)
        .unwrap();
    assert_eq!(titled.meta.title, "Garden plans");
    let iconed = k.create(&Actor::Human, &page("", Some("🌱")), NOW).unwrap();
    assert_eq!(iconed.meta.icon.as_deref(), Some("🌱"));
    assert_eq!(library(&t), files + 2);
    assert_eq!(k.log(None, 500).unwrap().len(), commits + 2);
    assert_eq!(k.commit_edits().unwrap(), None);
}
