//! The metadata of a few notes by path, so the app refreshes only what the
//! watcher reported instead of listing the whole vault.

use crate::common;

use common::dev_vault;
use kasten_core::{Instant, Kasten};

#[test]
fn gives_the_notes_that_exist_in_the_order_asked() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let asked = [
        "library/zettelkasten-method.md".to_owned(),
        "library/no-such-note.md".to_owned(),
        "projects/note-taking-study/pages/report-draft.md".to_owned(),
        "boards/some.canvas".to_owned(),
    ];
    let found = k.notes_at(&asked).unwrap();
    let paths: Vec<&str> = found.iter().map(|n| n.path.as_str()).collect();
    assert_eq!(
        paths,
        [
            "library/zettelkasten-method.md",
            "projects/note-taking-study/pages/report-draft.md"
        ]
    );
    let listed = k.list().unwrap();
    for note in &found {
        assert_eq!(Some(note), listed.iter().find(|n| n.path == note.path));
    }
}

#[test]
fn sees_a_change_made_outside_once_reported() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let path = "library/zettelkasten-method.md".to_owned();
    let file = t.vault.root().join(&path);
    let text = std::fs::read_to_string(&file).unwrap();
    std::fs::write(
        &file,
        text.replace("title: Zettelkasten method", "title: Slip box"),
    )
    .unwrap();
    k.outside_changes(std::slice::from_ref(&path), Instant::now().millis);
    assert_eq!(
        k.notes_at(std::slice::from_ref(&path)).unwrap()[0].title,
        "Slip box"
    );
    std::fs::remove_file(&file).unwrap();
    k.outside_changes(std::slice::from_ref(&path), Instant::now().millis);
    assert!(k.notes_at(&[path]).unwrap().is_empty());
}
