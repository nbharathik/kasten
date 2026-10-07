//! Starter kits: a way of working (a daily planner, a second brain, a
//! Zettelkasten, Getting Things Done) added to a vault as one commit that
//! undo takes back. The person's own files are never touched; a starter
//! file still exactly as shipped may be replaced by the kit's version.
//! Agents cannot add kits.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use kasten_core::history::Actor;
use kasten_core::{Error, Instant, Kasten, kits, ulid_at};

const NOW: Instant = Instant {
    millis: 1_790_236_800_000,
};

struct Fresh {
    dir: PathBuf,
    k: Kasten,
}

impl Drop for Fresh {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}

fn fresh() -> Fresh {
    let dir = std::env::temp_dir().join(format!("kasten-kit-{}", ulid_at(Instant::now().millis)));
    let k = Kasten::init(&dir, "Kits").unwrap();
    Fresh { dir, k }
}

/// Every file of the vault but git's and Kasten's own, by path.
fn tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let rel = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            if rel == ".git" || rel == ".kasten" {
                continue;
            }
            if path.is_dir() {
                walk(root, &path, out);
            } else {
                out.insert(rel, fs::read(&path).unwrap());
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, root, &mut out);
    out
}

fn id_of(text: &str) -> Option<&str> {
    text.lines().find_map(|l| l.strip_prefix("id: "))
}

#[test]
fn lists_the_kits_with_the_daily_planner_recommended_first() {
    let all = kits();
    let ids: Vec<&str> = all.iter().map(|k| k.id.as_str()).collect();
    assert_eq!(
        ids,
        [
            "daily-planner",
            "second-brain",
            "zettelkasten",
            "gtd",
            "student",
            "research"
        ]
    );
    assert!(all[0].recommended);
    assert!(all[1..].iter().all(|k| !k.recommended));
    for kit in &all {
        assert!(
            !kit.name.is_empty() && !kit.summary.is_empty(),
            "{}",
            kit.id
        );
        assert!(
            kit.home.starts_with("library/") && kit.files.contains(&kit.home),
            "{}",
            kit.id
        );
    }
}

#[test]
fn every_file_in_a_kit_folder_ships_with_it() {
    let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("defaults/kits");
    for kit in kits() {
        let on_disk: Vec<String> = tree(&base.join(&kit.id))
            .into_keys()
            .filter(|p| p != "kit.json")
            .collect();
        let mut listed = kit.files.clone();
        listed.sort();
        assert_eq!(listed, on_disk, "{}", kit.id);
    }
}

#[test]
fn each_kit_is_one_commit_that_verify_accepts_and_undo_takes_back() {
    for kit in kits() {
        let f = fresh();
        let before = tree(&f.dir);
        let last = f.k.log(None, 1).unwrap()[0].id.clone();
        let added = f.k.add_kit(&Actor::Human, &kit.id, NOW).unwrap();
        assert_eq!(added.home, kit.home);
        let log = f.k.log(None, 2).unwrap();
        assert_eq!(log[1].id, last, "{}: one commit", kit.id);
        assert_eq!(added.commit.as_deref(), Some(log[0].id.as_str()));
        assert_eq!(log[0].summary, format!("kit: add {}", kit.name));
        let report = f.k.verify().unwrap();
        assert!(
            report.problems.is_empty(),
            "{}: {:?}",
            kit.id,
            report.problems
        );

        // Placeholders are gone, and sub-pages name the home page as parent.
        let home = fs::read_to_string(f.dir.join(&kit.home)).unwrap();
        let home_id = id_of(&home).unwrap().to_owned();
        for path in &added.written {
            let text = fs::read_to_string(f.dir.join(path)).unwrap();
            assert!(!text.contains("{{id:"), "{path}");
            if let Some(parent) = text.lines().find_map(|l| l.strip_prefix("parent: ")) {
                assert_eq!(parent, home_id, "{path}");
            }
        }
        // Every database view a kit page shows is in its tag's schema.
        for path in added.written.iter().filter(|p| p.ends_with(".md")) {
            let text = fs::read_to_string(f.dir.join(path)).unwrap();
            for embed in text.split("![[tags/").skip(1) {
                let target = &embed[..embed.find("]]").unwrap()];
                let (file, view) = target.split_once('#').unwrap();
                let schema = fs::read_to_string(f.dir.join("tags").join(file)).unwrap();
                assert!(
                    schema.contains(&format!("name: {view},")),
                    "{path}: {target}"
                );
            }
        }

        f.k.undo_commit(added.commit.as_deref().unwrap(), NOW)
            .unwrap();
        assert_eq!(tree(&f.dir), before, "{}: undo restores the tree", kit.id);
    }
}

