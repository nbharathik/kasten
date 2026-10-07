//! Git history under the vault: one commit per
//! change, human and agent authors, per-note history and pushes.

use crate::common;

use std::fs;

use common::dev_vault;
use kasten_core::history::{Actor, History};

fn agent() -> Actor {
    Actor::Agent {
        client: "claude-code".into(),
        session: "S1".into(),
    }
}

#[test]
fn starts_history_with_everything_but_the_cache() {
    let t = dev_vault();
    let root = t.vault.root();
    assert!(History::open(root).unwrap().is_none(), "no .git yet");
    fs::create_dir_all(root.join(".kasten/cache")).unwrap();
    fs::write(root.join(".kasten/cache/index.sqlite"), "x").unwrap();
    let history = History::init(root, "Dev vault").unwrap();
    assert!(History::open(root).unwrap().is_some());
    assert!(
        history.dirty().unwrap().is_empty(),
        "{:?}",
        history.dirty().unwrap()
    );
    let log = history.log(None, 10).unwrap();
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].summary, "init: Dev vault");
    assert!(
        history
            .file_at(&log[0].id, "library/zettelkasten-method.md")
            .unwrap()
            .is_some()
    );
    assert!(
        history
            .file_at(&log[0].id, ".kasten/cache/index.sqlite")
            .unwrap()
            .is_none()
    );
    assert_eq!(history.branch().unwrap(), "main");
}

#[test]
fn commits_only_the_paths_an_op_touched() {
    let t = dev_vault();
    let root = t.vault.root();
    let history = History::init(root, "v").unwrap();
    fs::write(root.join("library/zettelkasten-method.md"), "changed\n").unwrap();
    fs::write(root.join("inbox/new.md"), "new\n").unwrap();
    fs::remove_file(root.join("inbox/look-at-json-canvas-spec.md")).unwrap();

    let id = history
        .commit(
            &[
                "inbox/new.md".into(),
                "inbox/look-at-json-canvas-spec.md".into(),
            ],
            "capture: new",
            &Actor::Human,
            "capture",
        )
        .unwrap()
        .expect("a commit");
    assert_eq!(history.dirty().unwrap(), ["library/zettelkasten-method.md"]);
    // Nothing new to commit makes no commit.
    assert!(
        history
            .commit(&["inbox/new.md".into()], "again", &Actor::Human, "capture")
            .unwrap()
            .is_none()
    );

    let log = history.log(None, 10).unwrap();
    assert_eq!(log[0].id, id);
    assert_eq!(log[0].summary, "capture: new");
    assert!(!log[0].agent);
    assert!(
        history
            .file_at(&id, "inbox/look-at-json-canvas-spec.md")
            .unwrap()
            .is_none()
    );
}

#[test]
fn signs_agent_commits_with_their_session() {
    let t = dev_vault();
    let root = t.vault.root();
    let history = History::init(root, "v").unwrap();
    fs::write(root.join("inbox/idea.md"), "idea\n").unwrap();
    history
        .commit(
            &["inbox/idea.md".into()],
            "capture: idea",
            &agent(),
            "capture",
        )
        .unwrap();
    let last = &history.log(None, 1).unwrap()[0];
    assert!(last.agent);
    assert_eq!(last.author, "agent:claude-code");
    assert_eq!(last.session.as_deref(), Some("S1"));
    assert_eq!(last.op.as_deref(), Some("capture"));
    assert!(
        last.message
            .ends_with("\n\nKasten-Session: S1\nKasten-Op: capture\n"),
        "{:?}",
        last.message
    );
}

#[test]
fn lists_the_commits_that_touched_a_note_and_its_old_text() {
    let t = dev_vault();
    let root = t.vault.root();
    let history = History::init(root, "v").unwrap();
    let path = "library/zettelkasten-method.md";
    let first = fs::read_to_string(root.join(path)).unwrap();
    fs::write(root.join(path), "second\n").unwrap();
    history
        .commit(
            &[path.into()],
            "edit: Zettelkasten method",
            &Actor::Human,
            "edit",
        )
        .unwrap();
    fs::write(root.join("inbox/other.md"), "other\n").unwrap();
    history
        .commit(
            &["inbox/other.md".into()],
            "capture: other",
            &Actor::Human,
            "capture",
        )
        .unwrap();
    fs::write(root.join(path), "third\n").unwrap();
    history
        .commit(
            &[path.into()],
            "edit: Zettelkasten method",
            &Actor::Human,
            "edit",
        )
        .unwrap();

    let log = history.log(Some(path), 10).unwrap();
    let texts: Vec<String> = log
        .iter()
        .map(|c| history.file_at(&c.id, path).unwrap().unwrap())
        .collect();
    assert_eq!(texts, ["third\n", "second\n", first.as_str()]);
    assert_eq!(history.log(Some(path), 2).unwrap().len(), 2);
}

#[test]
fn pushes_to_a_remote_without_forcing() {
    let t = dev_vault();
    let root = t.vault.root();
    let history = History::init(root, "v").unwrap();
    let remote = root.with_extension("remote.git");
    git2::Repository::init_bare(&remote).unwrap();
    let url = remote.to_string_lossy().into_owned();
    history.push(&url).unwrap();
    let bare = git2::Repository::open_bare(&remote).unwrap();
    let head = history.log(None, 1).unwrap()[0].id.clone();
    assert_eq!(
        bare.refname_to_id("refs/heads/main").unwrap().to_string(),
        head
    );

    // A remote that moved on elsewhere is never overwritten.
    let sig = git2::Signature::now("x", "x@y").unwrap();
    let tree = bare
        .find_tree(
            bare.find_commit(bare.refname_to_id("refs/heads/main").unwrap())
                .unwrap()
                .tree_id(),
        )
        .unwrap();
    let parent = bare
        .find_commit(bare.refname_to_id("refs/heads/main").unwrap())
        .unwrap();
    bare.commit(
        Some("refs/heads/main"),
        &sig,
        &sig,
        "elsewhere",
        &tree,
        &[&parent],
    )
    .unwrap();
    fs::write(root.join("inbox/late.md"), "late\n").unwrap();
    history
        .commit(
            &["inbox/late.md".into()],
            "capture: late",
            &Actor::Human,
            "capture",
        )
        .unwrap();
    assert!(history.push(&url).is_err());
    let _ = fs::remove_dir_all(&remote);
}

#[test]
fn history_keeps_line_endings_as_they_are_written() {
    // Git for Windows turns on line-ending conversion for everyone; a
    // restore or a merge would then rewrite every note's line endings.
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let k = kasten_core::Kasten::open(&root).unwrap();
    k.start_history().unwrap();
    let local = |root: &std::path::Path| {
        git2::Repository::open(root)
            .unwrap()
            .config()
            .unwrap()
            .open_level(git2::ConfigLevel::Local)
            .unwrap()
    };
    assert_eq!(local(&root).get_bool("core.autocrlf").ok(), Some(false));
    // A repository made by another tool gets it when the vault opens.
    local(&root).remove("core.autocrlf").unwrap();
    drop(k);
    let _k = kasten_core::Kasten::open(&root).unwrap();
    assert_eq!(local(&root).get_bool("core.autocrlf").ok(), Some(false));
}
