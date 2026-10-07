//! Importing a Heptabase backup (`All-Data.json`): cards become cards with
//! their text as Markdown and mentions as links, whiteboards become boards
//! with each card, section, text and connection where it was, and journal
//! days join the journal. What was in Heptabase's trash stays out.

use crate::common;

use std::fs;
use std::path::PathBuf;

use common::{NOW, dev_vault};
use kasten_core::Kasten;
use kasten_core::history::Actor;
use kasten_core::import::{ImportKind, ImportOptions};

const P: &str = "projects/heptabase";

fn source() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/import/heptabase")
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
        project: Some("Heptabase".into()),
    }
}

#[test]
fn imports_cards_whiteboards_and_journal_days() {
    let (t, k) = open();
    let plan = k.plan_import(&source(), &options(), NOW).unwrap();
    assert_eq!(plan.kind, ImportKind::Heptabase);
    assert_eq!(
        (
            plan.notes,
            plan.days,
            plan.days_appended,
            plan.boards,
            plan.files
        ),
        (3, 1, 1, 1, 0)
    );
    k.import(&Actor::Human, &source(), &options(), NOW).unwrap();
    assert_eq!(
        k.log(None, 1).unwrap()[0].summary,
        "import: Heptabase backup “Heptabase” (3 notes, 2 journal days, 1 board)"
    );

    let zettel =
        fs::read_to_string(t.vault.root().join(format!("{P}/cards/zettelkasten.md"))).unwrap();
    let parts = kasten_core::frontmatter::split(&zettel);
    let (front, body) = (parts.prefix, parts.body);
    assert!(front.contains("\ntitle: Zettelkasten\ntype: card\ncreated: 2026-09-02T09:00:00Z\nupdated: 2026-09-19T12:30:00Z\n"), "{front}");
    assert_eq!(
        body,
        "A method of **linked** notes. See [[Atomic notes]].\n\n- One idea per card\n- [ ] Read the book\n"
    );
    let atomic = k.read(&format!("{P}/cards/atomic-notes.md")).unwrap();
    assert_eq!(atomic.meta.kind, "card");
    assert!(
        atomic
            .text
            .ends_with("---\nOne idea, one card. Back to [[Zettelkasten]].\n"),
        "{}",
        atomic.text
    );
    // A card without a title is named by its first line, which it keeps.
    let untitled = k
        .read(&format!("{P}/cards/untitled-idea-about-links.md"))
        .unwrap();
    assert_eq!(untitled.meta.title, "Untitled idea about links");
    assert!(
        untitled
            .text
            .ends_with("---\nUntitled idea about links\n\nLinks are the point.\n")
    );
    // Heptabase's trash stays out.
    assert!(k.list().unwrap().iter().all(|n| n.title != "Deleted card"));

    let board = k.board(&format!("{P}/boards/study-map.canvas")).unwrap();
    assert_eq!(board.title, "Study map");
    let nodes: Vec<(&str, &str, Option<&str>)> = board
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n.kind.as_str(), n.file.as_deref()))
        .collect();
    assert_eq!(
        nodes,
        [
            ("s-1", "group", None),
            (
                "ci-1",
                "file",
                Some(format!("{P}/cards/zettelkasten.md").as_str())
            ),
            (
                "ci-2",
                "file",
                Some(format!("{P}/cards/atomic-notes.md").as_str())
            ),
            ("t-1", "text", None),
        ]
    );
    let card = &board.nodes[1];
    assert_eq!((card.x, card.y, card.width, card.height), (0, 0, 400, 300));
    assert_eq!(board.nodes[2].width, 360, "a card without a size gets one");
    assert_eq!(board.edges.len(), 1);
    assert_eq!(
        (board.edges[0].from.as_str(), board.edges[0].to.as_str()),
        ("ci-1", "ci-2")
    );
    let canvas =
        fs::read_to_string(t.vault.root().join(format!("{P}/boards/study-map.canvas"))).unwrap();
    assert!(canvas.contains("\"label\": \"Core ideas\""), "{canvas}");
    assert!(canvas.contains("\"text\": \"Start here\""), "{canvas}");
    assert!(
        canvas.contains("\"color\": \"1\""),
        "red stays red: {canvas}"
    );

    // Journal days: a new one, and one added to the day already here.
    let new_day = fs::read_to_string(t.vault.root().join("journal/2026/2026-09-21.md")).unwrap();
    assert!(
        new_day.contains("\ntype: journal\n") && new_day.ends_with("---\nA quiet day.\n"),
        "{new_day}"
    );
    let day = fs::read_to_string(t.vault.root().join("journal/2026/2026-09-23.md")).unwrap();
    assert!(
        day.ends_with("\n## From Heptabase\n\nMapped the study on [[Zettelkasten]].\n"),
        "{day}"
    );
}

#[test]
fn reads_a_backup_in_separate_files_too() {
    let (t, k) = open();
    // Older backups keep each list in a file of its own.
    let all: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(source().join("All-Data.json")).unwrap()).unwrap();
    let dir = t
        .vault
        .root()
        .parent()
        .unwrap()
        .join(format!("kasten-hepta-{}", kasten_core::ulid_at(NOW.millis)));
    fs::create_dir_all(&dir).unwrap();
    for (file, key) in [
        ("card.json", "cardList"),
        ("whiteboard.json", "whiteBoardList"),
        ("card-Instance.json", "cardInstances"),
        ("connection.json", "connections"),
    ] {
        fs::write(dir.join(file), all[key].to_string()).unwrap();
    }
    let plan = k.plan_import(&dir, &options(), NOW);
    fs::remove_dir_all(&dir).unwrap();
    let plan = plan.unwrap();
    assert_eq!(plan.kind, ImportKind::Heptabase);
    assert_eq!((plan.notes, plan.boards, plan.days), (3, 1, 0));
}
