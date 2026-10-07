//! Whiteboards on disk: the fixture board writes
//! back byte for byte, new boards go where they belong and never replace
//! one, cards land below what is there, the agents' view names every note,
//! and boards follow notes that move. Edits in memory are unit-tested in
//! `src/board/tests/`.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::board::{self, BoardView, Canvas, FileItem, Layout};
use kasten_core::{Error, move_note};
use serde_json::{Value, json};

const BRAINSTORM: &str = "projects/photo-organiser/boards/brainstorm.canvas";
const METRIC: &str = "projects/photo-organiser/cards/duplicate-score-for-photos.md";
const SKETCH: &str = "projects/photo-organiser/cards/duplicate-score-sketch.md";
const ROADMAP: &str = "projects/photo-organiser/pages/photo-organiser-roadmap.md";
const ZETTEL: &str = "library/zettelkasten-method.md";
const WELCOME: &str = "library/welcome-to-kasten.md";
const CAPTURE: &str = "inbox/capture-ideas-here.md";

/// A board as Obsidian writes it: tab-indented and fully expanded.
const OBSIDIAN: &str = "{\n\t\"nodes\":[\n\t\t{\n\t\t\t\"id\":\"c0de\",\n\t\t\t\"type\":\"link\",\n\t\t\t\"url\":\"https://jsoncanvas.org\",\n\t\t\t\"x\":0,\n\t\t\t\"y\":0,\n\t\t\t\"width\":400,\n\t\t\t\"height\":300\n\t\t}\n\t],\n\t\"edges\":[]\n}";

fn item(path: &str, tags: &[&str]) -> FileItem {
    FileItem {
        path: path.to_owned(),
        tags: tags.iter().map(|t| (*t).to_owned()).collect(),
    }
}

fn rect(canvas: &Canvas, id: &str) -> (i64, i64, i64, i64) {
    let node = canvas.node(id).unwrap_or_else(|| panic!("no node {id}"));
    let n = |key: &str| node[key].as_i64().unwrap();
    (n("x"), n("y"), n("width"), n("height"))
}

fn keys(value: &Value) -> Vec<&str> {
    let object = value.as_object().unwrap();
    object.keys().map(String::as_str).collect()
}

/// The message of an `Error::Invalid`.
fn invalid<T: std::fmt::Debug>(result: Result<T, Error>) -> String {
    match result {
        Err(Error::Invalid(why)) => why,
        other => panic!("expected Error::Invalid, got {other:?}"),
    }
}

#[test]
fn writes_the_fixture_board_back_byte_for_byte() {
    let t = dev_vault();
    let text = fs::read_to_string(t.vault.root().join(BRAINSTORM)).unwrap();
    let canvas = board::read_board(&t.vault, BRAINSTORM).unwrap();
    let out = canvas.to_text();
    assert_eq!(out, text, "the fixture is in house style");

    let written: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(written, serde_json::from_str::<Value>(&text).unwrap());
    assert_eq!(keys(&written), ["nodes", "edges", "x-kasten"]);
    let first = &written["nodes"][0];
    assert_eq!(
        keys(first),
        ["id", "type", "file", "x", "y", "width", "height"]
    );
    let extras = json!({"collapsed": [], "cardSize": {"n1": "expanded"}});
    assert_eq!(written["x-kasten"], extras);
    assert_eq!(canvas.node_ids(), ["n1", "n2", "n3", "g1"]);
    assert_eq!(canvas.title(), None);
}

