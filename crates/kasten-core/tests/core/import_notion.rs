//! Importing a Notion export (Markdown & CSV, unzipped): pages keep their
//! nesting as sub-pages, links follow the pages without Notion's ids, a
//! callout stays a callout, and a database becomes a tag whose schema holds
//! its columns, with each row a page carrying its values.

use crate::common;

use std::fs;
use std::path::PathBuf;

use common::{NOW, dev_vault};
use kasten_core::Kasten;
use kasten_core::history::Actor;
use kasten_core::import::{ImportKind, ImportOptions};
use serde_json::json;

const P: &str = "projects/notion-workspace";

fn source() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/import/notion")
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
        project: Some("Notion workspace".into()),
    }
}

fn body(t: &common::TempVault, path: &str) -> String {
    let text =
        fs::read_to_string(t.vault.root().join(path)).unwrap_or_else(|e| panic!("{path}: {e}"));
    kasten_core::frontmatter::split(&text).body.to_owned()
}

#[test]
fn finds_a_notion_export_and_plans_it() {
    let (_t, k) = open();
    let plan = k.plan_import(&source(), &options(), NOW).unwrap();
    assert_eq!(plan.kind, ImportKind::Notion);
    assert_eq!(
        (plan.notes, plan.days, plan.boards, plan.files, plan.tags),
        (9, 0, 0, 1, 1)
    );
    assert!(plan.warnings.is_empty(), "{:?}", plan.warnings);
}

#[test]
fn imports_pages_as_a_page_tree_without_notion_ids() {
    let (t, k) = open();
    let done = k.import(&Actor::Human, &source(), &options(), NOW).unwrap();
    assert_eq!(
        k.log(None, 1).unwrap()[0].summary,
        "import: Notion export “Notion workspace” (9 notes, 1 file, 1 tag)"
    );
    assert_eq!(done.summary.project_path, format!("{P}/_project.md"));

    let home = k.read(&format!("{P}/pages/workspace-home.md")).unwrap();
    assert_eq!(
        (home.meta.title.as_str(), home.meta.parent.as_deref()),
        ("Workspace Home", None)
    );
    assert_eq!(
        body(&t, &home.meta.path),
        "Welcome to my notes. Plans: [[Trip abroad]]\n\n\
> [!note]\n> 💡 Everything important lives here.\n\n\
[[Reading List]]\n\n- [ ] Renew passport\n- [x] Book flights\n"
    );
    let trip = k
        .read(&format!("{P}/pages/workspace-home/trip-abroad.md"))
        .unwrap();
    assert_eq!(trip.meta.parent, home.meta.id);
    assert_eq!(
        body(&t, &trip.meta.path),
        "Dates: April 2027. Start with [[Packing]].\n\n\
![town.png](../../../../assets/notion-workspace/town.png)\n\n\
Books for the flight: [[How to Take Smart Notes]]\n"
    );
    let packing = k
        .read(&format!("{P}/pages/workspace-home/trip-abroad/packing.md"))
        .unwrap();
    assert_eq!(packing.meta.parent, trip.meta.id);
    assert!(body(&t, &packing.meta.path).contains("<details>\n<summary>Just in case</summary>"));
    assert_eq!(
        fs::read(t.vault.root().join("assets/notion-workspace/town.png")).unwrap().len(),
        fs::read(source().join("Private & Shared/Workspace Home 1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6/Trip abroad 2b3c4d5e6f7a48b9c0d1e2f3a4b5c6d7/town.png")).unwrap().len()
    );

    // Pages at the top of the export, a link by notion.so address, and Untitled.
    assert_eq!(
        body(&t, &format!("{P}/pages/ideas.md")),
        "A link by address: [[Trip abroad]], and one to the web: [help](https://www.notion.so/help).\n"
    );
    assert_eq!(
        k.read(&format!("{P}/pages/untitled.md"))
            .unwrap()
            .meta
            .title,
        "Untitled"
    );
    // No file keeps Notion's ids in its name.
    let notes = k.list().unwrap();
    assert!(
        notes
            .iter()
            .all(|n| !n.path.contains("1a2b3c4d") && !n.title.contains("1a2b3c4d"))
    );
}

