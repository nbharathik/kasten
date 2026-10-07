//! Trashing moves notes and boards to `.trash/`, never deletes them, and
//! restoring puts them back where they were.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::trash_note;

#[test]
fn trashes_notes_instead_of_deleting_them() {
    let t = dev_vault();
    let path = "inbox/look-at-json-canvas-spec.md";
    let text = t.vault.read(path).unwrap().text;
    let moved = trash_note(&t.vault, path, NOW).unwrap();
    assert_eq!(
        moved,
        ".trash/20260924T080000Z/inbox/look-at-json-canvas-spec.md"
    );
    assert!(!t.vault.exists(path));
    assert_eq!(
        fs::read_to_string(t.vault.root().join(&moved)).unwrap(),
        text
    );
    assert!(t.vault.notes().unwrap().iter().all(|n| n.path != path));
}

#[test]
fn lists_and_restores_trashed_notes() {
    let t = dev_vault();
    let path = "library/zettelkasten-method.md";
    let text = t.vault.read(path).unwrap().text;
    let moved = trash_note(&t.vault, path, NOW).unwrap();
    let trash = kasten_core::list_trash(&t.vault).unwrap();
    assert_eq!(trash.len(), 1);
    assert_eq!(trash[0].original, path);
    assert_eq!(trash[0].trashed, moved);
    assert_eq!(trash[0].title, "Zettelkasten method");

    let restored = kasten_core::restore_note(&t.vault, &moved).unwrap();
    assert_eq!(restored.meta.path, path);
    assert_eq!(restored.text, text);
    assert!(kasten_core::list_trash(&t.vault).unwrap().is_empty());

    // Restoring onto a path that is taken again picks a free name.
    let again = trash_note(&t.vault, path, NOW).unwrap();
    fs::write(t.vault.path_of(path).unwrap(), "new\n").unwrap();
    assert_eq!(
        kasten_core::restore_note(&t.vault, &again)
            .unwrap()
            .meta
            .path,
        "library/zettelkasten-method-2.md"
    );
    assert!(kasten_core::restore_note(&t.vault, "../../etc/passwd.md").is_err());
}

#[test]
fn lists_and_restores_trashed_boards() {
    let t = dev_vault();
    let board = "projects/photo-organiser/boards/brainstorm.canvas";
    let text = fs::read_to_string(t.vault.root().join(board)).unwrap();
    let moved = trash_note(&t.vault, board, NOW).unwrap();
    let trash = kasten_core::list_trash(&t.vault).unwrap();
    assert_eq!(trash.len(), 1);
    assert_eq!(trash[0].original, board);
    assert_eq!(
        trash[0].title, "brainstorm",
        "no x-kasten title: the file name"
    );

    // A board is not a note, and a note is not a board.
    assert!(kasten_core::restore_note(&t.vault, &moved).is_err());
    let restored = kasten_core::restore_board(&t.vault, &moved).unwrap();
    assert_eq!(restored, board);
    assert_eq!(
        fs::read_to_string(t.vault.root().join(board)).unwrap(),
        text
    );
    assert!(kasten_core::list_trash(&t.vault).unwrap().is_empty());

    // Onto a taken path, it gets a free name that is still a board.
    let again = trash_note(&t.vault, board, NOW).unwrap();
    fs::write(t.vault.root().join(board), "{}").unwrap();
    assert_eq!(
        kasten_core::restore_board(&t.vault, &again).unwrap(),
        "projects/photo-organiser/boards/brainstorm-2.canvas"
    );
    let note = trash_note(&t.vault, "library/zettelkasten-method.md", NOW).unwrap();
    assert!(kasten_core::restore_board(&t.vault, &note).is_err());
    assert!(kasten_core::restore_board(&t.vault, "../../etc/x.canvas").is_err());
}

#[test]
fn a_trashed_note_can_be_read_before_it_comes_back() {
    let t = dev_vault();
    let path = "library/zettelkasten-method.md";
    let text = t.vault.read(path).unwrap().text;
    let moved = trash_note(&t.vault, path, NOW).unwrap();
    assert_eq!(kasten_core::read_trashed(&t.vault, &moved).unwrap(), text);
    // Only what is in the trash, and only notes and boards.
    for outside in [
        path,
        ".trash/../library/welcome.md",
        ".kasten/config.yaml",
        ".trash",
        ".trash/20260924T080000Z/library/nothing.md",
    ] {
        assert!(
            kasten_core::read_trashed(&t.vault, outside).is_err(),
            "{outside}"
        );
    }
    fs::write(
        t.vault.root().join(".trash/20260924T080000Z/notes.txt"),
        "x",
    )
    .unwrap();
    assert!(kasten_core::read_trashed(&t.vault, ".trash/20260924T080000Z/notes.txt").is_err());
}
