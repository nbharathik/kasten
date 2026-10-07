//! Getting the latest from the backup, on a computer whose vault was
//! changed elsewhere since: a fast-forward when only the other computer
//! wrote, else a join of both lines of history in which nothing either
//! side wrote is lost. It never overwrites, resets or force-pushes.

use crate::common;

use std::fs;
use std::path::{Path, PathBuf};

use common::{NOW, dev_vault};
use kasten_core::history::{self, Actor, History};
use kasten_core::{Instant, Kasten, Kind, LatestOutcome, NewNote};

const NOTE: &str = "library/zettelkasten-method.md";

/// Folders a test makes beside its vaults, removed at its end.
struct Beside(Vec<PathBuf>);

impl Drop for Beside {
    fn drop(&mut self) {
        for dir in &self.0 {
            // Only the test's own folders under the system temp folder.
            let _ = fs::remove_dir_all(dir);
        }
    }
}

/// Two computers with one vault: `a`, the original, and `b`, restored from
/// the backup remote both push to.
struct Two {
    a: Kasten,
    b: Kasten,
    b_root: PathBuf,
    _t: common::TempVault,
    _beside: Beside,
}

fn confirm(k: &Kasten, url: &str) {
    let mut config = k.config();
    config.git.remote = Some(url.to_owned());
    config.git.push_delay_seconds = 0;
    k.set_config(config).unwrap();
    k.confirm_remote(Some(url));
}

