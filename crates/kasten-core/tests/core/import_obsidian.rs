//! Importing an Obsidian vault: one commit makes a project of it, with folders
//! as a page tree, daily notes as journal days, attachments in `assets/`, PDFs
//! in `sources/`, canvases as boards, and every link pointing where it went.

use crate::common;

use std::fs;
use std::path::PathBuf;

use common::{NOW, dev_vault};
use kasten_core::Kasten;
use kasten_core::history::{Actor, History};
use kasten_core::import::{ImportKind, ImportOptions};

const P: &str = "projects/field-notes";

fn source() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/import/obsidian")
}

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

fn options() -> ImportOptions {
    ImportOptions {
        kind: None,
        project: Some("Field notes".into()),
    }
}

/// A file's text with what the import makes up (ids, the time now or a
/// file's time) as placeholders.
fn shape(text: &str) -> String {
    let lines: Vec<String> = text
        .lines()
        .map(|line| {
            for key in ["id: ", "parent: "] {
                if let Some(value) = line.strip_prefix(key)
                    && value.len() == 26
                {
                    return format!("{key}ID");
                }
            }
            for key in ["created: ", "updated: "] {
                if let Some(value) = line.strip_prefix(key)
                    && value.ends_with('Z')
                {
                    return format!("{key}TIME");
                }
            }
            line.to_owned()
        })
        .collect();
    format!("{}\n", lines.join("\n"))
}

fn text(t: &common::TempVault, path: &str) -> String {
    fs::read_to_string(t.vault.root().join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))
}

#[test]
fn plans_an_obsidian_vault_without_writing_anything() {
    let (t, k) = open();
    let commits = k.log(None, 500).unwrap().len();
    let plan = k.plan_import(&source(), &options(), NOW).unwrap();
    assert_eq!(plan.kind, ImportKind::Obsidian);
    assert_eq!(plan.project, "Field notes");
    assert_eq!(plan.project_path, format!("{P}/_project.md"));
    assert_eq!(
        (
            plan.notes,
            plan.days,
            plan.days_appended,
            plan.boards,
            plan.files,
            plan.tags
        ),
        (8, 1, 1, 1, 3, 0)
    );
    assert_eq!(k.log(None, 500).unwrap().len(), commits);
    assert!(!t.vault.root().join(P).exists());
    // Left as the vault was: Obsidian's settings and trash stay out.
    let joined = plan.warnings.join("\n");
    assert!(joined.contains("`note-type`"), "{joined}");
    assert!(joined.contains("`original-id`"), "{joined}");
    assert!(joined.contains("Nowhere/Gone.md"), "{joined}");
}