#[test]
fn creates_boards_in_projects_and_the_library_without_replacing_any() {
    let t = dev_vault();
    let root = t.vault.root();
    let fixture = fs::read(root.join(BRAINSTORM)).unwrap();

    let path = board::create_board(&t.vault, "  Brainstorm ", Some("photo-organiser")).unwrap();
    assert_eq!(path, "projects/photo-organiser/boards/brainstorm-2.canvas");
    assert_eq!(fs::read(root.join(BRAINSTORM)).unwrap(), fixture, "kept");
    let empty =
        "{\n  \"nodes\": [],\n  \"edges\": [],\n  \"x-kasten\": {\"title\": \"Brainstorm\"}\n}\n";
    assert_eq!(fs::read_to_string(root.join(&path)).unwrap(), empty);
    let read = board::read_board(&t.vault, &path).unwrap();
    assert_eq!(read.title(), Some("Brainstorm"));

    // A project with no boards folder yet.
    let study = board::create_board(&t.vault, "Chapter map", Some("note-taking-study")).unwrap();
    assert_eq!(
        study,
        "projects/note-taking-study/boards/chapter-map.canvas"
    );

    let first = board::create_board(&t.vault, "Reading: 2026 plan", None).unwrap();
    assert_eq!(first, "library/reading-2026-plan.canvas");
    let text = fs::read(root.join(&first)).unwrap();
    let second = board::create_board(&t.vault, "Reading: 2026 plan", None).unwrap();
    assert_eq!(second, "library/reading-2026-plan-2.canvas");
    let third = board::create_board(&t.vault, "reading 2026 plan", None).unwrap();
    assert_eq!(third, "library/reading-2026-plan-3.canvas");
    assert_eq!(fs::read(root.join(&first)).unwrap(), text, "kept");
    assert_eq!(
        board::view(&t.vault, &third).unwrap().title,
        "reading 2026 plan"
    );
}

#[test]
fn refuses_bad_titles_and_projects() {
    let t = dev_vault();
    // A folder without `_project.md` is not a project.
    fs::create_dir_all(t.vault.root().join("projects/loose")).unwrap();
    for project in ["nope", "loose"] {
        let why = invalid(board::create_board(&t.vault, "Map", Some(project)));
        assert_eq!(why, format!("No project called {project}"));
    }
    for project in [
        "Note-taking Study",
        "../photo-organiser",
        "",
        "photo-organiser/boards",
    ] {
        invalid(board::create_board(&t.vault, "Map", Some(project)));
    }
    for title in ["", "   ", "a [b]", "a|b", "two\nlines"] {
        invalid(board::create_board(&t.vault, title, None));
    }
    let boards = t.vault.files(".canvas").unwrap();
    assert_eq!(boards.len(), 1, "nothing written");
}

#[test]
fn reads_and_writes_only_board_paths() {
    let t = dev_vault();
    let canvas = Canvas::new("Anything");
    let refused = |result: Result<(), Error>| matches!(result, Err(Error::InvalidPath(_)));
    for path in [
        "library/x.md",
        "library/x.canvas.tmp",
        ".kasten/x.canvas",
        ".trash/x.canvas",
        ".git/x.canvas",
        "../x.canvas",
        "/x.canvas",
        "library//x.canvas",
        "library\\x.canvas",
        "",
    ] {
        assert!(
            refused(board::write_board(&t.vault, path, &canvas)),
            "{path}"
        );
        assert!(
            refused(board::read_board(&t.vault, path).map(drop)),
            "{path}"
        );
    }
    let none = board::read_board(&t.vault, "library/none.canvas");
    assert!(matches!(none, Err(Error::NotFound(_))), "{none:?}");

    board::write_board(&t.vault, "library/plain.canvas", &canvas).unwrap();
    let back = board::read_board(&t.vault, "library/plain.canvas").unwrap();
    assert_eq!(back, canvas);
    fs::write(t.vault.root().join("library/broken.canvas"), "{ nope").unwrap();
    invalid(board::read_board(&t.vault, "library/broken.canvas"));
}

