//! `kasten verify`: reports problems, never
//! fixes anything.

use crate::common;

use std::fs;

use common::dev_vault;
use kasten_core::Kasten;

#[test]
fn reports_broken_notes_duplicate_ids_links_and_boards() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    fs::write(
        root.join("inbox/broken.md"),
        "---\ntitle: [unclosed\n---\nBody\n",
    )
    .unwrap();
    let twin = fs::read_to_string(root.join("library/zettelkasten-method.md"))
        .unwrap()
        .replace("title: Zettelkasten method", "title: Twin");
    fs::write(root.join("library/twin.md"), twin).unwrap();
    fs::write(
        root.join("inbox/dangling.md"),
        "See [[No such page]] and [[2026-12-31]].\n",
    )
    .unwrap();
    fs::write(root.join("projects/photo-organiser/boards/broken.canvas"), r#"{"nodes":[{"id":"a","type":"file","file":"library/gone.md","x":0,"y":0,"width":10,"height":10}],"edges":[]}"#).unwrap();

    let k = Kasten::open(&root).unwrap();
    let before = fs::read_to_string(root.join("inbox/broken.md")).unwrap();
    let report = k.verify().unwrap();
    let kinds: Vec<(&str, Option<&str>)> = report
        .problems
        .iter()
        .map(|p| (p.kind.as_str(), p.path.as_deref()))
        .collect();
    assert!(
        kinds.contains(&("frontmatter", Some("inbox/broken.md"))),
        "{kinds:?}"
    );
    let twins = report
        .problems
        .iter()
        .find(|p| p.kind == "duplicate-id")
        .expect("duplicate id");
    assert!(
        twins
            .path
            .as_deref()
            .is_some_and(|p| p == "library/twin.md" || p == "library/zettelkasten-method.md"),
        "{twins:?}"
    );
    assert!(
        kinds.contains(&("unresolved-link", Some("inbox/dangling.md"))),
        "{kinds:?}"
    );
    assert!(
        kinds.contains(&(
            "board-node",
            Some("projects/photo-organiser/boards/broken.canvas")
        )),
        "{kinds:?}"
    );
    assert!(
        !report
            .problems
            .iter()
            .any(|p| p.detail.contains("2026-12-31")),
        "days resolve by being opened"
    );
    assert_eq!(
        fs::read_to_string(root.join("inbox/broken.md")).unwrap(),
        before,
        "verify never fixes"
    );
    assert!(report.notes > 10);
}

#[test]
fn checks_git_objects_and_a_clean_vault_passes() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let report = k.verify().unwrap();
    let serious: Vec<_> = report
        .problems
        .iter()
        .filter(|p| p.kind != "unresolved-link")
        .collect();
    assert!(serious.is_empty(), "{serious:?}");
    assert!(report.git_objects > 0);
}

/// Only Linux lets these names be made at all.
#[cfg(target_os = "linux")]
#[test]
fn reports_names_another_computer_could_not_hold() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    fs::write(root.join("inbox/aux.md"), "A device's name on Windows\n").unwrap();
    fs::write(root.join("inbox/Plan.md"), "One\n").unwrap();
    fs::write(root.join("inbox/plan.md"), "Two\n").unwrap();
    let report = Kasten::open(&root).unwrap().verify().unwrap();
    let found = |kind: &str, path: &str| {
        report
            .problems
            .iter()
            .any(|p| p.kind == kind && p.path.as_deref() == Some(path))
    };
    assert!(found("name", "inbox/aux.md"), "{:?}", report.problems);
    assert!(found("case-twin", "inbox/plan.md"), "{:?}", report.problems);
    assert!(!found("name", "inbox/Plan.md"));
}

#[test]
fn embedded_whiteboards_and_databases_resolve_to_their_files() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    fs::write(
        root.join("library/embeds.md"),
        "---\ntitle: Embeds\n---\n![[projects/photo-organiser/boards/brainstorm.canvas]]\n\n![[tags/task.yaml#Board]]\n\n![[library/gone.canvas]]\n\n![[tags/gone.yaml#All]]\n",
    )
    .unwrap();
    let report = Kasten::open(&root).unwrap().verify().unwrap();
    let unresolved: Vec<&str> = report
        .problems
        .iter()
        .filter(|p| p.kind == "unresolved-link")
        .map(|p| p.detail.as_str())
        .collect();
    assert_eq!(
        unresolved,
        [
            "[[library/gone.canvas]] points to no file",
            "[[tags/gone.yaml]] points to no file"
        ]
    );
}
