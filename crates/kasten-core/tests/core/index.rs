//! The SQLite index: rebuilt from
//! the files, kept current op by op, and caught up with outside edits.

use crate::common;

use std::fs;

use common::dev_vault;
use kasten_core::index::Index;

fn index_of(t: &common::TempVault) -> Index {
    let mut index = Index::open(&t.vault.root().join(".kasten/cache/index.sqlite")).unwrap();
    index.rebuild(&t.vault).unwrap();
    index
}

#[test]
fn lists_what_the_files_hold() {
    let t = dev_vault();
    let index = index_of(&t);
    let listed = index.notes().unwrap();
    let from_disk = t.vault.notes().unwrap();
    assert_eq!(listed.len(), from_disk.len());
    for (a, b) in listed.iter().zip(&from_disk) {
        assert_eq!(
            (&a.path, &a.title, &a.kind, &a.tags, &a.excerpt),
            (&b.path, &b.title, &b.kind, &b.tags, &b.excerpt)
        );
    }
}

#[test]
fn ranks_titles_first_and_matches_prefixes() {
    let t = dev_vault();
    let index = index_of(&t);
    let hits = index.search("roadmap", 10).unwrap();
    assert_eq!(hits[0].title, "Photo organiser roadmap");
    assert!(
        hits.iter().any(|h| h.path == "journal/2026/2026-09-23.md"),
        "{hits:?}"
    );
    assert_eq!(
        index.search("roadm", 10).unwrap()[0].title,
        "Photo organiser roadmap"
    );
    let body = index.search("image hashes", 10).unwrap();
    let hit = body
        .iter()
        .find(|h| h.path == "journal/2026/2026-09-23.md")
        .expect("journal hit");
    assert!(
        hit.snippet.to_lowercase().contains("image"),
        "{}",
        hit.snippet
    );
    assert!(index.search("   ", 10).unwrap().is_empty());
    assert!(index.search("\"unbalanced (quote*", 10).is_ok());
    assert!(
        index
            .search("Title", 50)
            .unwrap()
            .iter()
            .all(|h| !h.path.starts_with("templates/"))
    );
}

#[test]
fn filters_by_tag_project_type_and_date() {
    let t = dev_vault();
    let index = index_of(&t);
    let paths = |q: &str| {
        index
            .search(q, 50)
            .unwrap()
            .into_iter()
            .map(|h| h.path)
            .collect::<Vec<_>>()
    };
    let papers = paths("tag:paper");
    assert!(
        !papers.is_empty()
            && papers.iter().all(|p| t
                .vault
                .read(p)
                .unwrap()
                .meta
                .tags
                .contains(&"paper".to_owned())),
        "{papers:?}"
    );
    assert!(
        paths("project:photo-organiser")
            .iter()
            .all(|p| p.starts_with("projects/photo-organiser/"))
    );
    assert_eq!(paths("type:journal"), ["journal/2026/2026-09-23.md"]);
    assert!(
        paths("type:card diff")
            .iter()
            .all(|p| p.contains("/cards/") || p.starts_with("inbox/"))
    );
    assert!(paths("before:2026-01-01").is_empty());
    assert!(!paths("after:2026-01-01").is_empty());
}

#[test]
fn finds_linked_and_unlinked_mentions() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    fs::write(
        root.join("inbox/plain.md"),
        "---\ntitle: Plain\n---\nThe photo organiser roadmap is mentioned here without a link.\n",
    )
    .unwrap();
    let index = index_of(&t);
    let links: Vec<String> = index
        .backlinks("projects/photo-organiser/pages/photo-organiser-roadmap.md")
        .unwrap()
        .into_iter()
        .map(|b| b.path)
        .collect();
    assert!(
        links.contains(&"projects/photo-organiser/_project.md".to_owned()),
        "{links:?}"
    );
    assert!(
        links.contains(&"journal/2026/2026-09-23.md".to_owned()),
        "{links:?}"
    );
    let mentions = index
        .mentions(
            "Photo organiser roadmap",
            "projects/photo-organiser/pages/photo-organiser-roadmap.md",
        )
        .unwrap();
    let paths: Vec<&str> = mentions.iter().map(|m| m.path.as_str()).collect();
    assert_eq!(paths, ["inbox/plain.md"]);
    assert!(
        mentions[0].snippet.contains("photo organiser roadmap"),
        "{}",
        mentions[0].snippet
    );
}

