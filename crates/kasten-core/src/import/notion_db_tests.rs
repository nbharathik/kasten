use super::*;

fn cells(rows: &[&[&str]]) -> Vec<Vec<String>> {
    rows.iter()
        .map(|r| r.iter().map(|c| c.to_string()).collect())
        .collect()
}

#[test]
fn names_properties_as_keys() {
    assert_eq!(prop_key("Due date"), "due_date");
    assert_eq!(prop_key(" Last edited time "), "last_edited_time");
    assert_eq!(prop_key("Größe (cm)"), "größe_cm");
    assert_eq!(prop_key("???"), "property");
}

#[test]
fn reads_notion_dates() {
    assert_eq!(
        notion_date("September 20, 2026").as_deref(),
        Some("2026-09-20")
    );
    assert_eq!(
        notion_date("August 2, 2026 10:30 AM").as_deref(),
        Some("2026-08-02")
    );
    assert_eq!(
        notion_date("Sep 3, 2026 → Sep 9, 2026").as_deref(),
        Some("2026-09-03")
    );
    assert_eq!(notion_date("2026-09-20").as_deref(), Some("2026-09-20"));
    assert_eq!(notion_date("Größe 2026"), None);
    assert_eq!(notion_date("Reading"), None);
}

#[test]
fn finds_notion_ids_where_they_are_written() {
    let id = "6f7a8b9c0d1e42f3a4b5c6d7e8f9a0b1";
    assert_eq!(
        notion_ids(&format!(
            "Thinking, Fast and Slow (Thinking,%20Fast%20and%20Slow%20{id}.md)"
        )),
        [id]
    );
    assert_eq!(
        notion_ids(&format!("https://www.notion.so/Trip-abroad-{id}?pvs=21")),
        [id]
    );
    assert!(notion_ids("deadbeef").is_empty());
}

#[test]
fn reads_column_types_from_values() {
    let headers: Vec<String> = [
        "Name", "Done", "Rating", "When", "Link", "Priority", "Tags", "Who", "Stage",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    let rows = cells(&[
        &[
            "A",
            "Yes",
            "4.5",
            "May 1, 2026",
            "https://a.example",
            "1",
            "x, y",
            "Ann",
            "Idea",
        ],
        &["B", "No", "3", "", "", "2", "y", "Bob", "Idea"],
    ]);
    let found = columns(&headers, &rows);
    let kinds: Vec<(&str, &str)> = found.iter().map(|c| (c.key.as_str(), c.kind)).collect();
    assert_eq!(
        kinds,
        [
            ("done", "checkbox"),
            ("rating", "number"),
            ("when", "date"),
            ("link", "url"),
            ("priority", "select"),
            ("tags", "multi_select"),
            ("who", "text"),
            ("stage", "select"),
        ]
    );
    let values = props(&columns(&headers, &rows), &rows[0], |_| None);
    assert_eq!(
        Value::Object(values),
        json!({"done": true, "rating": 4.5, "when": "2026-05-01", "link": "https://a.example", "priority": "1", "tags": ["x", "y"], "who": "Ann", "stage": "Idea"})
    );
}
