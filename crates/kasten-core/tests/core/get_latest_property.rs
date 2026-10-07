//! Getting the latest after both computers edited the same note never
//! loses a line either side wrote: every line one side added is in the
//! vault afterwards, in the note or in the copy beside it, and no two
//! notes share an id.

use crate::common;

use std::fs;
use std::path::PathBuf;

use proptest::prelude::*;

use common::{NOW, dev_vault};
use kasten_core::history::{self, Actor};
use kasten_core::{Instant, Kasten, frontmatter};

const NOTE: &str = "library/zettelkasten-method.md";
const LINES: usize = 10;

#[derive(Debug, Clone)]
enum Edit {
    Replace(usize),
    InsertAfter(usize),
    Delete(usize),
}

fn edit() -> impl Strategy<Value = Edit> {
    prop_oneof![
        (0..LINES).prop_map(Edit::Replace),
        (0..LINES).prop_map(Edit::InsertAfter),
        (0..LINES).prop_map(Edit::Delete),
    ]
}

/// The base lines with `edits` made, each new line marked `<side>-<n>`;
/// also the marks it wrote.
fn apply(side: &str, edits: &[Edit]) -> (String, Vec<String>) {
    let mut lines: Vec<String> = (0..LINES).map(|i| format!("base line {i}")).collect();
    let mut marks = Vec::new();
    for (n, edit) in edits.iter().enumerate() {
        let mark = format!("{side}-{n}");
        match *edit {
            Edit::Replace(i) if i < lines.len() => {
                lines[i] = mark.clone();
                marks.push(mark);
            }
            Edit::InsertAfter(i) if i < lines.len() => {
                lines.insert(i + 1, mark.clone());
                marks.push(mark);
            }
            Edit::Delete(i) if i < lines.len() && lines.len() > 1 => {
                lines.remove(i);
            }
            _ => {}
        }
    }
    // A mark that a later edit replaced or deleted was never there to keep.
    marks.retain(|m| lines.contains(m));
    (lines.join("\n") + "\n", marks)
}

fn save(k: &Kasten, body: &str) {
    let note = k.read(NOTE).unwrap();
    k.save_body(&Actor::Human, NOTE, body, &note.hash, NOW)
        .unwrap();
    k.commit_edits().unwrap();
}

struct Beside(Vec<PathBuf>);

impl Drop for Beside {
    fn drop(&mut self) {
        for dir in &self.0 {
            // Only the test's own folders under the system temp folder.
            let _ = fs::remove_dir_all(dir);
        }
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(12))]

    #[test]
    fn every_line_either_side_wrote_survives(
        ours in prop::collection::vec(edit(), 1..5),
        theirs in prop::collection::vec(edit(), 1..5),
    ) {
        let t = dev_vault();
        let a = Kasten::open(t.vault.root()).unwrap();
        a.start_history().unwrap();
        let remote = t.vault.root().with_extension("remote.git");
        let b_root = t.vault.root().with_extension("second-computer");
        let _beside = Beside(vec![remote.clone(), b_root.clone()]);
        git2::Repository::init_bare(&remote).unwrap();
        let url = remote.to_string_lossy().into_owned();
        let mut config = a.config();
        config.git.remote = Some(url.clone());
        a.set_config(config).unwrap();
        a.confirm_remote(Some(&url));
        save(&a, &apply("base", &[]).0);
        a.commit_external().unwrap();
        a.push(NOW.millis).unwrap();
        history::clone_backup(&url, None, &b_root).unwrap();
        let b = Kasten::open(&b_root).unwrap();
        b.confirm_remote(Some(&url));

        let (our_body, our_marks) = apply("ours", &ours);
        let (their_body, their_marks) = apply("theirs", &theirs);
        save(&a, &our_body);
        save(&b, &their_body);
        b.push(NOW.millis).unwrap();

        let latest = a.get_latest(Instant { millis: NOW.millis + 60_000 }).unwrap();
        let mut texts = vec![fs::read_to_string(a.root().join(NOTE)).unwrap()];
        for copy in &latest.copies {
            texts.push(fs::read_to_string(a.root().join(copy)).unwrap());
        }
        let bodies: Vec<String> = texts
            .iter()
            .map(|text| frontmatter::split(text).body.to_owned())
            .collect();
        for mark in our_marks.iter().chain(&their_marks) {
            prop_assert!(
                bodies.iter().any(|b| b.lines().any(|l| l == mark)),
                "{mark} was lost: {bodies:?}"
            );
        }
        let problems = a.verify().unwrap().problems;
        prop_assert!(
            !problems.iter().any(|p| p.kind == "duplicate-id"),
            "{problems:?}"
        );
    }
}