#[test]
fn new_cards_go_below_the_board_and_skip_ones_already_there() {
    let t = dev_vault();
    let mut canvas = board::read_board(&t.vault, BRAINSTORM).unwrap();
    let items = [
        item(METRIC, &[]),
        item(ZETTEL, &[]),
        item(WELCOME, &[]),
        item(ROADMAP, &[]),
        item(CAPTURE, &[]),
        item(ZETTEL, &[]),
        item("inbox/look-at-json-canvas-spec.md", &[]),
    ];
    let added = canvas.add_files(&items, Layout::Grid, NOW).unwrap();
    assert_eq!(added.nodes.len(), items.len(), "one id per item");
    assert_eq!(added.nodes[0], "n1", "already on the board");
    assert_eq!(added.nodes[5], added.nodes[1], "listed twice, placed once");
    let fresh: Vec<String> = [1, 2, 3, 4, 6].map(|i| added.nodes[i].clone()).into();
    assert_eq!(added.created, fresh);
    assert!(added.groups.is_empty());

    // The fixture's lowest edge is g1's at y 360; its leftmost is g1's at -40.
    let placed: Vec<_> = added.created.iter().map(|id| rect(&canvas, id)).collect();
    let rows = [(-40, 440), (320, 440), (680, 440), (1040, 440), (-40, 660)];
    assert_eq!(placed, rows.map(|(x, y)| (x, y, 320, 180)));
    let card = canvas.node(&added.created[0]).unwrap();
    assert_eq!(
        keys(card),
        ["id", "type", "file", "x", "y", "width", "height"]
    );
    assert_eq!(
        (&card["type"], &card["file"]),
        (&json!("file"), &json!(ZETTEL))
    );
    assert_eq!(
        canvas.node_ids()[..4],
        ["n1", "n2", "n3", "g1"],
        "new on top"
    );

    let again = canvas.add_files(&items, Layout::Grid, NOW).unwrap();
    assert!(again.created.is_empty());
    assert_eq!(again.nodes, added.nodes);

    // Sections for tags start at the same place.
    let mut sections = board::read_board(&t.vault, BRAINSTORM).unwrap();
    let tagged = [item(ZETTEL, &["reference"])];
    let more = sections
        .add_files(&tagged, Layout::ClusterByTag, NOW)
        .unwrap();
    assert_eq!(rect(&sections, &more.groups[0]), (-40, 440, 400, 300));
    assert_eq!(rect(&sections, &more.created[0]), (0, 520, 320, 180));
}

#[test]
fn view_names_the_notes_on_a_board_and_flags_missing_ones() {
    let t = dev_vault();
    let view = board::view(&t.vault, BRAINSTORM).unwrap();
    assert_eq!(view.path, BRAINSTORM);
    assert_eq!(view.title, "brainstorm", "no x-kasten title: the file name");
    assert_eq!(
        serde_json::to_value(&view.nodes[0]).unwrap(),
        json!({"id": "n1", "kind": "file", "x": 0, "y": 0, "width": 320, "height": 180, "file": METRIC, "title": "Duplicate score for photos", "size": "expanded"})
    );
    let sketch = &view.nodes[1];
    assert_eq!(sketch.title.as_deref(), Some("Duplicate score sketch"));
    assert!(!sketch.missing);
    let sticky = view.nodes[2].text.as_deref();
    assert_eq!(sticky, Some("What about burst shots?"));
    assert_eq!(view.nodes[2].color.as_deref(), Some("3"));
    assert_eq!(view.nodes[3].label.as_deref(), Some("Metric"));
    assert_eq!(
        serde_json::to_value(&view.edges).unwrap(),
        json!([{"id": "e1", "from": "n1", "to": "n2", "label": "formalised in", "fromSide": "right", "toSide": "left"}])
    );

    // A missing note and a nested board.
    let nested = board::create_board(&t.vault, "Metric details", Some("photo-organiser")).unwrap();
    let mut canvas = board::read_board(&t.vault, BRAINSTORM).unwrap();
    let cards = [item("library/gone.md", &[]), item(&nested, &[])];
    let added = canvas.add_files(&cards, Layout::Grid, NOW).unwrap();
    board::write_board(&t.vault, BRAINSTORM, &canvas).unwrap();
    let view = board::view(&t.vault, BRAINSTORM).unwrap();
    let find = |id: &str| view.nodes.iter().find(|n| n.id == id).unwrap();
    let gone = find(&added.created[0]);
    assert!(gone.missing && gone.title.is_none());
    assert_eq!(serde_json::to_value(gone).unwrap()["missing"], true);
    let inner = find(&added.created[1]);
    assert_eq!(inner.title.as_deref(), Some("Metric details"));
    assert!(!inner.missing);

    fs::write(t.vault.root().join("library/links.canvas"), OBSIDIAN).unwrap();
    let links = board::view(&t.vault, "library/links.canvas").unwrap();
    assert_eq!(links.title, "links");
    let link = &links.nodes[0];
    assert_eq!(link.url.as_deref(), Some("https://jsoncanvas.org"));
    assert!(!link.missing && link.title.is_none());
}

