//! How Get latest writes the vault's files: each one atomically, only where
//! it is unchanged since the last commit, and nothing at all when a file is
//! in the way. A Get latest stopped part way (a crash, a full disk) keeps
//! its journal and is finished later, and nothing else commits the half
//! written folder meanwhile.

use crate::common;

use std::fs;
use std::path::{Path, PathBuf};

use common::{NOW, dev_vault};
use kasten_core::history::{self, Actor, History};
use kasten_core::{Instant, Kasten, Kind, NewNote};

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

struct Two {
    a: Kasten,
    b: Kasten,
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

/// The desktop `a` and the laptop `b`, restored from the backup both use.
fn two_computers() -> Two {
    let t = dev_vault();
    let a = Kasten::open(t.vault.root()).unwrap();
    a.start_history().unwrap();
    let remote = t.vault.root().with_extension("remote.git");
    git2::Repository::init_bare(&remote).unwrap();
    let url = remote.to_string_lossy().into_owned();
    confirm(&a, &url);
    a.commit_external().unwrap();
    a.push(NOW.millis).unwrap();
    let b_root = t.vault.root().with_extension("second-computer");
    history::clone_backup(&url, None, &b_root).unwrap();
    let b = Kasten::open(&b_root).unwrap();
    confirm(&b, &url);
    Two {
        a,
        b,
        _t: t,
        _beside: Beside(vec![remote, b_root]),
    }
}

fn page(title: &str) -> NewNote {
    NewNote {
        kind: Kind::Page,
        title: title.into(),
        date: "2026-09-28".into(),
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

fn head(k: &Kasten) -> String {
    k.log(None, 1).unwrap()[0].id.clone()
}

fn clean(root: &Path) -> bool {
    History::open(root)
        .unwrap()
        .unwrap()
        .dirty()
        .unwrap()
        .is_empty()
}

/// Whether the last commit's tree holds `path`.
fn committed(root: &Path, path: &str) -> bool {
    let repo = git2::Repository::open(root).unwrap();
    let tree = repo.head().unwrap().peel_to_tree().unwrap();
    tree.get_path(Path::new(path)).is_ok()
}

#[test]
fn a_write_that_fails_keeps_the_journal_and_is_finished_later() {
    let two = two_computers();
    let made: Vec<String> = ["First", "Second", "Third"]
        .into_iter()
        .map(|title| {
            two.b
                .create(&Actor::Human, &page(title), NOW)
                .unwrap()
                .meta
                .path
        })
        .collect();
    two.b.push(NOW.millis).unwrap();
    let before = head(&two.a);

    // The disk fills up after one file.
    two.a.fail_get_latest_writes_after(1);
    let err = two.a.get_latest(at(1)).unwrap_err();
    assert!(err.to_string().contains("part way"), "{err}");
    assert_eq!(head(&two.a), before);
    assert!(two.a.unfinished_get_latest());
    let written = made
        .iter()
        .filter(|p| two.a.root().join(p).is_file())
        .count();
    assert_eq!(written, 1);

    // Nothing commits the half-written folder as outside changes meanwhile.
    assert_eq!(two.a.commit_external().unwrap(), None);
    assert_eq!(head(&two.a), before);

    two.a.finish_get_latest(at(2)).unwrap();
    assert!(!two.a.unfinished_get_latest());
    assert_eq!(head(&two.a), head(&two.b));
    assert!(made.iter().all(|p| two.a.root().join(p).is_file()));
    assert!(clean(two.a.root()));
}

#[test]
fn a_file_git_ignores_in_the_way_stops_it_before_anything_is_written() {
    let two = two_computers();
    // This computer keeps its own drafts where history never looks.
    fs::write(two.a.root().join(".git/info/exclude"), "drafts/\n").unwrap();
    fs::create_dir_all(two.a.root().join("drafts")).unwrap();
    fs::write(
        two.a.root().join("drafts/plan.md"),
        "Mine, never committed\n",
    )
    .unwrap();
    // The laptop committed a file at the same place, and a page.
    let made = two
        .b
        .create(&Actor::Human, &page("From the laptop"), NOW)
        .unwrap();
    fs::create_dir_all(two.b.root().join("drafts")).unwrap();
    fs::write(two.b.root().join("drafts/plan.md"), "The laptop's\n").unwrap();
    two.b.commit_external().unwrap();
    two.b.push(NOW.millis).unwrap();
    let before = head(&two.a);

    let err = two.a.get_latest(at(1)).unwrap_err();
    assert!(err.to_string().contains("drafts/plan.md"), "{err}");
    assert_eq!(
        fs::read_to_string(two.a.root().join("drafts/plan.md")).unwrap(),
        "Mine, never committed\n"
    );
    assert!(!two.a.root().join(&made.meta.path).exists());
    assert_eq!(head(&two.a), before);
    assert!(!two.a.unfinished_get_latest());

    // Once it is moved away, the latest comes in.
    fs::rename(
        two.a.root().join("drafts/plan.md"),
        two.a.root().join("drafts/plan (mine).md"),
    )
    .unwrap();
    two.a.get_latest(at(2)).unwrap();
    assert_eq!(
        fs::read_to_string(two.a.root().join("drafts/plan.md")).unwrap(),
        "The laptop's\n"
    );
    assert!(two.a.root().join("drafts/plan (mine).md").is_file());
}

#[test]
fn removes_what_the_other_computer_moved_and_keeps_history_in_step() {
    let two = two_computers();
    let made = two
        .b
        .create(&Actor::Human, &page("Short lived"), NOW)
        .unwrap();
    two.b.push(NOW.millis).unwrap();
    two.a.get_latest(at(1)).unwrap();
    assert!(two.a.root().join(&made.meta.path).is_file());

    // The laptop trashes it: here it leaves its place for the trash.
    two.b.trash(&Actor::Human, &made.meta.path, at(2)).unwrap();
    two.b.push(at(2).millis).unwrap();
    two.a.get_latest(at(3)).unwrap();
    assert!(!two.a.root().join(&made.meta.path).exists());
    assert!(clean(two.a.root()));

    // The next commit here builds on what came in, rather than undoing it.
    let mine = two
        .a
        .create(&Actor::Human, &page("Written after"), at(4))
        .unwrap();
    assert!(committed(two.a.root(), &mine.meta.path));
    assert!(!committed(two.a.root(), &made.meta.path));
    assert!(clean(two.a.root()));
}

#[test]
fn history_asks_git_to_flush_its_files_and_allow_long_paths() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let k = Kasten::open(&root).unwrap();
    k.start_history().unwrap();
    let local = git2::Repository::open(&root)
        .unwrap()
        .config()
        .unwrap()
        .open_level(git2::ConfigLevel::Local)
        .unwrap();
    assert_eq!(local.get_bool("core.fsyncObjectFiles").ok(), Some(true));
    assert_eq!(local.get_bool("core.longpaths").ok(), Some(true));
}
