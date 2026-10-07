//! The backup remote gets every note, so it is an address that keeps them
//! private, it never holds a password, and a vault's config alone cannot
//! choose it: it is pushed to once confirmed on this computer.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::Kasten;
use kasten_core::history::BackupState;

fn with_history() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

fn set_remote(k: &Kasten, url: &str) -> kasten_core::Result<()> {
    let mut config = k.config();
    config.git.remote = Some(url.to_owned());
    config.git.push_delay_seconds = 0;
    k.set_config(config)
}

#[test]
fn a_remote_is_https_ssh_or_a_folder_with_no_secret_in_it() {
    let (_t, k) = with_history();
    for good in [
        "https://github.com/someone/notes.git",
        "git@github.com:someone/notes.git",
        "ssh://git@git.example.com:2222/someone/notes.git",
        "git.example.com:notes/with@sign.git",
        "/srv/backups/notes.git",
        "C:\\Backups\\notes.git",
        "D:/Backups/notes.git",
    ] {
        assert!(set_remote(&k, good).is_ok(), "{good}");
    }
    for bad in [
        "http://git.example.com/notes.git",
        "git://git.example.com/notes.git",
        "file:///srv/backups/notes.git",
        "https://someone:secret@github.com/someone/notes.git",
        "https://token-secret@github.com/someone/notes.git",
        "ssh://git:secret@git.example.com/notes.git",
        "git:secret@github.com:someone/notes.git",
        "\\\\server\\share\\notes.git",
        "//server/share/notes.git",
        "ext::sh -c touch% /tmp/x",
        "backups/notes.git",
        "-u/notes.git",
        "https://github.com/someone/my notes.git",
        "",
    ] {
        let err = set_remote(&k, bad).expect_err(bad).to_string();
        assert!(!err.contains("secret"), "the error repeats a secret: {err}");
    }
}

#[test]
fn a_remote_written_into_the_file_by_hand_is_checked_too() {
    let (t, k) = with_history();
    let mut config = k.config();
    config.git.remote = Some("http://git.example.com/notes.git".into());
    config.save(t.vault.root()).unwrap();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.confirm_remote(Some("http://git.example.com/notes.git"));
    assert!(k.push(NOW.millis).is_err());
    assert!(!matches!(k.push_if_due(NOW.millis), Some(Ok(()))));
}

#[test]
fn a_remote_is_pushed_to_only_once_confirmed_on_this_computer() {
    let (t, k) = with_history();
    let remote = t.vault.root().with_extension("remote.git");
    git2::Repository::init_bare(&remote).unwrap();
    let url = remote.to_string_lossy().into_owned();
    set_remote(&k, &url).unwrap();
    assert_eq!(k.backup_status(NOW.millis).state, BackupState::Unconfirmed);
    assert!(
        k.push_if_due(NOW.millis).is_none(),
        "not confirmed here yet"
    );
    assert!(k.push(NOW.millis).is_err(), "pushed when asked directly");
    let bare = git2::Repository::open_bare(&remote).unwrap();
    assert!(
        bare.references().unwrap().next().is_none(),
        "the remote got commits"
    );

    k.confirm_remote(Some(&url));
    assert!(matches!(k.push_if_due(NOW.millis), Some(Ok(()))));
    assert_ne!(k.backup_status(NOW.millis).state, BackupState::Unconfirmed);

    // Another remote in the config is another question.
    let other = t.vault.root().with_extension("other.git");
    git2::Repository::init_bare(&other).unwrap();
    set_remote(&k, &other.to_string_lossy()).unwrap();
    assert_eq!(k.backup_status(NOW.millis).state, BackupState::Unconfirmed);
    assert!(k.push_if_due(NOW.millis).is_none());
    let _ = fs::remove_dir_all(&remote);
    let _ = fs::remove_dir_all(&other);
}

#[test]
fn a_push_says_which_commit_it_sent() {
    let (t, _k) = with_history();
    let remote = t.vault.root().with_extension("sent.git");
    git2::Repository::init_bare(&remote).unwrap();
    let history = kasten_core::history::History::open(t.vault.root())
        .unwrap()
        .unwrap();
    let sent = history.push(&remote.to_string_lossy()).unwrap();
    let branch = history.branch().unwrap();
    let tip = git2::Repository::open_bare(&remote)
        .unwrap()
        .refname_to_id(&format!("refs/heads/{branch}"))
        .unwrap()
        .to_string();
    assert_eq!(sent.as_deref(), Some(tip.as_str()));
    let _ = fs::remove_dir_all(&remote);
}

#[test]
fn verify_reaches_only_a_remote_confirmed_on_this_computer() {
    let (t, k) = with_history();
    // No repository is there, so reaching it fails and the report shows
    // whether verify tried.
    let url = t
        .vault
        .root()
        .with_extension("missing.git")
        .to_string_lossy()
        .into_owned();
    set_remote(&k, &url).unwrap();
    let reached = |k: &Kasten| {
        k.verify()
            .unwrap()
            .problems
            .iter()
            .any(|p| p.kind == "remote")
    };
    assert!(
        !reached(&k),
        "reached a remote only the vault's config named"
    );
    k.confirm_remote(Some(&url));
    assert!(reached(&k));
}
