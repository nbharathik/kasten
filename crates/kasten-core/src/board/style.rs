//! The house style every board is written in, stable and diff-friendly:
//! two-space indent, one node or edge per line, every other top-level key
//! on one line and a final newline. One-line JSON has a space after each
//! `:` and `,`, as in the fixture boards.

use std::io;

use serde::Serialize;
use serde_json::ser::{Formatter, Serializer};
use serde_json::{Map, Value};

/// Compact JSON with a space after each `:` and `,`.
struct Spaced;

impl Formatter for Spaced {
    fn begin_array_value<W: ?Sized + io::Write>(
        &mut self,
        writer: &mut W,
        first: bool,
    ) -> io::Result<()> {
        if first {
            Ok(())
        } else {
            writer.write_all(b", ")
        }
    }

    fn begin_object_key<W: ?Sized + io::Write>(
        &mut self,
        writer: &mut W,
        first: bool,
    ) -> io::Result<()> {
        if first {
            Ok(())
        } else {
            writer.write_all(b", ")
        }
    }

    fn begin_object_value<W: ?Sized + io::Write>(&mut self, writer: &mut W) -> io::Result<()> {
        writer.write_all(b": ")
    }
}

/// `value` as one line of JSON.
fn line<T: Serialize + ?Sized>(value: &T) -> String {
    let mut out = Vec::new();
    // Neither can fail: JSON keys are text, and the output goes to memory.
    let _ = value.serialize(&mut Serializer::with_formatter(&mut out, Spaced));
    String::from_utf8(out).unwrap_or_default()
}

/// A whole board document in house style.
pub(super) fn document(doc: &Map<String, Value>) -> String {
    document_with(doc, &["nodes", "edges"])
}

/// A JSON document in the boards' house style, with an item per line in
/// the top-level arrays named in `lists`, such as a sidecar's highlights.
pub(crate) fn document_with(doc: &Map<String, Value>, lists: &[&str]) -> String {
    let mut parts = Vec::with_capacity(doc.len());
    for (key, value) in doc {
        let mut part = format!("  {}: ", line(key));
        match value {
            Value::Array(items) if !items.is_empty() && lists.contains(&key.as_str()) => {
                let rows: Vec<String> = items
                    .iter()
                    .map(|item| format!("    {}", line(item)))
                    .collect();
                part.push_str(&format!("[\n{}\n  ]", rows.join(",\n")));
            }
            _ => part.push_str(&line(value)),
        }
        parts.push(part);
    }
    if parts.is_empty() {
        return "{}\n".to_owned();
    }
    format!("{{\n{}\n}}\n", parts.join(",\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn one_line_json_has_a_space_after_colons_and_commas() {
        assert_eq!(
            line(&json!({"a": [1, {"b": null}], "c": "x, y: \"z\"", "d": {}, "e": []})),
            r#"{"a": [1, {"b": null}], "c": "x, y: \"z\"", "d": {}, "e": []}"#
        );
    }

    #[test]
    fn nodes_and_edges_get_a_line_each() {
        let doc = json!({"nodes": [{"id": "a"}, {"id": "b"}], "edges": [], "x": {"k": 1}});
        let Value::Object(doc) = doc else {
            unreachable!()
        };
        assert_eq!(
            document(&doc),
            "{\n  \"nodes\": [\n    {\"id\": \"a\"},\n    {\"id\": \"b\"}\n  ],\n  \"edges\": [],\n  \"x\": {\"k\": 1}\n}\n"
        );
        assert_eq!(document(&Map::new()), "{}\n");
    }
}