#[test]
fn a_database_becomes_a_tag_with_its_columns() {
    let (t, k) = open();
    k.import(&Actor::Human, &source(), &options(), NOW).unwrap();
    let schema = fs::read_to_string(t.vault.root().join("tags/reading-list.yaml")).unwrap();
    assert_eq!(
        schema,
        concat!(
            "name: reading-list\n",
            "properties:\n",
            "  - {key: author, type: text}\n",
            "  - {key: status, type: select, options: [Reading, Done, To read]}\n",
            "  - {key: tags, type: multi_select, options: [method, writing, psychology, focus]}\n",
            "  - {key: rating, type: number}\n",
            "  - {key: finished, type: date}\n",
            "  - {key: url, type: url}\n",
            "  - {key: related, type: relation}\n",
            "  - {key: done, type: checkbox}\n",
            "views:\n",
            "  - {name: All, type: table}\n",
            "  - {name: Board, type: kanban, group_by: status}\n",
            "  - {name: Calendar, type: calendar, date: finished}\n",
        )
    );

    let dir = format!("{P}/pages/workspace-home/reading-list");
    let list = k
        .read(&format!("{P}/pages/workspace-home/reading-list.md"))
        .unwrap();
    assert_eq!(
        kasten_core::frontmatter::split(&list.text).body,
        "The Reading List database: each row is a page tagged reading-list.\n\n\
- [[How to Take Smart Notes]]\n- [[Thinking, Fast and Slow]]\n- [[Deep Work]]\n"
    );
    let smart = k
        .read(&format!("{dir}/how-to-take-smart-notes.md"))
        .unwrap();
    let thinking = k.read(&format!("{dir}/thinking-fast-and-slow.md")).unwrap();
    let deep = k.read(&format!("{dir}/deep-work.md")).unwrap();
    for row in [&smart, &thinking, &deep] {
        assert_eq!(row.meta.tags, ["reading-list"], "{}", row.meta.path);
        assert_eq!(row.meta.parent, list.meta.id, "{}", row.meta.path);
    }
    assert_eq!(
        smart.meta.props,
        json!({
            "author": "Sönke Ahrens",
            "status": "Reading",
            "tags": ["method", "writing"],
            "rating": 5,
            "finished": "2026-09-20",
            "url": "https://example.com/smart-notes",
            "related": [thinking.meta.id.clone().unwrap()],
            "done": true
        })
    );
    // The row's own lines of values are not kept twice.
    assert_eq!(
        body(&t, &smart.meta.path),
        "The slip-box method in one book.\n"
    );
    assert_eq!(body(&t, &thinking.meta.path), "");
    assert_eq!(thinking.meta.props["finished"], json!("2026-08-02"));
    assert_eq!(thinking.meta.props["done"], json!(false));
    // A row with no page of its own still becomes one.
    assert_eq!(deep.meta.props["status"], json!("To read"));
    assert_eq!(deep.meta.props["tags"], json!(["method", "focus"]));

    // The Tag Database shows the rows by the schema.
    let schemas = k.tag_schemas().unwrap();
    let reading = schemas.iter().find(|s| s.name == "reading-list").unwrap();
    assert_eq!(reading.properties.len(), 8);
}

#[test]
fn a_schema_already_here_is_kept() {
    let (t, k) = open();
    let mine = "name: reading-list\nproperties:\n  - {key: status, type: text}\n";
    fs::write(t.vault.root().join("tags/reading-list.yaml"), mine).unwrap();
    k.commit_external().unwrap();
    let done = k.import(&Actor::Human, &source(), &options(), NOW).unwrap();
    assert_eq!(done.summary.tags, 0);
    assert!(
        done.summary
            .warnings
            .iter()
            .any(|w| w.contains("reading-list")),
        "{:?}",
        done.summary.warnings
    );
    assert_eq!(
        fs::read_to_string(t.vault.root().join("tags/reading-list.yaml")).unwrap(),
        mine
    );
}

#[test]
fn an_export_folder_named_by_notion_names_the_project_notion() {
    let (t, k) = open();
    // Notion's zip unpacks to a folder such as `Export-2b5f…`.
    let dir = t.vault.root().parent().unwrap().join(format!(
        "Export-2b5fd8a1-7c4e-4f3a-9b1d-{}",
        &kasten_core::ulid_at(NOW.millis)[14..]
    ));
    let page = "Private & Shared/Ideas 7a8b9c0d1e2f43a4b5c6d7e8f9a0b1c2.md";
    fs::create_dir_all(dir.join("Private & Shared")).unwrap();
    fs::copy(source().join(page), dir.join(page)).unwrap();
    let plan = k.plan_import(&dir, &ImportOptions::default(), NOW);
    fs::remove_dir_all(&dir).unwrap();
    assert_eq!(plan.unwrap().project, "Notion");
}
