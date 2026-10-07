//! Kasten's own state for a board's nodes, kept under `x-kasten` where other
//! tools ignore it: which sections are folded
//! (`collapsed`, a list of ids) and how each card shows (`cardSize`, id to
//! `title` or `expanded`; unset is title and first lines). Also putting back
//! nodes and edges taken off, ids and all, for undo.

use std::collections::HashSet;

use serde_json::{Map, Value};

use super::drawing::{DASH, DRAW, LINE, SHAPE};
use super::edit::no_node;
use super::geometry::Rect;
use super::{Canvas, EXTRAS, field};
use crate::error::{Error, Result};

const COLLAPSED: &str = "collapsed";
const CARD_SIZE: &str = "cardSize";

impl Canvas {
    /// `x-kasten`, added at the end of the board when missing.
    pub(super) fn extras_mut(&mut self) -> Result<&mut Map<String, Value>> {
        self.doc
            .entry(EXTRAS)
            .or_insert_with(|| Value::Object(Map::new()))
            .as_object_mut()
            .ok_or_else(|| Error::Invalid(format!("`{EXTRAS}` on this board is not an object")))
    }

    /// The display size of the card `id`, if set.
    pub(super) fn card_size(&self, id: &str) -> Option<&str> {
        self.doc.get(EXTRAS)?.get(CARD_SIZE)?.get(id)?.as_str()
    }

    /// Whether the section `id` is folded.
    pub(super) fn is_collapsed(&self, id: &str) -> bool {
        self.doc
            .get(EXTRAS)
            .and_then(|extras| extras.get(COLLAPSED))
            .and_then(Value::as_array)
            .is_some_and(|ids| ids.iter().any(|v| v.as_str() == Some(id)))
    }

    pub(super) fn set_card_size(&mut self, id: &str, size: Option<&str>) -> Result<()> {
        let node = self.node(id).ok_or_else(|| no_node(id))?;
        if field(node, "type") != Some("file") {
            return Err(Error::Invalid("Only a card has a display size".to_owned()));
        }
        if let Some(size) = size
            && !matches!(size, "title" | "expanded")
        {
            return Err(Error::Invalid(format!(
                "A card shows its title or expanded, not “{size}”"
            )));
        }
        let sizes = self
            .extras_mut()?
            .entry(CARD_SIZE)
            .or_insert_with(|| Value::Object(Map::new()));
        let Value::Object(sizes) = sizes else {
            return Err(Error::Invalid(format!(
                "`{EXTRAS}.{CARD_SIZE}` is not an object"
            )));
        };
        match size {
            Some(size) => {
                sizes.insert(id.to_owned(), size.into());
            }
            None => {
                sizes.shift_remove(id);
            }
        }
        Ok(())
    }

    pub(super) fn set_collapsed(&mut self, id: &str, collapsed: bool) -> Result<()> {
        let node = self.node(id).ok_or_else(|| no_node(id))?;
        if field(node, "type") != Some("group") {
            return Err(Error::Invalid("Only a section folds".to_owned()));
        }
        let ids = self
            .extras_mut()?
            .entry(COLLAPSED)
            .or_insert_with(|| Value::Array(Vec::new()));
        let Value::Array(ids) = ids else {
            return Err(Error::Invalid(format!(
                "`{EXTRAS}.{COLLAPSED}` is not a list"
            )));
        };
        let there = ids.iter().any(|v| v.as_str() == Some(id));
        if collapsed && !there {
            ids.push(id.into());
        } else if !collapsed {
            ids.retain(|v| v.as_str() != Some(id));
        }
        Ok(())
    }

    /// Drops what `x-kasten` says about nodes that are gone.
    pub(super) fn forget(&mut self, gone: &HashSet<&str>) {
        let Some(Value::Object(extras)) = self.doc.get_mut(EXTRAS) else {
            return;
        };
        for key in [CARD_SIZE, SHAPE, DRAW, LINE] {
            if let Some(Value::Object(by_id)) = extras.get_mut(key) {
                by_id.retain(|id, _| !gone.contains(id.as_str()));
            }
        }
        for key in [COLLAPSED, DASH] {
            if let Some(Value::Array(ids)) = extras.get_mut(key) {
                ids.retain(|v| v.as_str().is_none_or(|id| !gone.contains(id)));
            }
        }
    }

    /// Puts back nodes and edges as they were, ids and all. Sections go to
    /// the back so they stay behind their cards; other nodes go on top.
    pub(super) fn restore(&mut self, nodes: &[Value], edges: &[Value]) -> Result<()> {
        let mut taken = self.taken();
        // What `x-kasten` said about each, put back once all are in place.
        let mut extras: Vec<(String, Value)> = Vec::new();
        let mut plain = |item: &Value| {
            let mut item = item.clone();
            if let Some(said) = item.as_object_mut().and_then(|o| o.shift_remove(EXTRAS))
                && let Some(id) = field(&item, "id")
            {
                extras.push((id.to_owned(), said));
            }
            item
        };
        // Sections go to the back in the order given, so their stacking holds.
        let mut back = 0;
        for node in nodes {
            let node = &plain(node);
            let id = field(node, "id").filter(|id| !id.is_empty());
            let (Some(id), Some(_), Some(_)) = (id, field(node, "type"), Rect::of(node)) else {
                return Err(Error::Invalid(format!("Not a board node: {node}")));
            };
            if !taken.insert(id.to_owned()) {
                return Err(Error::Invalid(format!(
                    "Node {id} is already on this board"
                )));
            }
            if field(node, "type") == Some("group") {
                self.list_mut("nodes").insert(back, node.clone());
                back += 1;
            } else {
                self.list_mut("nodes").push(node.clone());
            }
        }
        for edge in edges {
            let edge = &plain(edge);
            let Some(id) = field(edge, "id").filter(|id| !id.is_empty()) else {
                return Err(Error::Invalid(format!("Not a board edge: {edge}")));
            };
            for end in ["fromNode", "toNode"] {
                let node = field(edge, end).unwrap_or_default();
                if self.node(node).is_none() {
                    return Err(no_node(node));
                }
            }
            if !taken.insert(id.to_owned()) {
                return Err(Error::Invalid(format!(
                    "Edge {id} is already on this board"
                )));
            }
            self.list_mut("edges").push(edge.clone());
        }
        for (id, said) in &extras {
            self.restore_extras(id, said)?;
        }
        Ok(())
    }
}
