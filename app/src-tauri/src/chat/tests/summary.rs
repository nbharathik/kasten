//! What a tool call did, in one line: counts say when a list was cut.

use serde_json::json;

use super::vault;
use crate::chat::summary::{describe, some_of};

#[test]
fn counts_say_how_many_of_how_many() {
    assert_eq!(some_of(1, 1, "note"), "1 note");
    assert_eq!(some_of(0, 0, "note"), "0 notes");
    assert_eq!(some_of(50, 300, "note"), "50 of 300 notes");
}

#[test]
fn listed_and_tag_rows_count_the_same_way() {
    let v = vault();
    let rows = |n: usize| {
        (0..n)
            .map(|i| json!({ "path": format!("library/{i}.md") }))
            .collect::<Vec<_>>()
    };
    let listed = describe(
        &v.kasten,
        "list_notes",
        &json!({}),
        &Ok(json!({ "total": 300, "notes": rows(50) })),
    );
    assert_eq!(listed.summary, "Listed 50 of 300 notes");
    let all = describe(
        &v.kasten,
        "list_notes",
        &json!({}),
        &Ok(json!({ "total": 1, "notes": rows(1) })),
    );
    assert_eq!(all.summary, "Listed 1 note");
    let read = describe(
        &v.kasten,
        "query_tag",
        &json!({ "tag": "paper" }),
        &Ok(json!({ "tag": "paper", "total": 250, "rows": rows(100) })),
    );
    assert_eq!(read.summary, "Read #paper: 100 of 250 notes");
}
