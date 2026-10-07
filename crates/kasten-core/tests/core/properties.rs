//! Random sequences of ops never lose content. Every note
//! ever created stays recoverable from the vault, the trash or git, and
//! every text ever saved is in git history.

use std::collections::BTreeSet;
use std::fs;

use proptest::prelude::*;

use kasten_core::history::Actor;
use kasten_core::{Instant, Kasten, Kind, NewNote, frontmatter, ulid_at};

#[derive(Debug, Clone)]
enum Op {
    Create(u8),
    Save(u8, u16),
    Rename(u8, u8),
    Move(u8, bool),
    Duplicate(u8),
    Trash(u8),
    Restore(u8),
    Outside(u8, u16),
    CommitEdits,
}

fn op() -> impl Strategy<Value = Op> {
    prop_oneof![
        3 => any::<u8>().prop_map(Op::Create),
        4 => (any::<u8>(), any::<u16>()).prop_map(|(a, b)| Op::Save(a, b)),
        1 => (any::<u8>(), any::<u8>()).prop_map(|(a, b)| Op::Rename(a, b)),
        1 => (any::<u8>(), any::<bool>()).prop_map(|(a, b)| Op::Move(a, b)),
        1 => any::<u8>().prop_map(Op::Duplicate),
        1 => any::<u8>().prop_map(Op::Trash),
        1 => any::<u8>().prop_map(Op::Restore),
        1 => (any::<u8>(), any::<u16>()).prop_map(|(a, b)| Op::Outside(a, b)),
        1 => Just(Op::CommitEdits),
    ]
}

const TITLES: [&str; 6] = [
    "Alpha",
    "Beta notes",
    "Gamma: plan",
    "Delta",
    "Épsilon",
    "Zeta 2",
];

fn pick<T: Clone>(items: &[T], n: u8) -> Option<T> {
    (!items.is_empty()).then(|| items[n as usize % items.len()].clone())
}

/// Every blob in the repository, as text.
fn all_blobs(dir: &std::path::Path) -> Vec<String> {
    let repo = git2::Repository::open(dir).unwrap();
    let odb = repo.odb().unwrap();
    let mut out = Vec::new();
    odb.foreach(|id| {
        if let Ok(object) = odb.read(*id)
            && object.kind() == git2::ObjectType::Blob
        {
            out.push(String::from_utf8_lossy(object.data()).into_owned());
        }
        true
    })
    .unwrap();
    out
}

