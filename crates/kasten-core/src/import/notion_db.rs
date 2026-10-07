//! A Notion database's columns as a tag's properties: each column's type
//! read from its values (checkbox, number, date, URL, relation, select,
//! multi-select or text), and each row's values as a note's `props`.

use serde_json::{Map, Number, Value, json};

use super::days::parse_day;
use super::markdown::percent_decode;

/// One column: its name in Notion, its key in Kasten, its type.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Column {
    pub name: String,
    pub key: String,
    pub kind: &'static str,
    pub options: Vec<String>,
}

/// A column name as a property key: `Due date` → `due_date`.
pub(crate) fn prop_key(name: &str) -> String {
    let mut key = String::new();
    for c in name.trim().chars().flat_map(char::to_lowercase) {
        if c.is_alphanumeric() {
            key.push(c);
        } else if !key.is_empty() && !key.ends_with('_') {
            key.push('_');
        }
    }
    let key = key.trim_end_matches('_').to_owned();
    if key.is_empty() {
        "property".to_owned()
    } else {
        key
    }
}

/// A date as Notion writes one (`September 20, 2026`, with a time or as a
/// range, or `2026-09-20`), as `YYYY-MM-DD`.
pub(crate) fn notion_date(text: &str) -> Option<String> {
    let start = text.split('→').next()?.trim();
    // Up to the year: a time after it is left out.
    let bytes = start.as_bytes();
    let end = (0..bytes.len().saturating_sub(3))
        .find(|&i| bytes[i..i + 4].iter().all(u8::is_ascii_digit))
        .map(|i| i + 4)?;
    let candidates = [start, &start[..end]];
    let formats = [
        "MMMM D, YYYY",
        "MMM D, YYYY",
        "D MMMM YYYY",
        "YYYY-MM-DD",
        "YYYY/MM/DD",
        "MM/DD/YYYY",
    ];
    candidates
        .iter()
        .flat_map(|c| formats.iter().map(move |f| parse_day(f, c)))
        .flatten()
        .next()
}

/// Notion's ids in a relation cell: `Title (Title%20<32 hex>.md), …`, or
/// in a `notion.so` address: runs of exactly 32 hex digits.
pub(crate) fn notion_ids(text: &str) -> Vec<String> {
    let text = percent_decode(text);
    let bytes = text.as_bytes();
    let mut ids = Vec::new();
    let mut run = 0;
    for (i, b) in bytes.iter().enumerate() {
        if b.is_ascii_hexdigit() {
            run += 1;
        } else {
            if run == 32 {
                ids.push(text[i - 32..i].to_lowercase());
            }
            run = 0;
        }
    }
    if run == 32 {
        ids.push(text[bytes.len() - 32..].to_lowercase());
    }
    ids
}

fn is_url(v: &str) -> bool {
    v.starts_with("http://") || v.starts_with("https://")
}

fn parts(v: &str) -> impl Iterator<Item = &str> {
    v.split(',').map(str::trim).filter(|p| !p.is_empty())
}

/// Columns named for one choice of a few, even when they hold numbers
/// (a priority of 1 to 3).
const SELECTS: [&str; 9] = [
    "status", "stage", "state", "type", "category", "priority", "kind", "phase", "level",
];
const MULTIS: [&str; 5] = ["tags", "labels", "topics", "categories", "keywords"];

/// The columns after the first, which is each row's title.
pub(crate) fn columns(headers: &[String], rows: &[Vec<String>]) -> Vec<Column> {
    headers
        .iter()
        .enumerate()
        .skip(1)
        .map(|(i, name)| {
            let values: Vec<&str> = rows
                .iter()
                .filter_map(|r| r.get(i))
                .map(|v| v.trim())
                .filter(|v| !v.is_empty())
                .collect();
            let key = prop_key(name);
            let (kind, options) = kind_of(&key, &values);
            Column {
                name: name.trim().to_owned(),
                key,
                kind,
                options,
            }
        })
        .collect()
}

fn first_seen<'a>(items: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for item in items {
        if !out.iter().any(|o| o == item) {
            out.push(item.to_owned());
        }
    }
    out
}