#[test]
fn imports_an_obsidian_vault_as_one_project_in_one_commit() {
    let (t, k) = open();
    let commits = k.log(None, 500).unwrap().len();
    let done = k.import(&Actor::Human, &source(), &options(), NOW).unwrap();
    let log = k.log(None, 500).unwrap();
    assert_eq!(log.len(), commits + 1, "one commit");
    assert_eq!(done.commit.as_deref(), Some(log[0].id.as_str()));
    assert_eq!(
        log[0].summary,
        "import: Obsidian vault “Field notes” (8 notes, 2 journal days, 1 board, 3 files)"
    );

    let project = k.read(&format!("{P}/_project.md")).unwrap();
    assert_eq!(
        (project.meta.title.as_str(), project.meta.kind.as_str()),
        ("Field notes", "project")
    );
    assert!(
        project
            .text
            .contains("Imported from an Obsidian vault on 2026-09-24"),
        "{}",
        project.text
    );

    assert_eq!(
        shape(&text(&t, &format!("{P}/pages/welcome.md"))),
        "---\nid: ID\ntitle: Welcome\ntype: page\ncreated: TIME\nupdated: TIME\ntags: [inbox, reading/queue]\n---\n\
Start with [[Summer trip]], then see [[Packing list|what to pack]].\n\n\
![map](../../../assets/field-notes/map.png)\n\n\
A note that does not exist yet: [[Missing note]]. #inbox and #reading/queue\n\n\
Not tags: #123, `#code`, [a link](https://example.com/#anchor).\n\n\
In code, `[[Not a link]]` stays, and so does:\n\n\
```\n[[Also not a link]] #not-a-tag\n```\n"
    );
    assert_eq!(
        shape(&text(&t, &format!("{P}/pages/travel/summer-trip.md"))),
        "---\ntags: [travel, summer]\nnote-type: trip\naliases: [Summer]\nid: ID\ntitle: Summer trip\ntype: page\ncreated: TIME\nupdated: TIME\nparent: ID\n---\n\
## Flights\n\nTokyo in April. See [[Index (Travel)|Index]] for the rest.\n"
    );
    assert_eq!(
        shape(&text(
            &t,
            &format!("{P}/pages/research/reading-notes-zettelkasten.md")
        )),
        "---\noriginal-id: 202109231014\ntitle: \"Reading notes: Zettelkasten\"\ncreated: 2021-09-23\nid: ID\ntype: page\nupdated: TIME\nparent: ID\n---\n\
The [paper](../../../../sources/paper.pdf) and a sketch:\n\n\
![diagram](../../../../assets/field-notes/diagram.png)\n\n\
Back to [[Welcome]], or [[Summer trip|the trip]].\n"
    );
    assert_eq!(
        shape(&text(&t, &format!("{P}/pages/research/research.md"))),
        "---\nid: ID\ntitle: Research\ntype: page\ncreated: TIME\nupdated: TIME\n---\n\
- [[Index (Research)]]\n- [[Reading notes: Zettelkasten]]\n"
    );
    assert_eq!(
        shape(&text(&t, &format!("{P}/pages/research/index-research.md"))),
        "---\nid: ID\ntitle: Index (Research)\ntype: page\ncreated: TIME\nupdated: TIME\nparent: ID\n---\n\
Reading so far: [[Reading notes: Zettelkasten|Reading notes]].\n"
    );

    // Folders are a page tree: a folder's note, or a page made for it.
    let parent_of = |path: &str| k.read(&format!("{P}/pages/{path}")).unwrap().meta.parent;
    let id_of = |path: &str| k.read(&format!("{P}/pages/{path}")).unwrap().meta.id;
    assert_eq!(parent_of("travel/travel.md"), None);
    for child in [
        "travel/summer-trip.md",
        "travel/packing-list.md",
        "travel/index-travel.md",
    ] {
        assert_eq!(parent_of(child), id_of("travel/travel.md"), "{child}");
    }
    for child in [
        "research/index-research.md",
        "research/reading-notes-zettelkasten.md",
    ] {
        assert_eq!(parent_of(child), id_of("research/research.md"), "{child}");
    }
    assert_eq!(parent_of("welcome.md"), None);

    // Daily notes are journal days; a day already here gets them added.
    assert_eq!(
        shape(&text(&t, "journal/2026/2026-09-20.md")),
        "---\nmood: 4\nid: ID\ntitle: 2026-09-20\ntype: journal\ncreated: TIME\nupdated: TIME\n---\n\
Read [[Reading notes: Zettelkasten|the notes]] again. Back to [[Welcome]].\n"
    );
    let day = text(&t, "journal/2026/2026-09-23.md");
    assert!(
        day.ends_with("> Use image hashes when file names collide.\n\n## From Field notes\n\n- Booked the guesthouse for [[Summer trip]]\n- Idea: a card for every chapter #idea\n"),
        "{day}"
    );
    assert!(day.contains("\ntags: [idea]\n"), "{day}");
    assert!(
        day.contains("Talked to the team"),
        "the day's own writing stays"
    );

    // Attachments and PDFs, byte for byte.
    let src = |rel: &str| fs::read(source().join(rel)).unwrap();
    let got = |rel: &str| fs::read(t.vault.root().join(rel)).unwrap();
    assert_eq!(
        got("assets/field-notes/map.png"),
        src("Attachments/map.png")
    );
    assert_eq!(
        got("assets/field-notes/diagram.png"),
        src("Attachments/diagram.png")
    );
    assert_eq!(got("sources/paper.pdf"), src("Attachments/paper.pdf"));
    let sources = k.sources().unwrap();
    assert!(
        sources
            .iter()
            .any(|s| s.path == "sources/paper.pdf" && s.title == "paper")
    );

    // The canvas is a board whose cards show the notes where they went.
    let board = k.board(&format!("{P}/boards/trip-plan.canvas")).unwrap();
    assert_eq!(board.title, "Trip plan");
    let files: Vec<&str> = board
        .nodes
        .iter()
        .filter_map(|n| n.file.as_deref())
        .collect();
    assert_eq!(
        files,
        [
            format!("{P}/pages/travel/summer-trip.md").as_str(),
            "assets/field-notes/map.png",
            "Nowhere/Gone.md"
        ]
    );
    assert_eq!(board.edges.len(), 1);

    // Found by search, titles, tags and backlinks, as any note is.
    let notes = k.list().unwrap();
    let summer = notes.iter().find(|n| n.title == "Summer trip").unwrap();
    assert_eq!(summer.tags, ["travel", "summer"]);
    assert_eq!(summer.kind, "page");
    assert!(k.backlinks(&summer.path).unwrap().len() >= 3);
    assert!(!k.search("guesthouse", 10).unwrap().is_empty());

    // Nothing of Obsidian's own, and the source is untouched.
    assert!(
        notes
            .iter()
            .all(|n| !n.path.contains("obsidian") && n.title != "Old idea")
    );
    assert!(source().join("Welcome.md").exists());
    let v = k.verify().unwrap();
    let ours =
        |p: &&kasten_core::Problem| p.path.as_deref().is_some_and(|path| path.starts_with(P));
    // Links to notes Obsidian had none for yet, and the card warned about.
    assert!(
        v.problems
            .iter()
            .filter(ours)
            .all(|p| p.kind == "unresolved-link"
                || (p.kind == "board-node" && p.detail.contains("Nowhere/Gone.md"))),
        "{:?}",
        v.problems
    );
}