#[test]
fn keeps_up_with_changes_by_path_and_by_scan() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let mut index = index_of(&t);
    fs::write(
        root.join("library/zettelkasten-method.md"),
        "---\ntitle: Zettelkasten method\n---\nPelican feathers.\n",
    )
    .unwrap();
    index
        .refresh(&t.vault, &["library/zettelkasten-method.md".to_owned()])
        .unwrap();
    assert_eq!(
        index.search("pelican", 5).unwrap()[0].path,
        "library/zettelkasten-method.md"
    );

    // Edits made while no one was watching: a scan finds them.
    fs::write(root.join("inbox/outside.md"), "Walrus notes\n").unwrap();
    fs::remove_file(root.join("inbox/look-at-json-canvas-spec.md")).unwrap();
    let changed = index.reconcile(&t.vault).unwrap();
    assert_eq!(changed, 2);
    assert_eq!(
        index.search("walrus", 5).unwrap()[0].path,
        "inbox/outside.md"
    );
    assert!(
        index
            .notes()
            .unwrap()
            .iter()
            .all(|n| n.path != "inbox/look-at-json-canvas-spec.md")
    );
    assert_eq!(index.reconcile(&t.vault).unwrap(), 0);
}

#[test]
fn keeps_up_with_a_folder_renamed_outside() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let mut index = index_of(&t);
    let paths = |index: &Index| -> Vec<String> {
        index.notes().unwrap().into_iter().map(|n| n.path).collect()
    };
    let before: Vec<String> = paths(&index)
        .into_iter()
        .filter(|p| p.starts_with("library/"))
        .collect();
    assert!(!before.is_empty());

    fs::rename(root.join("library"), root.join("shelf")).unwrap();
    // The watcher reports a folder by both its names, without its files.
    index
        .refresh(&t.vault, &["library".to_owned(), "shelf".to_owned()])
        .unwrap();
    let after = paths(&index);
    assert!(
        after.iter().all(|p| !p.starts_with("library/")),
        "{after:?}"
    );
    for old in &before {
        let new = old.replacen("library/", "shelf/", 1);
        assert!(after.contains(&new), "{new} is missing: {after:?}");
    }
}

#[test]
fn tidies_the_search_index_after_many_saves() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let mut index = index_of(&t);
    // A few saves leave nothing worth tidying.
    assert!(!index.tidy().unwrap());
    let path = "library/zettelkasten-method.md".to_owned();
    for i in 0..80 {
        fs::write(
            root.join(&path),
            format!("---\ntitle: Zettelkasten method\n---\nDraft {i} about otters.\n"),
        )
        .unwrap();
        index
            .refresh(&t.vault, std::slice::from_ref(&path))
            .unwrap();
    }
    assert!(index.tidy().unwrap(), "80 saves are worth a tidy");
    // It steps until the merge is done, then waits for more saves.
    let mut steps = 1;
    while index.tidy().unwrap() {
        steps += 1;
        assert!(steps < 20, "a small index merges in a few steps");
    }
    assert!(!index.tidy().unwrap());
    // Search reads the same after it.
    assert_eq!(index.search("otters", 5).unwrap()[0].path, path);
    assert_eq!(index.search("\"draft 79\"", 5).unwrap().len(), 1);
    assert!(index.search("\"draft 78\"", 5).unwrap().is_empty());
}

#[test]
fn lists_to_dos_with_their_days() {
    let t = dev_vault();
    let index = index_of(&t);
    let tasks = index.tasks().unwrap();
    assert!(
        tasks
            .iter()
            .any(|t| t.path == "journal/2026/2026-09-23.md" && !t.done),
        "{tasks:?}"
    );
    assert!(tasks.iter().all(|t| !t.path.starts_with("templates/")));
}