fn kind_of(key: &str, values: &[&str]) -> (&'static str, Vec<String>) {
    let all = |f: fn(&str) -> bool| !values.is_empty() && values.iter().all(|v| f(v));
    if all(|v| v.eq_ignore_ascii_case("yes") || v.eq_ignore_ascii_case("no")) {
        return ("checkbox", Vec::new());
    }
    if all(|v| v.parse::<f64>().is_ok_and(f64::is_finite)) && !SELECTS.contains(&key) {
        return ("number", Vec::new());
    }
    if all(|v| notion_date(v).is_some()) {
        return ("date", Vec::new());
    }
    if all(is_url) {
        return ("url", Vec::new());
    }
    if all(|v| !notion_ids(v).is_empty() && v.contains('(')) {
        return ("relation", Vec::new());
    }
    let short = values.iter().all(|v| v.chars().count() <= 60);
    let split: Vec<&str> = values.iter().flat_map(|v| parts(v)).collect();
    let repeats = |items: &[&str]| {
        let distinct = first_seen(items.iter().copied()).len();
        distinct < items.len()
    };
    if short && values.iter().any(|v| v.contains(',')) && (repeats(&split) || MULTIS.contains(&key))
    {
        return ("multi_select", first_seen(split.into_iter()));
    }
    let distinct = first_seen(values.iter().copied());
    if short
        && !values.is_empty()
        && distinct.len() <= 20
        && (repeats(values) || SELECTS.contains(&key) || MULTIS.contains(&key))
    {
        let kind = if MULTIS.contains(&key) {
            "multi_select"
        } else {
            "select"
        };
        return (kind, distinct);
    }
    ("text", Vec::new())
}

/// A row's values as `props`, relations as the ids `ids` gives Notion's.
pub(crate) fn props(
    columns: &[Column],
    row: &[String],
    ids: impl Fn(&str) -> Option<String>,
) -> Map<String, Value> {
    let mut out = Map::new();
    for (i, column) in columns.iter().enumerate() {
        let raw = row.get(i + 1).map_or("", |v| v.trim());
        if raw.is_empty() {
            continue;
        }
        let value = match column.kind {
            "checkbox" => json!(raw.eq_ignore_ascii_case("yes")),
            "number" => match raw.parse::<i64>() {
                Ok(n) => json!(n),
                Err(_) => raw
                    .parse::<f64>()
                    .ok()
                    .and_then(Number::from_f64)
                    .map_or(Value::Null, Value::Number),
            },
            "date" => notion_date(raw).map_or(Value::Null, Value::String),
            "relation" => Value::Array(
                notion_ids(raw)
                    .iter()
                    .filter_map(|id| ids(id))
                    .map(Value::String)
                    .collect(),
            ),
            "multi_select" => Value::Array(parts(raw).map(|p| json!(p)).collect()),
            _ => json!(raw),
        };
        if !value.is_null() {
            out.insert(column.key.clone(), value);
        }
    }
    out
}

/// The tag schema for a database: its columns, a table, a board by the
/// first select column and a calendar by the first date column.
pub(crate) fn schema(columns: &[Column]) -> Value {
    let properties: Vec<Value> = columns
        .iter()
        .map(|c| {
            let mut entry = Map::new();
            entry.insert("key".to_owned(), json!(c.key));
            entry.insert("type".to_owned(), json!(c.kind));
            if !c.options.is_empty() {
                entry.insert("options".to_owned(), json!(c.options));
            }
            Value::Object(entry)
        })
        .collect();
    let mut views = vec![json!({"name": "All", "type": "table"})];
    if let Some(select) = columns.iter().find(|c| c.kind == "select") {
        views.push(json!({"name": "Board", "type": "kanban", "group_by": select.key}));
    }
    if let Some(date) = columns.iter().find(|c| c.kind == "date") {
        views.push(json!({"name": "Calendar", "type": "calendar", "date": date.key}));
    }
    json!({"properties": properties, "views": views})
}

#[cfg(test)]
#[path = "notion_db_tests.rs"]
mod tests;
