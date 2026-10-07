//! Emptying the trash, which only a person can do: files leave the trash
//! only where history holds them as they are, in one commit that undo
//! takes back, and no agent, chat, CLI or MCP path can reach it.

use crate::common;

use std::fs;
use std::path::Path;

use common::{NOW, dev_vault};
use kasten_core::history::Actor;
use kasten_core::{Kasten, Kind, NewNote};

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

fn with_history() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

fn trash_two(k: &Kasten) -> Vec<String> {
    ["First to go", "Second to go"]
        .iter()
        .map(|title| {
            let note = k.create(&Actor::Human, &page(title), NOW).unwrap();
            k.trash(&Actor::Human, &note.meta.path, NOW).unwrap()
        })
        .collect()
}

#[test]
fn empties_the_trash_in_one_commit_that_undo_takes_back() {
    let (t, k) = with_history();
    let trashed = trash_two(&k);
    let before = k.list_trash().unwrap().len();
    assert!(before >= 2);

    let emptied = k.empty_trash(&Actor::Human, NOW).unwrap();
    assert_eq!(emptied.removed, before);
    assert!(emptied.kept.is_empty(), "{emptied:?}");
    assert!(k.list_trash().unwrap().is_empty());
    for path in &trashed {
        assert!(!t.vault.root().join(path).exists(), "{path}");
    }
    let top = &k.log(None, 1).unwrap()[0];
    assert_eq!(Some(top.id.clone()), emptied.commit);
    assert_eq!(top.summary, format!("trash: emptied {before}"));

    let undone = k
        .undo_commit(emptied.commit.as_deref().unwrap(), NOW)
        .unwrap();
    assert!(undone.conflict.is_none());
    assert_eq!(k.list_trash().unwrap().len(), before);
    for path in &trashed {
        assert!(t.vault.root().join(path).is_file(), "{path}");
    }
}

#[test]
fn only_a_person_can_empty_it() {
    let (_t, k) = with_history();
    trash_two(&k);
    let agent = Actor::Agent {
        client: "claude-code".into(),
        session: "S1".into(),
    };
    let err = k.empty_trash(&agent, NOW).unwrap_err();
    assert!(err.to_string().contains("Only you"), "{err}");
    assert!(k.list_trash().unwrap().len() >= 2);
}

#[test]
fn a_vault_without_history_keeps_its_trash() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let note = k.create(&Actor::Human, &page("Stays"), NOW).unwrap();
    let trashed = k.trash(&Actor::Human, &note.meta.path, NOW).unwrap();
    let err = k.empty_trash(&Actor::Human, NOW).unwrap_err();
    assert!(err.to_string().contains("history"), "{err}");
    assert!(t.vault.root().join(trashed).is_file());
}

#[test]
fn keeps_what_history_does_not_hold_and_never_follows_a_link() {
    let (t, k) = with_history();
    trash_two(&k);
    let root = t.vault.root();
    // Ignored by git, so history has never held it.
    fs::write(root.join(".gitignore"), ".trash/**/private.md\n").unwrap();
    k.commit_external().unwrap();
    let private = root.join(".trash/20260101T000000Z/private.md");
    fs::create_dir_all(private.parent().unwrap()).unwrap();
    fs::write(&private, "---\ntitle: Private\n---\nOnly here\n").unwrap();
    // A link inside the trash is left alone, and so is what it points at.
    let outside = root.with_extension("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("keep.md"), "outside\n").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, root.join(".trash/20260101T000000Z/linked")).unwrap();

    let emptied = k.empty_trash(&Actor::Human, NOW).unwrap();
    assert!(private.is_file());
    assert!(
        emptied.kept.iter().any(|p| p.ends_with("private.md")),
        "{emptied:?}"
    );
    assert!(outside.join("keep.md").is_file());
    let _ = fs::remove_dir_all(&outside);
}

#[test]
fn no_agent_chat_cli_or_mcp_path_reaches_it() {
    let workspace = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    for folder in [
        "crates/kasten-mcp/src",
        "crates/kasten-cli/src",
        "app/src-tauri/src/chat",
    ] {
        for file in rust_files(&workspace.join(folder)) {
            let text = fs::read_to_string(&file).unwrap();
            assert!(
                !text.contains("empty_trash"),
                "{} can reach Empty trash",
                file.display()
            );
        }
    }
}

fn rust_files(dir: &Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            out.extend(rust_files(&path));
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
    out
}
