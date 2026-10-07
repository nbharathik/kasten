//! The engine every shell uses: each op under the write lock, indexed and
//! committed.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::history::Actor;
use kasten_core::{Kasten, Kind, NewNote, Saved, frontmatter};

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

fn agent() -> Actor {
    Actor::Agent {
        client: "claude-code".into(),
        session: "S1".into(),
    }
}

fn summaries(k: &Kasten) -> Vec<String> {
    k.log(None, 50)
        .unwrap()
        .into_iter()
        .map(|c| c.summary)
        .collect()
}

#[test]
fn works_without_history_until_it_is_started() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    assert!(!k.has_history());
    let note = k.create(&Actor::Human, &page("Plain start"), NOW).unwrap();
    assert!(k.list().unwrap().iter().any(|n| n.path == note.meta.path));
    k.start_history().unwrap();
    assert!(k.has_history());
    assert_eq!(summaries(&k), ["init: Dev vault"]);
}

#[test]
fn commits_every_op_with_a_clear_message() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let h = Actor::Human;
    let note = k.create(&h, &page("Reading list"), NOW).unwrap();
    let renamed = k.rename(&h, &note.meta.path, "Books to read", NOW).unwrap();
    let copy = k.duplicate(&h, &renamed.note.meta.path, NOW).unwrap();
    k.move_note(&h, &copy.meta.path, Some("photo-organiser"))
        .unwrap();
    let trashed = k
        .trash(
            &h,
            "projects/photo-organiser/pages/books-to-read-copy.md",
            NOW,
        )
        .unwrap();
    k.restore_trashed(&h, &trashed).unwrap();
    assert_eq!(
        summaries(&k),
        [
            "restore: Books to read (copy)",
            "trash: Books to read (copy)",
            "move: Books to read (copy) to photo-organiser",
            "duplicate: Books to read",
            "rename: Reading list → Books to read",
            "create: Reading list",
            "init: Dev vault",
        ]
    );
    assert!(k.dirty().unwrap().is_empty(), "{:?}", k.dirty().unwrap());
    assert_eq!(k.search("books", 10).unwrap().len(), 2);
}

#[test]
fn batches_human_typing_and_commits_agent_edits_at_once() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let path = "library/zettelkasten-method.md";
    let loaded = k.read(path).unwrap();
    let body = frontmatter::split(&loaded.text).body.to_owned();
    let Saved::Written { note } = k
        .save_body(
            &Actor::Human,
            path,
            &format!("{body}One.\n"),
            &loaded.hash,
            NOW,
        )
        .unwrap()
    else {
        panic!()
    };
    let Saved::Written { .. } = k
        .save_body(
            &Actor::Human,
            path,
            &format!("{body}One.\nTwo.\n"),
            &note.hash,
            NOW,
        )
        .unwrap()
    else {
        panic!()
    };
    assert_eq!(summaries(&k).len(), 1, "typing is not committed yet");
    assert_eq!(k.pending_edits(), [path]);
    k.commit_edits().unwrap();
    assert_eq!(summaries(&k)[0], "edit: Zettelkasten method");
    assert!(k.pending_edits().is_empty());

    let now = k.read(path).unwrap();
    k.save_body(
        &agent(),
        path,
        &format!("{body}Agent line.\n"),
        &now.hash,
        NOW,
    )
    .unwrap();
    let last = &k.log(None, 1).unwrap()[0];
    assert_eq!(last.summary, "edit: Zettelkasten method");
    assert_eq!(last.session.as_deref(), Some("S1"));
    assert!(k.pending_edits().is_empty());
}

#[test]
fn commits_on_the_clock_and_pushes_apart_from_it() {
    // A push can wait on the network for a long time: it runs apart from
    // the commits, so a stalled one never holds up the next commit.
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let k = Kasten::open(&root).unwrap();
    k.start_history().unwrap();
    assert!(k.push_if_due(NOW.millis).is_none(), "no remote, no push");
    let remote = root.with_extension("remote.git");
    git2::Repository::init_bare(&remote).unwrap();
    let mut config = k.config();
    config.git.remote = Some(remote.to_string_lossy().into_owned());
    config.git.push_delay_seconds = 0;
    k.set_config(config).unwrap();
    k.confirm_remote(Some(&remote.to_string_lossy()));
    let path = "library/zettelkasten-method.md";
    let loaded = k.read(path).unwrap();
    k.save_body(&Actor::Human, path, "New body\n", &loaded.hash, NOW)
        .unwrap();
    let tick = k.commit_tick(NOW.millis + 31_000).unwrap();
    assert!(tick.edits.is_some() && !tick.pushed, "{tick:?}");
    assert!(matches!(k.push_if_due(NOW.millis + 32_000), Some(Ok(()))));
    let bare = git2::Repository::open_bare(&remote).unwrap();
    assert!(bare.refname_to_id("refs/heads/main").is_ok());
    assert!(
        k.push_if_due(NOW.millis + 33_000).is_none(),
        "nothing new to push"
    );
}