fn run(ops: &[Op]) {
    let dir = std::env::temp_dir().join(format!("kasten-prop-{}", ulid_at(Instant::now().millis)));
    let k = Kasten::init(&dir, "Props").unwrap();
    let now = Instant {
        millis: 1_790_236_800_000,
    };
    let mut ids: BTreeSet<String> = BTreeSet::new();
    // Texts history must hold. Human typing is batched, so a draft replaced
    // before its commit may go unrecorded: it waits in `drafts` until something
    // commits it.
    let mut texts: Vec<String> = Vec::new();
    let mut drafts: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut trashed: Vec<String> = Vec::new();
    for op in ops {
        let notes: Vec<String> = k
            .list()
            .unwrap()
            .into_iter()
            .filter(|n| n.kind == "page" || n.kind == "card")
            .map(|n| n.path)
            .collect();
        let h = Actor::Human;
        match op {
            Op::Create(n) => {
                let new = NewNote {
                    kind: if n % 2 == 0 { Kind::Page } else { Kind::Card },
                    title: TITLES[*n as usize % TITLES.len()].into(),
                    date: "2026-09-24".into(),
                    project: None,
                    parent: None,
                    template: None,
                    icon: None,
                };
                let note = k.create(&h, &new, now).unwrap();
                ids.extend(note.meta.id);
            }
            Op::Save(n, v) => {
                if let Some(path) = pick(&notes, *n) {
                    let current = k.read(&path).unwrap();
                    let body = format!("Version {v} of {path}\n");
                    if v % 2 == 0 {
                        let agent = Actor::Agent {
                            client: "prop".into(),
                            session: "P".into(),
                        };
                        k.save_body(&agent, &path, &body, &current.hash, now)
                            .unwrap();
                        drafts.remove(&path);
                        texts.push(body);
                    } else {
                        k.save_body(&h, &path, &body, &current.hash, now).unwrap();
                        drafts.insert(path, body);
                    }
                }
            }
            // A rename or move commits the note, draft and all, unless it
            // changes nothing (the same title, or already in that folder).
            Op::Rename(n, t) => {
                if let Some(path) = pick(&notes, *n) {
                    let before = k.read(&path).unwrap().meta.title;
                    if let Ok(renamed) =
                        k.rename(&h, &path, TITLES[*t as usize % TITLES.len()], now)
                        && renamed.note.meta.title != before
                    {
                        texts.extend(drafts.remove(&path));
                    }
                }
            }
            Op::Move(n, to_project) => {
                if let Some(path) = pick(&notes, *n) {
                    let moved = if *to_project {
                        fs::create_dir_all(dir.join("projects/demo/pages")).unwrap();
                        k.move_note(&h, &path, Some("demo"))
                    } else {
                        k.move_note(&h, &path, None)
                    };
                    if moved.is_ok_and(|note| note.meta.path != path) {
                        texts.extend(drafts.remove(&path));
                    }
                }
            }
            Op::Duplicate(n) => {
                if let Some(path) = pick(&notes, *n) {
                    texts.extend(drafts.get(&path).cloned());
                    let copy = k.duplicate(&h, &path, now).unwrap();
                    ids.extend(copy.meta.id);
                }
            }
            Op::Trash(n) => {
                if let Some(path) = pick(&notes, *n) {
                    texts.extend(drafts.remove(&path));
                    trashed.push(k.trash(&h, &path, now).unwrap());
                }
            }
            Op::Restore(n) => {
                if let Some(entry) = pick(&trashed, *n)
                    && k.restore_trashed(&h, &entry).is_ok()
                {
                    trashed.retain(|t| t != &entry);
                }
            }
            Op::Outside(n, v) => {
                if let Some(path) = pick(&notes, *n) {
                    let text = fs::read_to_string(dir.join(&path)).unwrap();
                    let body = format!("Outside edit {v} of {path}\n");
                    fs::write(
                        dir.join(&path),
                        format!("{}{body}", frontmatter::split(&text).prefix),
                    )
                    .unwrap();
                    k.outside_changes(std::slice::from_ref(&path), now.millis);
                    // Another program overwrote the file: the draft on disk is gone,
                    // as it would be in any app (an open editor keeps its copy).
                    drafts.remove(&path);
                }
            }
            Op::CommitEdits => {
                k.commit_edits().unwrap();
                texts.extend(drafts.drain().map(|(_, text)| text));
            }
        }
    }
    k.commit_edits().unwrap();
    texts.extend(drafts.drain().map(|(_, text)| text));
    k.commit_external().unwrap();

    // Every id ever created is in the vault or the trash.
    let mut found: BTreeSet<String> = k.list().unwrap().into_iter().filter_map(|n| n.id).collect();
    for entry in k.list_trash().unwrap() {
        let text = fs::read_to_string(dir.join(&entry.trashed)).unwrap();
        found.extend(
            kasten_core::frontmatter::Front::read(frontmatter::split(&text).prefix)
                .id
                .map(|t| t.0),
        );
    }
    for id in &ids {
        assert!(found.contains(id), "note {id} is lost");
    }
    // Every text ever saved is in git.
    let blobs = all_blobs(&dir);
    for text in &texts {
        assert!(
            blobs.iter().any(|b| b.contains(text.as_str())),
            "text {text:?} never reached history"
        );
    }
    assert!(k.dirty().unwrap().is_empty(), "{:?}", k.dirty().unwrap());
    drop(k);
    let _ = fs::remove_dir_all(&dir);
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 24, ..ProptestConfig::default() })]

    #[test]
    fn random_ops_never_lose_content(ops in proptest::collection::vec(op(), 1..40)) {
        run(&ops);
    }
}