#[test]
fn resolves_a_node_by_id_file_or_title() {
    let t = dev_vault();
    let view = board::view(&t.vault, BRAINSTORM).unwrap();
    assert_eq!(view.resolve("n2").unwrap(), "n2");
    assert_eq!(view.resolve(SKETCH).unwrap(), "n2");
    assert_eq!(view.resolve("  duplicate SCORE sketch ").unwrap(), "n2");
    assert_eq!(view.resolve("Metric").unwrap(), "g1");
    assert_eq!(view.resolve("what about burst shots?").unwrap(), "n3");
    invalid(view.resolve("No such card"));
    invalid(view.resolve("  "));

    // Two different nodes with one name: the agent must use an id.
    let mut canvas = board::read_board(&t.vault, BRAINSTORM).unwrap();
    let twin = canvas.add_text("metric", None, NOW);
    let why = invalid(BoardView::of(&t.vault, BRAINSTORM, &canvas).resolve("Metric"));
    assert!(why.contains("g1") && why.contains(&twin), "{why}");

    // Titles can come from elsewhere, such as the index.
    let indexed = BoardView::with_titles(BRAINSTORM, &canvas, |path| {
        (path == METRIC).then(|| "From the index".to_owned())
    });
    assert_eq!(indexed.resolve("from the index").unwrap(), "n1");
    assert!(indexed.nodes[1].missing);
}

#[test]
fn relinks_boards_that_show_moved_notes_and_leaves_the_rest_alone() {
    let t = dev_vault();
    let root = t.vault.root();
    let fixture = fs::read_to_string(root.join(BRAINSTORM)).unwrap();
    let other = board::create_board(&t.vault, "Elsewhere", None).unwrap();
    let mut canvas = board::read_board(&t.vault, &other).unwrap();
    canvas
        .add_files(&[item(ZETTEL, &[])], Layout::Grid, NOW)
        .unwrap();
    board::write_board(&t.vault, &other, &canvas).unwrap();
    fs::write(root.join("library/obsidian.canvas"), OBSIDIAN).unwrap();
    fs::write(root.join("library/broken.canvas"), "{ not json").unwrap();
    let others = [
        other.as_str(),
        "library/obsidian.canvas",
        "library/broken.canvas",
    ];
    let bytes = || -> Vec<Vec<u8>> {
        let read = |path: &&str| fs::read(root.join(path)).unwrap();
        others.iter().map(read).collect()
    };
    let before = bytes();

    let moved = move_note(&t.vault, METRIC, None).unwrap().meta.path;
    assert_eq!(moved, "library/duplicate-score-for-photos.md");
    let moves = [(METRIC.to_owned(), moved.clone())];
    let changed = board::relink_boards(&t.vault, &moves).unwrap();
    assert_eq!(changed, [BRAINSTORM]);
    let relinked = fs::read_to_string(root.join(BRAINSTORM)).unwrap();
    assert_eq!(relinked, fixture.replace(METRIC, &moved));
    assert_eq!(bytes(), before, "boards without the note are not rewritten");
    let view = board::view(&t.vault, BRAINSTORM).unwrap();
    let title = view.nodes[0].title.as_deref();
    assert_eq!(title, Some("Duplicate score for photos"));

    let showing = |path: &str| board::boards_referencing(&t.vault, path).unwrap();
    assert_eq!(showing(&moved), [BRAINSTORM]);
    assert_eq!(showing(ZETTEL), [other.as_str()]);
    assert!(showing(METRIC).is_empty());
    let nothing = [("inbox/none.md".to_owned(), "library/none.md".to_owned())];
    assert!(board::relink_boards(&t.vault, &nothing).unwrap().is_empty());
    assert!(board::relink_boards(&t.vault, &[]).unwrap().is_empty());
    assert_eq!(bytes(), before);
}