#[test]
fn commits_quiet_edits_and_outside_changes_on_tick() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let k = Kasten::open(&root).unwrap();
    k.start_history().unwrap();
    let path = "library/zettelkasten-method.md";
    let loaded = k.read(path).unwrap();
    k.save_body(&Actor::Human, path, "New body\n", &loaded.hash, NOW)
        .unwrap();
    fs::write(root.join("inbox/from-phone.md"), "Synced in\n").unwrap();
    k.outside_changes(&["inbox/from-phone.md".to_owned()], NOW.millis);

    let early = k.tick(NOW.millis + 10_000).unwrap();
    assert!(early.edits.is_none() && early.external.is_none());
    let later = k.tick(NOW.millis + 31_000).unwrap();
    assert!(
        later.edits.is_some() && later.external.is_some(),
        "{later:?}"
    );
    assert_eq!(
        &summaries(&k)[..2],
        ["external: inbox/from-phone.md", "edit: Zettelkasten method"]
    );
    assert!(
        k.search("synced", 5)
            .unwrap()
            .iter()
            .any(|h| h.path == "inbox/from-phone.md")
    );
}

#[test]
fn merges_edits_made_elsewhere_on_other_lines() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let k = Kasten::open(&root).unwrap();
    let path = "library/zettelkasten-method.md";
    let loaded = k.read(path).unwrap();
    let body = frontmatter::split(&loaded.text).body.to_owned();
    // Someone else appends a line; the editor changes the first one.
    fs::write(
        root.join(path),
        format!("{}Added elsewhere.\n", loaded.text),
    )
    .unwrap();
    let mine = body.replacen("One idea per card", "One idea per card only", 1);
    let Saved::Merged { note } = k
        .save_body(&Actor::Human, path, &mine, &loaded.hash, NOW)
        .unwrap()
    else {
        panic!("not merged")
    };
    assert!(
        note.text.contains("One idea per card only") && note.text.ends_with("Added elsewhere.\n"),
        "{}",
        note.text
    );

    // The same line changed on both sides: the editor's copy is kept apart.
    let before = k.read(path).unwrap();
    fs::write(root.join(path), before.text.replace("only", "ONLY")).unwrap();
    let theirs = frontmatter::split(&before.text)
        .body
        .replace("only", "just");
    let Saved::Conflict { copy, .. } = k
        .save_body(&Actor::Human, path, &theirs, &before.hash, NOW)
        .unwrap()
    else {
        panic!("no conflict")
    };
    assert!(k.read(&copy).unwrap().text.contains("just"));
}

#[test]
fn captures_a_quick_note_with_tags_in_one_commit() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let note = k
        .capture(
            &agent(),
            "Call the **printer** about toner\nThey open at nine.",
            &["errand".into(), "#home".into()],
            NOW,
        )
        .unwrap();
    assert_eq!(note.meta.path, "inbox/call-the-printer-about-toner.md");
    assert_eq!(note.meta.title, "Call the printer about toner");
    assert_eq!(note.meta.tags, ["errand", "home"]);
    // The first line is the title, so the body starts after it.
    assert!(
        note.text.ends_with("---\nThey open at nine.\n"),
        "{}",
        note.text
    );
    let last = &k.log(None, 1).unwrap()[0];
    assert_eq!(last.summary, "capture: Call the printer about toner");
    assert!(k.dirty().unwrap().is_empty());
}

#[test]
fn captures_a_quick_note_into_a_project() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let note = k
        .capture_in(
            &Actor::Human,
            "Ask the team about the photo tests",
            &[],
            Some("photo-organiser"),
            NOW,
        )
        .unwrap();
    assert_eq!(
        note.meta.path,
        "projects/photo-organiser/cards/ask-the-team-about-the-photo-tests.md"
    );
    assert_eq!(note.meta.kind, "card");
    assert_eq!(note.meta.project.as_deref(), Some("photo-organiser"));
    // A one-line thought is its title alone.
    assert!(note.text.ends_with("---\n"), "{}", note.text);
    let last = &k.log(None, 1).unwrap()[0];
    assert_eq!(last.summary, "capture: Ask the team about the photo tests");

    // A project that is not there is refused, and nothing is written.
    let err = k
        .capture_in(&Actor::Human, "Lost", &[], Some("nowhere"), NOW)
        .unwrap_err();
    assert!(err.to_string().contains("nowhere"), "{err}");
    assert!(!t.vault.root().join("projects/nowhere").exists());
}

