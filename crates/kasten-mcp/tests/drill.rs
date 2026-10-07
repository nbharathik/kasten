//! The destruction drill: a scripted MCP client tries
//! to trash everything, empty notes, reach `.git`, rename in storms and fire
//! 1,000 rapid edits. Guardrails must trigger, nothing may be lost, and
//! undoing the session must restore the exact prior tree.

mod common;

use std::collections::BTreeMap;
use std::fs;

use common::{Client, vault};
use kasten_core::history::History;
use kasten_core::{Instant, Kasten};
use serde_json::{Value, json};

#[derive(Default, Debug)]
struct Counts {
    done: usize,
    pending: usize,
    refused: usize,
}

impl Counts {
    fn add(&mut self, outcome: &Result<Value, String>) {
        match outcome {
            Ok(v) if v["status"] == json!("done") => self.done += 1,
            Ok(v) if v["status"] == json!("pending_review") => self.pending += 1,
            Ok(v) => panic!("unexpected result {v}"),
            Err(_) => self.refused += 1,
        }
    }
}

#[test]
fn the_destruction_drill() {
    let v = vault();
    let history = History::open(&v.0).unwrap().unwrap();
    let before = history.tree_id("HEAD").unwrap();
    let head_before = history.head().unwrap();
    let originals: BTreeMap<String, Vec<u8>> = history
        .files_at("HEAD")
        .unwrap()
        .into_iter()
        .map(|p| {
            let bytes = fs::read(v.0.join(&p)).unwrap();
            (p, bytes)
        })
        .collect();

    let mut c = Client::start(&v.0, "drill");
    let listed = c.call("list_notes", json!({"limit": 500})).unwrap();
    let notes: Vec<String> = listed["notes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["path"].as_str().unwrap().to_owned())
        .collect();
    assert!(notes.len() >= 8, "{notes:?}");

    // 1. Trash everything.
    let mut trash = Counts::default();
    for note in &notes {
        trash.add(&c.call("trash_note", json!({"note": note, "reason": "drill"})));
    }
    assert!(trash.done <= 5, "{trash:?}");
    assert!(trash.pending > 0, "trash must trigger review: {trash:?}");
    let template = c.call("trash_note", json!({"note": "templates/page.md"}));
    assert!(template.is_err(), "templates are read-only: {template:?}");

    // 2. Empty every note that is left.
    let mut empty = Counts::default();
    for note in &notes {
        empty.add(&c.call(
            "propose_edit",
            json!({"note": note, "new_body": "", "reason": "drill"}),
        ));
    }
    assert!(empty.done == 0 && empty.pending > 0, "{empty:?}");

    // 3. Reach for .git and other private folders.
    for attempt in [
        c.call(
            "append",
            json!({"note": ".git/config", "markdown": "[core]\nbare = true"}),
        ),
        c.call("append", json!({"note": "../outside.md", "markdown": "x"})),
        c.call(
            "move_note",
            json!({"note": "Zettelkasten method", "project": "../.git"}),
        ),
        c.call("read_note", json!({"note": ".kasten/config.yaml"})),
    ] {
        assert!(
            attempt.is_err() || attempt.as_ref().unwrap()["status"] == json!("pending_review"),
            "{attempt:?}"
        );
    }

    // 4. A storm of renames.
    let captured = c
        .call("capture", json!({"markdown": "Storm target"}))
        .unwrap();
    let mut storm = Counts::default();
    let mut current = captured["result"]["path"].as_str().map(str::to_owned);
    for n in 0..40 {
        let Some(path) = current.clone() else { break };
        let outcome = c.call(
            "rename_note",
            json!({"note": path, "title": format!("Storm {n}")}),
        );
        if let Ok(v) = &outcome
            && v["status"] == json!("done")
        {
            current = v["result"]["note"]["path"].as_str().map(str::to_owned);
        }
        storm.add(&outcome);
    }
    assert!(storm.pending > 0, "renames must trigger review: {storm:?}");

    // 5. A thousand rapid edits to a note the session already changed.
    let target = current.unwrap();
    let mut rapid = Counts::default();
    for n in 0..1000 {
        rapid.add(&c.call(
            "append",
            json!({"note": target, "markdown": format!("Edit {n}")}),
        ));
    }
    assert_eq!(rapid.done, 1000, "{rapid:?}");
    let session = c.call("capture", json!({"markdown": "Last one"})).unwrap()["session"]
        .as_str()
        .unwrap()
        .to_owned();
    drop(c);

    // Nothing lost: every original file is where it was, or in the trash, byte for byte.
    let trashed: Vec<(String, Vec<u8>)> = walk(&v.0.join(".trash"));
    for (path, bytes) in &originals {
        let here = fs::read(v.0.join(path)).ok();
        let kept = here.as_ref() == Some(bytes)
            || trashed
                .iter()
                .any(|(p, b)| p.ends_with(path.as_str()) && b == bytes);
        assert!(kept, "{path} was lost");
    }
    let k = Kasten::open(&v.0).unwrap();
    let report = k.verify().unwrap();
    assert!(
        report.problems.iter().all(|p| p.kind != "git"),
        "{:?}",
        report.problems
    );
    assert!(!k.proposals().unwrap().is_empty());

    // Undo the whole session: back to the exact tree.
    let undone = k.undo_session(&session, Instant::now()).unwrap();
    assert_eq!(undone.conflict, None);
    assert_eq!(
        history.tree_id("HEAD").unwrap(),
        before,
        "undo must restore the exact tree"
    );
    assert_ne!(
        history.head().unwrap(),
        head_before,
        "undo adds commits, it never resets"
    );
    assert!(k.proposals().unwrap().is_empty());
}

fn walk(dir: &std::path::Path) -> Vec<(String, Vec<u8>)> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            out.extend(walk(&path));
        } else if let Ok(bytes) = fs::read(&path) {
            out.push((path.to_string_lossy().replace('\\', "/"), bytes));
        }
    }
    out
}
