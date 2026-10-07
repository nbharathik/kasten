//! Edits never break a note's frontmatter: lists written the way other
//! tools write them, and files that end right after the closing fence.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::history::Actor;
use kasten_core::{Kasten, Saved, frontmatter};
use serde_json::{Map, json};

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    (t, k)
}

#[test]
fn adding_a_tag_to_a_list_written_at_the_keys_indent_keeps_every_key() {
    let (t, k) = open();
    let path = "library/listed.md";
    fs::write(
        t.vault.path_of(path).unwrap(),
        "---\nid: X\ntitle: Listed\nlocked: true\ntags:\n- a\n- b\n---\nBody\n",
    )
    .unwrap();
    k.reindex().unwrap();
    let note = k
        .set_tags(&Actor::Human, path, &["c".to_owned()], &[], NOW)
        .unwrap();
    assert_eq!(note.meta.id.as_deref(), Some("X"));
    assert_eq!(note.meta.title, "Listed");
    assert_eq!(note.meta.tags, vec!["a", "b", "c"]);
    assert!(frontmatter::yaml_ok(frontmatter::split(&note.text).prefix));
    assert!(note.meta.locked);
}

#[test]
fn a_property_list_at_its_keys_indent_is_replaced_whole() {
    let (t, k) = open();
    let path = "library/paper.md";
    fs::write(
        t.vault.path_of(path).unwrap(),
        "---\ntitle: Paper\nprops:\n  coauthors:\n  - A\n  - B\n  stage: draft\n---\n",
    )
    .unwrap();
    k.reindex().unwrap();
    let mut changes = Map::new();
    changes.insert("coauthors".into(), json!(["C"]));
    let note = k.update_props(&Actor::Human, path, &changes, NOW).unwrap();
    assert_eq!(note.meta.props.get("coauthors"), Some(&json!(["C"])));
    assert_eq!(note.meta.props.get("stage"), Some(&json!("draft")));
    assert!(frontmatter::yaml_ok(frontmatter::split(&note.text).prefix));
}

#[test]
fn a_file_ending_at_the_closing_fence_keeps_its_frontmatter_on_save() {
    let (t, k) = open();
    let path = "library/bare.md";
    fs::write(
        t.vault.path_of(path).unwrap(),
        "---\nid: B\ntitle: Bare\n---",
    )
    .unwrap();
    k.reindex().unwrap();
    let before = k.read(path).unwrap();
    let saved = k
        .save_body(&Actor::Human, path, "Hello\n", &before.hash, NOW)
        .unwrap();
    let note = saved.note();
    assert_eq!(note.meta.title, "Bare");
    assert_eq!(note.meta.id.as_deref(), Some("B"));
    assert_eq!(frontmatter::split(&note.text).body, "Hello\n");
    let appended = k
        .append(&Actor::Human, "library/bare.md", "More\n", None, NOW)
        .unwrap();
    assert_eq!(appended.meta.title, "Bare");
}

#[test]
fn a_note_without_frontmatter_keeps_its_text_when_a_rule_goes_on_top() {
    let (t, k) = open();
    let path = "library/loose.md";
    fs::write(t.vault.path_of(path).unwrap(), "Intro\n\n---\n\nMore\n").unwrap();
    k.reindex().unwrap();
    let before = k.read(path).unwrap();
    let body = "---\n\nIntro\n\n---\n\nMore\n";
    let saved = k
        .save_body(&Actor::Human, path, body, &before.hash, NOW)
        .unwrap();
    let note = saved.note();
    assert_eq!(note.text, "***\n\nIntro\n\n---\n\nMore\n");
    assert_eq!(frontmatter::split(&note.text).prefix, "");
    // The same body again changes nothing.
    let again = k
        .save_body(&Actor::Human, path, body, &note.hash, NOW)
        .unwrap();
    assert!(matches!(again, Saved::Unchanged { .. }));

    // Every other writer is held to it too.
    let ruled = "library/ruled.md";
    fs::write(t.vault.path_of(ruled).unwrap(), "---\nIntro\n").unwrap();
    k.reindex().unwrap();
    let appended = k
        .append(&Actor::Human, ruled, "---\nMore\n", None, NOW)
        .unwrap();
    assert_eq!(frontmatter::split(&appended.text).prefix, "");
    assert!(
        appended.text.starts_with("***\nIntro\n"),
        "{}",
        appended.text
    );
}
