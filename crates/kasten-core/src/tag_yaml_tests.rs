use serde_json::json;

use super::*;
use crate::tags::parse_schema;

const TASK: &str = "# Tasks for every project\nname: task\ncolor: green\nproperties:\n  - {key: status, type: select, options: [Todo, Doing, Done]}  # the board's columns\n  - {key: due, type: date}\n\nviews:\n  - {name: Board, type: kanban, group_by: status}\n  - {name: All, type: table}\n\n# kept below the views\nicon: ✅\n";

#[test]
fn replaces_only_the_list_and_keeps_every_other_byte() {
    let views = [
        json!({"name": "Board", "type": "kanban", "group_by": "status", "sort": [{"key": "due", "dir": "asc"}]}),
    ];
    let out = set_list(TASK, "views", &views);
    assert_eq!(
        out,
        "# Tasks for every project\nname: task\ncolor: green\nproperties:\n  - {key: status, type: select, options: [Todo, Doing, Done]}  # the board's columns\n  - {key: due, type: date}\n\nviews:\n  - {name: Board, type: kanban, group_by: status, sort: [{key: due, dir: asc}]}\n\n# kept below the views\nicon: ✅\n"
    );
    let schema = parse_schema("tags/task.yaml", &out).unwrap();
    assert_eq!(schema.views, views);
    assert_eq!(schema.properties.len(), 2);
}

#[test]
fn replaces_properties_the_same_way() {
    let props = [json!({"key": "status", "type": "select", "options": ["Todo", "Done"]})];
    let out = set_list(TASK, "properties", &props);
    assert!(out.starts_with("# Tasks for every project\nname: task\ncolor: green\nproperties:\n  - {key: status, type: select, options: [Todo, Done]}\n\nviews:\n"));
    assert!(out.ends_with("# kept below the views\nicon: ✅\n"));
}

#[test]
fn writes_an_empty_list_on_one_line() {
    let out = set_list(TASK, "views", &[]);
    assert!(out.contains("\nviews: []\n\n# kept below the views\n"));
    assert!(
        parse_schema("tags/task.yaml", &out)
            .unwrap()
            .views
            .is_empty()
    );
}

#[test]
fn adds_a_missing_list_at_the_end() {
    let views = [json!({"name": "All", "type": "table"})];
    assert_eq!(
        set_list("name: idea\n", "views", &views),
        "name: idea\nviews:\n  - {name: All, type: table}\n"
    );
    assert_eq!(
        set_list("name: idea", "views", &views),
        "name: idea\nviews:\n  - {name: All, type: table}\n"
    );
    assert_eq!(
        set_list("", "views", &views),
        "views:\n  - {name: All, type: table}\n"
    );
}

#[test]
fn replaces_lists_written_flat_or_unindented() {
    let views = [json!({"name": "List", "type": "list"})];
    let flow = "name: a\nviews: [{name: X, type: table}]\ncolor: red\n";
    assert_eq!(
        set_list(flow, "views", &views),
        "name: a\nviews:\n  - {name: List, type: list}\ncolor: red\n"
    );
    let flat = "name: a\nviews:\n- name: X\n  type: table\n- {name: Y, type: kanban}\ncolor: red\n";
    assert_eq!(
        set_list(flat, "views", &views),
        "name: a\nviews:\n  - {name: List, type: list}\ncolor: red\n"
    );
}

#[test]
fn keeps_windows_line_endings() {
    let crlf = "name: a\r\nviews:\r\n  - {name: X, type: table}\r\ncolor: red\r\n";
    let views = [json!({"name": "List", "type": "list"})];
    assert_eq!(
        set_list(crlf, "views", &views),
        "name: a\r\nviews:\r\n  - {name: List, type: list}\r\ncolor: red\r\n"
    );
}

#[test]
fn leaves_a_nested_key_of_the_same_name_alone() {
    let yaml = "name: a\nproperties:\n  - key: views\n    type: number\nviews:\n  - {name: X, type: table}\n";
    let out = set_list(yaml, "views", &[]);
    assert_eq!(
        out,
        "name: a\nproperties:\n  - key: views\n    type: number\nviews: []\n"
    );
}

#[test]
fn keeps_a_byte_order_mark_on_the_list_it_replaces() {
    let yaml = "\u{feff}views:\n  - {name: Old, type: table}\ncolor: red\n";
    let out = set_list(yaml, "views", &[json!({"name": "Board", "type": "kanban"})]);
    assert_eq!(
        out,
        "\u{feff}views:\n  - {name: Board, type: kanban}\ncolor: red\n"
    );
}
