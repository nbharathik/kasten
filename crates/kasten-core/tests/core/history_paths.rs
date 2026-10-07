//! Undo and restore write only inside the vault, whatever a commit names:
//! never through a folder that is a link, never into Git's own folder.
//! A shared vault can carry any history.

#![cfg(unix)]

use crate::common;

use std::fs;
use std::path::Path;

use common::{NOW, dev_vault};
use kasten_core::Kasten;

/// Commits the working tree's `paths` straight through Git, as another
/// program would, with `message`.
fn commit(root: &Path, paths: &[&str], message: &str) -> String {
    let repo = git2::Repository::open(root).unwrap();
    let mut index = repo.index().unwrap();
    for path in paths {
        if root.join(path).exists() {
            index.add_path(Path::new(path)).unwrap();
        } else {
            index.remove_path(Path::new(path)).unwrap();
        }
    }
    index.write().unwrap();
    let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
    let parent = repo.head().unwrap().peel_to_commit().unwrap();
    let sig = git2::Signature::now("agent:shared", "agent@kasten").unwrap();
    repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])
        .unwrap()
        .to_string()
}

#[cfg(unix)]
#[test]
fn undo_never_writes_through_a_folder_that_became_a_link() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let root = t.vault.root().to_path_buf();
    // A folder outside the vault: another test vault's.
    let other = dev_vault();
    let outside = other.vault.root().join("outside");
    fs::create_dir(&outside).unwrap();

    fs::create_dir_all(root.join("library/ext")).unwrap();
    fs::write(root.join("library/ext/run.md"), "---\ntitle: Run\n---\n").unwrap();
    commit(&root, &["library/ext/run.md"], "external: Run\n");
    fs::remove_file(root.join("library/ext/run.md")).unwrap();
    let trashed = commit(
        &root,
        &["library/ext/run.md"],
        "trash: Run\n\nKasten-Session: s-shared\nKasten-Op: trash_note\n",
    );
    fs::remove_dir(root.join("library/ext")).unwrap();
    std::os::unix::fs::symlink(outside.as_path(), root.join("library/ext")).unwrap();

    let session = k.undo_session("s-shared", NOW);
    assert!(session.is_err(), "undo went through: {session:?}");
    let one = k.undo_commit(&trashed, NOW);
    assert!(one.is_err(), "undo went through: {one:?}");
    assert_eq!(fs::read_dir(outside.as_path()).unwrap().count(), 0);
}

#[cfg(unix)]
#[test]
fn restoring_the_vault_never_writes_through_a_link() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let root = t.vault.root().to_path_buf();
    // A folder outside the vault: another test vault's.
    let other = dev_vault();
    let outside = other.vault.root().join("outside");
    fs::create_dir(&outside).unwrap();

    fs::create_dir_all(root.join("library/ext")).unwrap();
    fs::write(root.join("library/ext/run.md"), "---\ntitle: Run\n---\n").unwrap();
    let then = commit(&root, &["library/ext/run.md"], "external: Run\n");
    fs::remove_file(root.join("library/ext/run.md")).unwrap();
    commit(&root, &["library/ext/run.md"], "external: gone\n");
    fs::remove_dir(root.join("library/ext")).unwrap();
    std::os::unix::fs::symlink(outside.as_path(), root.join("library/ext")).unwrap();

    assert!(
        k.restore_vault(&kasten_core::history::Actor::Human, &then, NOW)
            .is_err()
    );
    assert_eq!(fs::read_dir(outside.as_path()).unwrap().count(), 0);
}
