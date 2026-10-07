//! Obsidian's canvases are JSON Canvas, as Kasten's boards are: each keeps
//! its nodes and edges, with file cards pointing where their files went,
//! links in stickies rewritten, and the canvas's name as the board's title.

use std::collections::HashMap;

use serde_json::{Map, Value};

use super::plan::{Warn, Warnings};
use super::resolve::{Resolver, rewrite_body};
use crate::board::{Canvas, EXTRAS};

/// The board for a canvas's `text`, to be kept at `path`; None when the
/// text is not JSON Canvas. `moved` maps paths in the source (lowercase)
/// to vault paths.
pub(crate) fn board(
    text: &str,
    path: &str,
    title: &str,
    moved: &HashMap<String, String>,
    resolver: &Resolver,
    warnings: &mut Warnings,
) -> Option<String> {
    let mut value: Value = serde_json::from_str(text).ok()?;
    let doc = value.as_object_mut()?;
    if let Some(Value::Array(nodes)) = doc.get_mut("nodes") {
        for node in nodes.iter_mut().filter_map(Value::as_object_mut) {
            match node.get("type").and_then(Value::as_str) {
                Some("file") => {
                    let Some(file) = node.get("file").and_then(Value::as_str) else {
                        continue;
                    };
                    match moved.get(&file.to_lowercase()) {
                        Some(new) => {
                            node.insert("file".to_owned(), new.clone().into());
                        }
                        None => warnings.add(Warn::MissingBoardFile, file),
                    }
                }
                Some("text") => {
                    if let Some(Value::String(sticky)) = node.get_mut("text") {
                        *sticky = rewrite_body(sticky, path, "", resolver);
                    }
                }
                _ => {}
            }
        }
    }
    let extras = doc
        .entry(EXTRAS.to_owned())
        .or_insert_with(|| Value::Object(Map::new()));
    if !extras.is_object() {
        *extras = Value::Object(Map::new());
    }
    if let Some(extras) = extras.as_object_mut() {
        extras.insert("title".to_owned(), title.into());
    }
    Canvas::from_value(value)
        .ok()
        .map(|canvas| canvas.to_text())
}