#[test]
fn indexes_lines_whose_first_word_ends_in_any_letter() {
    // Lines like these once split a character and stopped the indexer, so
    // one such note kept a vault from opening.
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    fs::write(
        root.join("library/arrows.md"),
        "---\ntitle: Arrows\ncreated: 2026-дек-01\nupdated: 2026-十二月-01\n---\n→ [[Next]]\n• [[Item]]\n✅ [[Done]]\nCafé [[Paris]] ]\n参见 [[笔记]]\n1. [ ] Numbered to-do\n- [x] Dashed to-do\n",
    )
    .unwrap();
    let index = index_of(&t);
    let tasks: Vec<(String, bool)> = index
        .tasks()
        .unwrap()
        .into_iter()
        .filter(|t| t.path == "library/arrows.md")
        .map(|t| (t.text, t.done))
        .collect();
    assert_eq!(
        tasks,
        [
            ("Numbered to-do".to_owned(), false),
            ("Dashed to-do".to_owned(), true)
        ]
    );
    assert_eq!(
        index.search("Paris", 5).unwrap()[0].path,
        "library/arrows.md"
    );
}

#[test]
fn answers_any_limit_it_is_asked_for() {
    let t = dev_vault();
    let index = index_of(&t);
    assert!(!index.search("photo", usize::MAX).unwrap().is_empty());
    let path = index.notes().unwrap()[0].path.clone();
    index.related(&path, usize::MAX).unwrap();
}

#[test]
fn finds_the_notes_that_mention_each_day() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    fs::write(
        root.join("library/plan.md"),
        "---\ntitle: Plan\n---\nKickoff on [[2026-10-01]].\n- [ ] Book the room [[2026-10-02]]\n",
    )
    .unwrap();
    fs::write(
        root.join("library/notes.md"),
        "---\ntitle: Notes\n---\nSee [[2026-10-01]] and [[2026-10-20|the review]], not [[2026-11-01]].\n",
    )
    .unwrap();
    // A day's own journal page does not mention itself; another day's does.
    fs::create_dir_all(root.join("journal/2026")).unwrap();
    fs::write(
        root.join("journal/2026/2026-10-01.md"),
        "---\ntitle: \"2026-10-01\"\ntype: journal\n---\nToday is [[2026-10-01]]. Follow up on [[2026-10-09]].\n",
    )
    .unwrap();
    let index = index_of(&t);
    let all = index.day_mentions("2026-10-01", "2026-10-31").unwrap();
    // Each says what kind of note it is, for its icon and name.
    let journal = all.iter().find(|m| m.day == "2026-10-09").unwrap();
    assert_eq!(
        (journal.kind.as_str(), journal.path.as_str()),
        ("journal", "journal/2026/2026-10-01.md")
    );
    assert!(
        all.iter()
            .filter(|m| m.day != "2026-10-09")
            .all(|m| m.kind == "page")
    );
    let found: Vec<(String, String)> = all
        .into_iter()
        .filter(|m| m.day != "2026-10-09")
        .map(|m| (m.day, m.path))
        .collect();
    // A to-do that names a day is a task, not a mention; days outside the
    // range and a day page's link to itself are left out.
    let mut expected = vec![
        ("2026-10-01".to_owned(), "library/notes.md".to_owned()),
        ("2026-10-01".to_owned(), "library/plan.md".to_owned()),
        ("2026-10-20".to_owned(), "library/notes.md".to_owned()),
    ];
    let mut sorted = found.clone();
    sorted.sort();
    expected.sort();
    assert_eq!(sorted, expected, "{found:?}");
    assert!(
        found.windows(2).all(|w| w[0].0 <= w[1].0),
        "by day: {found:?}"
    );
}

#[test]
fn deleting_the_cache_loses_nothing_the_files_and_history_hold() {
    use kasten_core::Kasten;
    let t = dev_vault();
    let before = {
        let k = Kasten::open(t.vault.root()).unwrap();
        k.start_history().unwrap();
        let listed = k.list().unwrap().len();
        let hits = k.search("zettelkasten", 20).unwrap().len();
        let commits = k.log(None, 1000).unwrap().len();
        (listed, hits, commits)
    };
    assert!(before.1 > 0, "the search finds something to compare");
    fs::remove_dir_all(t.vault.root().join(".kasten/cache")).unwrap();
    let k = Kasten::open(t.vault.root()).unwrap();
    let after = (
        k.list().unwrap().len(),
        k.search("zettelkasten", 20).unwrap().len(),
        k.log(None, 1000).unwrap().len(),
    );
    assert_eq!(after, before);
    assert!(k.verify().unwrap().problems.is_empty());
}
