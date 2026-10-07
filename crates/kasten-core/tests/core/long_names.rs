//! Long titles and file names: a file name fits in the 255 bytes most file
//! systems allow, with room for Kasten's own additions, in any script.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::{Kind, NewNote, Saved, create_note, save_body};

fn page(title: &str) -> NewNote {
    NewNote {
        kind: Kind::Page,
        title: title.to_owned(),
        date: "2026-09-24".to_owned(),
        project: None,
        parent: None,
        template: None,
        icon: None,
    }
}

#[test]
fn a_long_title_in_any_script_makes_a_note_that_saves() {
    let t = dev_vault();
    let title = "長いタイトルのノート".repeat(12);
    let made = create_note(&t.vault, &page(&title), NOW).unwrap();
    let name = made.meta.path.rsplit('/').next().unwrap();
    assert!(name.len() <= 160, "{} bytes", name.len());
    assert_eq!(made.meta.title, title);
    let saved = save_body(&t.vault, &made.meta.path, "Text\n", &made.hash, NOW).unwrap();
    assert!(matches!(saved, Saved::Written { .. }));
}

#[test]
fn a_note_whose_name_is_already_long_still_saves_and_keeps_a_conflict_copy() {
    let t = dev_vault();
    // 240 bytes of name, as another app may have written it.
    let path = format!("library/{}.md", "語".repeat(80));
    fs::write(
        t.vault.path_of(&path).unwrap(),
        "---\ntitle: Long\n---\nOld\n",
    )
    .unwrap();
    let loaded = t.vault.read(&path).unwrap();
    let saved = save_body(&t.vault, &path, "New\n", &loaded.hash, NOW).unwrap();
    assert!(matches!(saved, Saved::Written { .. }));

    let stale = loaded.hash;
    let Saved::Conflict { copy, .. } = save_body(&t.vault, &path, "Mine\n", &stale, NOW).unwrap()
    else {
        panic!("no conflict")
    };
    let name = copy.rsplit('/').next().unwrap();
    assert!(name.len() <= 255, "{} bytes", name.len());
    assert!(t.vault.read(&copy).unwrap().text.ends_with("Mine\n"));
}