#[test]
fn a_kit_already_added_is_refused_and_nothing_is_written() {
    let f = fresh();
    f.k.add_kit(&Actor::Human, "zettelkasten", NOW).unwrap();
    let before = tree(&f.dir);
    let last = f.k.log(None, 1).unwrap()[0].id.clone();
    let again = f.k.add_kit(&Actor::Human, "zettelkasten", NOW);
    assert!(
        matches!(again, Err(Error::Invalid(ref m)) if m.contains("already")),
        "{again:?}"
    );
    assert_eq!(tree(&f.dir), before);
    assert_eq!(f.k.log(None, 1).unwrap()[0].id, last);
}

#[test]
fn agents_cannot_add_kits() {
    let f = fresh();
    let before = tree(&f.dir);
    let agent = Actor::Agent {
        client: "test".into(),
        session: "s-1".into(),
    };
    assert!(matches!(
        f.k.add_kit(&agent, "gtd", NOW),
        Err(Error::Invalid(_))
    ));
    assert!(matches!(
        f.k.add_kit(&Actor::Human, "../gtd", NOW),
        Err(Error::Invalid(_))
    ));
    assert_eq!(tree(&f.dir), before);
}

#[test]
fn keeps_the_owners_files_and_replaces_only_untouched_starters() {
    // The daily planner keeps the stock blank journal template.
    let f = fresh();
    let added = f.k.add_kit(&Actor::Human, "daily-planner", NOW).unwrap();
    assert!(!added.written.contains(&"templates/journal.md".to_owned()));
    assert_eq!(
        fs::read_to_string(f.dir.join("templates/journal.md")).unwrap(),
        "---\ntitle: \"{{date}}\"\ntype: journal\n---\n"
    );
    // The stock task schema is the kit's already: not rewritten, not kept.
    assert!(!added.written.contains(&"tags/task.yaml".to_owned()));
    assert!(!added.kept.contains(&"tags/task.yaml".to_owned()));

    // One the owner wrote stays, as does any file of theirs the kit has.
    let g = fresh();
    let own = "---\ntitle: \"{{date}}\"\ntype: journal\n---\n## Mine\n";
    fs::write(g.dir.join("templates/journal.md"), own).unwrap();
    fs::create_dir_all(g.dir.join("library")).unwrap();
    fs::write(
        g.dir.join("library/how-to-plan-a-day.md"),
        "---\ntitle: Mine\n---\nMy way.\n",
    )
    .unwrap();
    let added = g.k.add_kit(&Actor::Human, "daily-planner", NOW).unwrap();
    assert_eq!(
        added.kept,
        ["library/how-to-plan-a-day.md", "templates/journal.md"]
    );
    assert_eq!(
        fs::read_to_string(g.dir.join("templates/journal.md")).unwrap(),
        own
    );
    assert_eq!(
        fs::read_to_string(g.dir.join("library/how-to-plan-a-day.md")).unwrap(),
        "---\ntitle: Mine\n---\nMy way.\n"
    );
}

#[test]
fn two_kits_live_side_by_side() {
    let f = fresh();
    f.k.add_kit(&Actor::Human, "gtd", NOW).unwrap();
    let second = f.k.add_kit(&Actor::Human, "second-brain", NOW).unwrap();
    // The first kit's journal template stays.
    assert!(second.kept.contains(&"templates/journal.md".to_owned()));
    let ids: Vec<String> = ["library/getting-things-done.md", "library/second-brain.md"]
        .iter()
        .map(|p| {
            id_of(&fs::read_to_string(f.dir.join(p)).unwrap())
                .unwrap()
                .to_owned()
        })
        .collect();
    assert_ne!(ids[0], ids[1]);
    assert!(f.k.verify().unwrap().problems.is_empty());
}