#[test]
fn another_programs_lock_is_left_alone_however_old_and_named() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let k = Kasten::open(&root).unwrap();
    k.start_history().unwrap();
    // Twenty minutes old, and no Kasten write under way then: it may be
    // `git commit` waiting on its editor, so only the person may clear it.
    let old = std::time::SystemTime::now() - std::time::Duration::from_secs(20 * 60);
    for lock in [
        ".git/refs/heads/main.lock",
        ".git/index.lock",
        ".git/HEAD.lock",
    ] {
        fs::write(root.join(lock), "").unwrap();
        fs::File::options()
            .write(true)
            .open(root.join(lock))
            .unwrap()
            .set_modified(old)
            .unwrap();
        let err = k
            .capture(&agent(), &format!("After {lock}"), &[], NOW)
            .unwrap_err();
        assert!(err.to_string().contains(lock), "{err}");
        assert!(err.to_string().contains("delete"), "{err}");
        assert!(root.join(lock).exists(), "{lock}");
        fs::remove_file(root.join(lock)).unwrap();
        let note = k
            .capture(&agent(), &format!("After {lock}"), &[], NOW)
            .unwrap();
        assert_eq!(k.log(Some(&note.meta.path), 1).unwrap().len(), 1, "{lock}");
    }
}

#[test]
fn a_lock_taken_long_after_a_killed_kasten_write_is_not_kastens() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let k = Kasten::open(&root).unwrap();
    k.start_history().unwrap();
    // A Kasten write was killed an hour ago; a git command took the index
    // just now.
    fs::create_dir_all(root.join(".kasten/cache")).unwrap();
    fs::write(root.join(".kasten/cache/git-writing"), "").unwrap();
    fs::File::options()
        .write(true)
        .open(root.join(".kasten/cache/git-writing"))
        .unwrap()
        .set_modified(std::time::SystemTime::now() - std::time::Duration::from_secs(3600))
        .unwrap();
    fs::write(root.join(".git/index.lock"), "").unwrap();
    assert!(k.capture(&agent(), "Held back", &[], NOW).is_err());
    assert!(root.join(".git/index.lock").exists());
    assert!(!root.join(".kasten/cache/git-writing").exists());
}

#[test]
fn a_git_command_at_work_holds_ops_back_before_anything_is_written() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let k = Kasten::open(&root).unwrap();
    k.start_history().unwrap();
    let cards = || fs::read_dir(root.join("inbox")).unwrap().count();
    let before = cards();
    // `git commit` waiting on its editor holds the index.
    fs::write(root.join(".git/index.lock"), "").unwrap();
    let err = k.capture(&agent(), "Held back", &[], NOW).unwrap_err();
    assert!(err.to_string().contains("git"), "{err}");
    assert_eq!(cards(), before, "nothing written");
    assert!(
        root.join(".git/index.lock").exists(),
        "its lock is left alone"
    );
    // Once it is done, the same op goes through.
    fs::remove_file(root.join(".git/index.lock")).unwrap();
    let note = k.capture(&agent(), "Held back", &[], NOW).unwrap();
    assert_eq!(k.log(Some(&note.meta.path), 1).unwrap().len(), 1);
}

#[test]
fn locks_a_kasten_process_left_when_it_was_killed_are_cleared_at_once() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let k = Kasten::open(&root).unwrap();
    k.start_history().unwrap();
    // Killed mid-commit: its mark and a lock of a moment ago remain.
    fs::create_dir_all(root.join(".kasten/cache")).unwrap();
    fs::write(root.join(".kasten/cache/git-writing"), "").unwrap();
    fs::write(root.join(".git/index.lock"), "").unwrap();
    let note = k.capture(&agent(), "After a crash", &[], NOW).unwrap();
    assert_eq!(k.log(Some(&note.meta.path), 1).unwrap().len(), 1);
    assert!(!root.join(".git/index.lock").exists());
    assert!(!root.join(".kasten/cache/git-writing").exists());
}