#[test]
fn undoing_the_import_leaves_the_vault_as_it_was() {
    let (t, k) = open();
    let history = History::open(t.vault.root()).unwrap().unwrap();
    let before = history.tree_id("HEAD").unwrap();
    let done = k.import(&Actor::Human, &source(), &options(), NOW).unwrap();
    let undone = k.undo_commit(&done.commit.unwrap(), NOW).unwrap();
    assert!(undone.conflict.is_none(), "{:?}", undone.conflict);
    assert_eq!(history.tree_id("HEAD").unwrap(), before);
    assert!(!t.vault.root().join(P).exists());
    assert!(!t.vault.root().join("assets/field-notes").exists());
    assert!(k.list().unwrap().iter().all(|n| !n.path.starts_with(P)));
}

#[test]
fn a_second_import_goes_beside_the_first() {
    let (t, k) = open();
    k.import(&Actor::Human, &source(), &options(), NOW).unwrap();
    let again = k.import(&Actor::Human, &source(), &options(), NOW).unwrap();
    assert_eq!(
        again.summary.project_path,
        "projects/field-notes-2/_project.md"
    );
    assert!(
        t.vault
            .root()
            .join("projects/field-notes-2/pages/welcome.md")
            .exists()
    );
    assert!(t.vault.root().join("assets/field-notes-2/map.png").exists());
    // The same PDF is not kept twice.
    assert!(!t.vault.root().join("sources/paper-2.pdf").exists());
}

#[test]
fn names_the_project_after_the_folder_unless_told() {
    let (_t, k) = open();
    let plan = k
        .plan_import(
            &source(),
            &ImportOptions {
                kind: None,
                project: None,
            },
            NOW,
        )
        .unwrap();
    assert_eq!(plan.project, "obsidian");
    let plan = k
        .plan_import(
            &source(),
            &ImportOptions {
                kind: Some(ImportKind::Markdown),
                project: Some("  ".into()),
            },
            NOW,
        )
        .unwrap();
    assert_eq!(plan.kind, ImportKind::Markdown);
    assert_eq!(plan.project, "obsidian");
}

#[test]
fn refuses_what_it_cannot_import() {
    let (t, k) = open();
    let refused = |path: PathBuf| match k.plan_import(&path, &options(), NOW) {
        Err(err) => err.to_string(),
        Ok(plan) => panic!("planned {plan:?}"),
    };
    assert!(refused(source().join("missing")).contains("No folder"));
    assert!(refused(t.vault.root().to_path_buf()).contains("this vault"));
    assert!(refused(t.vault.root().join("library")).contains("this vault"));
    let parent = t.vault.root().parent().unwrap().to_path_buf();
    assert!(refused(parent.clone()).contains("holds this vault"));
    let empty = parent.join(format!("kasten-empty-{}", kasten_core::ulid_at(NOW.millis)));
    fs::create_dir_all(&empty).unwrap();
    assert!(refused(empty.clone()).contains("Nothing to import"));
    fs::remove_dir_all(&empty).unwrap();
}
