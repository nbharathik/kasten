//! An op that writes many files and fails part way leaves the vault as it
//! was: the files it made go, the ones it changed get their text back, and
//! the same op can simply be tried again.

use crate::common;

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use common::{NOW, dev_vault};
use kasten_core::Kasten;
use kasten_core::history::Actor;
use kasten_core::import::ImportOptions;

/// Every file and folder in the vault with what it holds, git's folder
/// and Kasten's cache aside.
fn snapshot(root: &Path) -> BTreeMap<String, Option<Vec<u8>>> {
    fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, Option<Vec<u8>>>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let rel = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            if rel == ".git" || rel == ".kasten/cache" {
                continue;
            }
            if path.is_dir() {
                out.insert(format!("{rel}/"), None);
                walk(root, &path, out);
            } else {
                out.insert(rel, Some(fs::read(&path).unwrap()));
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, root, &mut out);
    out
}

fn obsidian() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/import/obsidian")
}

#[test]
fn an_import_that_fails_part_way_leaves_the_vault_as_it_was() {
    let t = dev_vault();
    let root = t.vault.root();
    let k = Kasten::open(root).unwrap();
    k.start_history().unwrap();
    // One imported day is added to a day here; the next cannot be read, as
    // a folder stands where it should be. Days are written last.
    let day = root.join("journal/2026/2026-09-20.md");
    fs::write(
        &day,
        "---\ntitle: 2026-09-20\ntype: journal\n---\nA day here\n",
    )
    .unwrap();
    let blocked = root.join("journal/2026/2026-09-23.md");
    fs::remove_file(&blocked).unwrap();
    fs::create_dir(&blocked).unwrap();
    k.commit_external().unwrap();
    let options = ImportOptions {
        kind: None,
        project: Some("Field notes".into()),
    };

    let before = snapshot(root);
    assert!(k.import(&Actor::Human, &obsidian(), &options, NOW).is_err());
    let after = snapshot(root);
    let changed: Vec<&String> = after
        .keys()
        .chain(before.keys())
        .filter(|path| before.get(*path) != after.get(*path))
        .collect();
    assert!(changed.is_empty(), "left behind: {changed:?}");

    // With the way clear, the same import goes through, under its name.
    fs::remove_dir(&blocked).unwrap();
    let done = k.import(&Actor::Human, &obsidian(), &options, NOW).unwrap();
    assert!(
        done.summary
            .project_path
            .starts_with("projects/field-notes"),
        "{}",
        done.summary.project_path
    );
    assert!(!done.summary.project_path.contains("field-notes-2"));
}

#[test]
fn a_vault_restore_that_fails_part_way_puts_everything_back() {
    let t = dev_vault();
    let root = t.vault.root();
    let k = Kasten::open(root).unwrap();
    k.start_history().unwrap();
    let write = |name: &str, body: &str| {
        let text = format!("---\ntitle: {name}\n---\n{body}\n");
        fs::write(root.join(format!("library/{name}.md")), text).unwrap();
    };
    write("alpha", "One");
    write("beta", "Two");
    let then = k.commit_external().unwrap().expect("a commit");
    write("alpha", "One, changed");
    write("beta", "Two, changed");
    k.commit_external().unwrap().expect("a commit");

    // The earlier beta is gone from git's store, so the restore fails after
    // it has put alpha back.
    let beta = git2::Oid::hash_object(git2::ObjectType::Blob, b"---\ntitle: beta\n---\nTwo\n")
        .unwrap()
        .to_string();
    fs::remove_file(root.join(format!(".git/objects/{}/{}", &beta[..2], &beta[2..]))).unwrap();

    let before = snapshot(root);
    assert!(k.restore_vault(&Actor::Human, &then, NOW).is_err());
    let after = snapshot(root);
    let changed: Vec<&String> = after
        .keys()
        .chain(before.keys())
        .filter(|path| before.get(*path) != after.get(*path))
        .collect();
    assert!(changed.is_empty(), "left changed: {changed:?}");
}