fn two_computers() -> Two {
    let t = dev_vault();
    let a = Kasten::open(t.vault.root()).unwrap();
    a.start_history().unwrap();
    let remote = t.vault.root().with_extension("remote.git");
    git2::Repository::init_bare(&remote).unwrap();
    let url = remote.to_string_lossy().into_owned();
    confirm(&a, &url);
    // The remote in the vault's config goes into history before the push.
    a.commit_external().unwrap();
    a.push(NOW.millis).unwrap();
    let b_root = t.vault.root().with_extension("second-computer");
    history::clone_backup(&url, None, &b_root).unwrap();
    let b = Kasten::open(&b_root).unwrap();
    // The app sets and confirms the remote on a computer restored from it.
    confirm(&b, &url);
    Two {
        a,
        b,
        b_root: b_root.clone(),
        _t: t,
        _beside: Beside(vec![remote, b_root]),
    }
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

fn at(minutes: u64) -> Instant {
    Instant {
        millis: NOW.millis + minutes * 60_000,
    }
}

/// Replaces `from` with `to` in a note's body, as typing would.
fn edit(k: &Kasten, path: &str, from: &str, to: &str) {
    let note = k.read(path).unwrap();
    let body = kasten_core::frontmatter::split(&note.text)
        .body
        .replace(from, to);
    assert_ne!(
        body,
        kasten_core::frontmatter::split(&note.text).body,
        "{from} not in {path}"
    );
    k.save_body(&Actor::Human, path, &body, &note.hash, NOW)
        .unwrap();
    k.commit_edits().unwrap();
}

fn text(root: &Path, path: &str) -> String {
    fs::read_to_string(root.join(path)).unwrap()
}

fn head(k: &Kasten) -> String {
    k.log(None, 1).unwrap()[0].id.clone()
}

#[test]
fn takes_what_only_the_other_computer_wrote_as_a_fast_forward() {
    let two = two_computers();
    let made = two
        .b
        .create(&Actor::Human, &page("Written on the laptop"), NOW)
        .unwrap();
    two.b.push(NOW.millis).unwrap();

    let latest = two.a.get_latest(at(1)).unwrap();
    assert_eq!(latest.outcome, LatestOutcome::FastForward);
    assert_eq!(head(&two.a), head(&two.b));
    assert!(two.a.root().join(&made.meta.path).is_file());
    assert!(latest.changed.contains(&made.meta.path));
    assert!(!two.a.log(None, 1).unwrap()[0].merge);
    // The page is found in search at once.
    assert!(!two.a.search("laptop", 10).unwrap().is_empty());
}

#[test]
fn joins_edits_to_different_lines_and_keeps_both() {
    let two = two_computers();
    edit(
        &two.b,
        NOTE,
        "One idea per card",
        "One idea per card, written on the laptop",
    );
    two.b.push(NOW.millis).unwrap();
    edit(
        &two.a,
        NOTE,
        "Triage them daily.",
        "Triage them daily, on the desktop.",
    );

    let latest = two.a.get_latest(at(1)).unwrap();
    assert_eq!(latest.outcome, LatestOutcome::Merged);
    let merged = text(two.a.root(), NOTE);
    assert!(merged.contains("written on the laptop"), "{merged}");
    assert!(merged.contains("on the desktop."), "{merged}");
    assert!(latest.copies.is_empty(), "{latest:?}");
    let top = &two.a.log(None, 1).unwrap()[0];
    assert!(top.merge);
    assert_eq!(top.op.as_deref(), Some("get_latest"));

    // The join goes to the backup, and the laptop takes it as it is.
    two.a.push(at(2).millis).unwrap();
    assert_eq!(
        two.b.get_latest(at(3)).unwrap().outcome,
        LatestOutcome::FastForward
    );
    assert_eq!(text(&two.b_root, NOTE), merged);
    let (ha, hb) = (
        History::open(two.a.root()).unwrap().unwrap(),
        History::open(&two.b_root).unwrap().unwrap(),
    );
    assert_eq!(ha.tree_id("HEAD").unwrap(), hb.tree_id("HEAD").unwrap());
}

#[test]
fn edits_to_the_same_lines_keep_both_versions() {
    let two = two_computers();
    edit(
        &two.b,
        NOTE,
        "One idea per card",
        "Laptop: one idea per card",
    );
    two.b.push(NOW.millis).unwrap();
    edit(
        &two.a,
        NOTE,
        "One idea per card",
        "Desktop: one idea per card",
    );

    let latest = two.a.get_latest(at(1)).unwrap();
    assert_eq!(latest.outcome, LatestOutcome::Merged);
    assert!(text(two.a.root(), NOTE).contains("Desktop: one idea per card"));
    assert_eq!(latest.copies.len(), 1, "{latest:?}");
    let copy = &latest.copies[0];
    assert!(
        copy.starts_with("library/zettelkasten-method (from other computer "),
        "{copy}"
    );
    let theirs = two.a.read(copy).unwrap();
    assert!(theirs.text.contains("Laptop: one idea per card"));
    let ours = two.a.read(NOTE).unwrap();
    assert_ne!(
        theirs.meta.id, ours.meta.id,
        "the copy has an id of its own"
    );
    assert!(theirs.meta.title.contains("from other computer"));
    let problems = two.a.verify().unwrap().problems;
    assert!(
        !problems.iter().any(|p| p.kind == "duplicate-id"),
        "{problems:?}"
    );
}

#[test]
fn an_edit_wins_over_a_delete() {
    let two = two_computers();
    edit(
        &two.b,
        NOTE,
        "Triage them daily.",
        "Triage them daily. Still needed.",
    );
    two.b.push(NOW.millis).unwrap();
    two.a.trash(&Actor::Human, NOTE, NOW).unwrap();

    let latest = two.a.get_latest(at(1)).unwrap();
    assert_eq!(latest.outcome, LatestOutcome::Merged);
    assert!(text(two.a.root(), NOTE).contains("Still needed."));
}

#[test]
fn settings_that_clash_are_set_aside() {
    let two = two_computers();
    let rename = |k: &Kasten, name: &str| {
        let mut config = k.config();
        config.name = name.into();
        k.set_config(config).unwrap();
        k.commit_external().unwrap();
    };
    rename(&two.b, "Laptop vault");
    two.b.push(NOW.millis).unwrap();
    rename(&two.a, "Desktop vault");

    let latest = two.a.get_latest(at(1)).unwrap();
    assert_eq!(two.a.config().name, "Desktop vault");
    assert_eq!(latest.set_aside.len(), 1, "{latest:?}");
    let aside = &latest.set_aside[0];
    assert!(aside.starts_with(".kasten/conflicts/"), "{aside}");
    assert!(text(two.a.root(), aside).contains("Laptop vault"));
}

#[test]
fn nothing_to_get_when_up_to_date_or_only_ahead() {
    let two = two_computers();
    assert_eq!(
        two.a.get_latest(at(1)).unwrap().outcome,
        LatestOutcome::UpToDate
    );
    two.a
        .create(&Actor::Human, &page("Not pushed yet"), NOW)
        .unwrap();
    let before = head(&two.a);
    assert_eq!(
        two.a.get_latest(at(2)).unwrap().outcome,
        LatestOutcome::UpToDate
    );
    assert_eq!(head(&two.a), before);
}

#[test]
fn refuses_the_backup_of_another_vault() {
    let two = two_computers();
    let other = dev_vault();
    let o = Kasten::open(other.vault.root()).unwrap();
    let mut config = o.config();
    config.name = "Another vault".into();
    o.set_config(config).unwrap();
    o.start_history().unwrap();
    let remote = other.vault.root().with_extension("other-remote.git");
    let _gone = Beside(vec![remote.clone()]);
    git2::Repository::init_bare(&remote).unwrap();
    let url = remote.to_string_lossy().into_owned();
    confirm(&o, &url);
    o.push(NOW.millis).unwrap();
    confirm(&two.a, &url);
    two.a.commit_external().unwrap();
    let before = head(&two.a);

    let err = two.a.get_latest(at(1)).unwrap_err();
    assert!(err.to_string().contains("different vault"), "{err}");
    assert_eq!(head(&two.a), before);
}

#[test]
fn never_overwrites_typing_waiting_for_its_commit() {
    let two = two_computers();
    edit(
        &two.b,
        NOTE,
        "One idea per card",
        "Laptop: one idea per card",
    );
    two.b.push(NOW.millis).unwrap();
    // Typed on the desktop and not committed yet: it goes into history
    // first and is joined like any other edit.
    let note = two.a.read(NOTE).unwrap();
    let body = kasten_core::frontmatter::split(&note.text)
        .body
        .replace("Triage them daily.", "Typed just now.");
    two.a
        .save_body(&Actor::Human, NOTE, &body, &note.hash, NOW)
        .unwrap();

    two.a.get_latest(at(1)).unwrap();
    let merged = text(two.a.root(), NOTE);
    assert!(
        merged.contains("Typed just now.") && merged.contains("Laptop:"),
        "{merged}"
    );
}

#[test]
fn a_stopped_get_latest_is_finished_safely_on_the_next_open() {
    let two = two_computers();
    let made = two
        .b
        .create(&Actor::Human, &page("Written on the laptop"), NOW)
        .unwrap();
    two.b.push(NOW.millis).unwrap();
    let before = head(&two.a);

    // Stops after the files are written and before the branch moves, as a
    // crash would.
    two.a.stop_get_latest_before_the_branch_moves();
    assert!(two.a.get_latest(at(1)).is_err());
    assert_eq!(head(&two.a), before);
    assert!(two.a.unfinished_get_latest());

    let root = two.a.root().to_owned();
    let reopened = Kasten::open(&root).unwrap();
    reopened.confirm_remote(two.a.config().git.remote.as_deref());
    drop(two.a);
    assert!(reopened.unfinished_get_latest());
    reopened.finish_get_latest(at(2)).unwrap();
    assert!(!reopened.unfinished_get_latest());
    assert_eq!(head(&reopened), head(&two.b));
    assert!(root.join(&made.meta.path).is_file());
    assert!(
        History::open(&root)
            .unwrap()
            .unwrap()
            .dirty()
            .unwrap()
            .is_empty()
    );
}

#[test]
fn says_when_the_backup_has_changes_this_computer_lacks() {
    let two = two_computers();
    assert!(!two.a.backup_ahead().unwrap());
    two.b
        .create(&Actor::Human, &page("Written on the laptop"), NOW)
        .unwrap();
    two.b.push(NOW.millis).unwrap();
    assert!(two.a.backup_ahead().unwrap());

    // A push over it is refused, and says to get the latest first.
    two.a
        .create(&Actor::Human, &page("Written on the desktop"), NOW)
        .unwrap();
    let err = two.a.push(at(1).millis).unwrap_err();
    assert!(err.to_string().contains("get the latest"), "{err}");
    assert!(two.a.backup_status(at(1).millis).behind);

    two.a.get_latest(at(2)).unwrap();
    assert!(!two.a.backup_ahead().unwrap());
    two.a.push(at(3).millis).unwrap();
    assert!(!two.a.backup_status(at(3).millis).behind);
}

#[test]
fn gets_the_latest_from_a_backup_file_too() {
    let two = two_computers();
    let made = two
        .b
        .create(&Actor::Human, &page("Carried on a disk"), NOW)
        .unwrap();
    let disk = two.b_root.with_extension("usb-disk");
    let _gone = Beside(vec![disk.clone()]);
    let file = two.b.write_backup_file(&disk, "laptop", NOW).unwrap();

    let latest = two
        .a
        .get_latest_from_file(Path::new(&file.path), at(1))
        .unwrap();
    assert_eq!(latest.outcome, LatestOutcome::FastForward);
    assert!(two.a.root().join(&made.meta.path).is_file());
    assert_eq!(head(&two.a), head(&two.b));
}
