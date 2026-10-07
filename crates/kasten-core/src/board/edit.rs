//! Changes to a board in memory: cards for notes, stickies, connections and
//! sections, for the MCP tools `add_to_board`, `connect` and
//! `group_on_board`. Nothing here reads or writes files; the caller saves
//! the board when it is done.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::files::plain;
use super::geometry::{self, CARD, Point, Rect, STICKY};
use super::{Canvas, field};
use crate::error::{Error, Result};
use crate::id::ulid_at;
use crate::note::content_hash;
use crate::time::Instant;

/// A file to show on a board, usually a note. Its first tag names its
/// section under `Layout::ClusterByTag`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileItem {
    /// Vault-relative path.
    pub path: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Where `Canvas::add_files` puts new cards.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Layout {
    /// Rows of four, 80 px below everything on the board, from its left edge.
    Grid,
    /// A section per first tag, labelled with it, side by side below
    /// everything; notes without tags go in "Untagged", last.
    ClusterByTag,
    /// Each item's top-left corner, one per item.
    Positions(Vec<(i64, i64)>),
}

/// What `Canvas::add_files` did.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Added {
    /// One node id per item, in order: its new card, or the node that
    /// already showed that file, which stays where it is.
    pub nodes: Vec<String>,
    /// The cards made by this call.
    pub created: Vec<String>,
    /// The sections made by `Layout::ClusterByTag`.
    pub groups: Vec<String>,
}

/// The section for notes without tags.
const UNTAGGED: &str = "Untagged";

pub(super) fn no_node(id: &str) -> Error {
    Error::Invalid(format!("No node {id} on this board"))
}

/// The first id from `next` that is not taken; from then on it is.
fn unused(taken: &mut HashSet<String>, mut next: impl FnMut() -> String) -> String {
    loop {
        let id = next();
        if taken.insert(id.clone()) {
            return id;
        }
    }
}

/// A new node or edge id: 16 lowercase hex digits from a fresh ULID, so
/// ids stay unique within one millisecond, retried if the board has it.
pub(super) fn new_id(taken: &mut HashSet<String>, now: Instant) -> String {
    unused(taken, || content_hash(&ulid_at(now.millis)))
}

/// A node object, its keys in the order JSON Canvas lists them.
pub(super) fn new_node(id: &str, kind: &str, content: Option<(&str, &str)>, rect: Rect) -> Value {
    let mut node = Map::new();
    node.insert("id".to_owned(), id.into());
    node.insert("type".to_owned(), kind.into());
    if let Some((key, value)) = content {
        node.insert(key.to_owned(), value.into());
    }
    for (key, value) in [
        ("x", rect.x),
        ("y", rect.y),
        ("width", rect.width),
        ("height", rect.height),
    ] {
        node.insert(key.to_owned(), value.into());
    }
    Value::Object(node)
}

fn card(id: &str, path: &str, corner: Point) -> Value {
    new_node(id, "file", Some(("file", path)), Rect::at(corner, CARD))
}

pub(super) fn section(id: &str, label: &str, rect: Rect) -> Value {
    let label = (!label.is_empty()).then_some(("label", label));
    new_node(id, "group", label, rect)
}

impl Canvas {
    /// Where `count` new cards go so that a section around them sits below
    /// everything on the board (see `geometry::grid_in_section_below`).
    pub fn grid_in_section_below(&self, count: usize) -> Vec<Point> {
        geometry::grid_in_section_below(self.nodes(), count)
    }

    /// Every node and edge id on the board.
    pub(super) fn taken(&self) -> HashSet<String> {
        self.nodes()
            .iter()
            .chain(self.edges())
            .filter_map(|item| field(item, "id"))
            .map(str::to_owned)
            .collect()
    }

    /// Puts a 320×180 card on the board for each item, placed by `layout`.
    /// A file already on the board (or listed twice) gets no second card;
    /// its node id stands in its place in `Added::nodes`. New cards go on
    /// top in z-order, each section just before its cards. A path that is
    /// not a plain vault path, or a `Positions` list of the wrong length,
    /// is refused and nothing changes.
    pub fn add_files(&mut self, items: &[FileItem], layout: Layout, now: Instant) -> Result<Added> {
        if let Layout::Positions(corners) = &layout
            && corners.len() != items.len()
        {
            return Err(Error::Invalid(format!(
                "Give one position per note: {} notes, {} positions",
                items.len(),
                corners.len()
            )));
        }
        if let Some(bad) = items.iter().find(|item| !plain(&item.path)) {
            return Err(Error::Invalid(format!(
                "Not a file in this vault: {}",
                bad.path
            )));
        }
        let mut shown: HashMap<String, String> = HashMap::new();
        for node in self.nodes() {
            if let (Some("file"), Some(file), Some(id)) =
                (field(node, "type"), field(node, "file"), field(node, "id"))
            {
                shown
                    .entry(file.to_owned())
                    .or_insert_with(|| id.to_owned());
            }
        }
        let mut taken = self.taken();
        let mut added = Added::default();
        // Items that get a card: their index in `items`, and the new id.
        let mut fresh: Vec<(usize, String)> = Vec::new();
        for (i, item) in items.iter().enumerate() {
            let id = match shown.get(&item.path) {
                Some(id) => id.clone(),
                None => {
                    let id = new_id(&mut taken, now);
                    shown.insert(item.path.clone(), id.clone());
                    added.created.push(id.clone());
                    fresh.push((i, id.clone()));
                    id
                }
            };
            added.nodes.push(id);
        }

        let origin = geometry::below(self.nodes());
        let mut nodes = Vec::with_capacity(fresh.len());
        match layout {
            Layout::Grid => {
                let corners = geometry::grid(origin, fresh.len(), CARD);
                for ((i, id), corner) in fresh.iter().zip(corners) {
                    nodes.push(card(id, &items[*i].path, corner));
                }
            }
            Layout::Positions(corners) => {
                for (i, id) in &fresh {
                    nodes.push(card(id, &items[*i].path, corners[*i]));
                }
            }
            Layout::ClusterByTag => {
                // Each column: its label, and indexes into `fresh`.
                let mut columns: Vec<(&str, Vec<usize>)> = Vec::new();
                for (k, (i, _)) in fresh.iter().enumerate() {
                    let tag = items[*i]
                        .tags
                        .first()
                        .map(|tag| tag.trim())
                        .filter(|tag| !tag.is_empty())
                        .unwrap_or(UNTAGGED);
                    match columns.iter_mut().find(|(label, _)| *label == tag) {
                        Some((_, members)) => members.push(k),
                        None => columns.push((tag, vec![k])),
                    }
                }
                // A stable sort: tags keep their first-seen order.
                columns.sort_by_key(|(label, _)| *label == UNTAGGED);
                let counts: Vec<usize> = columns.iter().map(|(_, members)| members.len()).collect();
                let places = geometry::columns(origin, &counts);
                for ((label, members), (rect, corners)) in columns.iter().zip(places) {
                    let group = new_id(&mut taken, now);
                    nodes.push(section(&group, label, rect));
                    added.groups.push(group);
                    for (&k, corner) in members.iter().zip(corners) {
                        let (i, id) = &fresh[k];
                        nodes.push(card(id, &items[*i].path, corner));
                    }
                }
            }
        }
        self.list_mut("nodes").extend(nodes);
        Ok(added)
    }

    /// Adds a 260×120 sticky holding `text`, its top-left corner at `at`
    /// or, with None, 80 px below everything on the board. Returns its id.
    pub fn add_text(&mut self, text: &str, at: Option<(i64, i64)>, now: Instant) -> String {
        let corner = at.unwrap_or_else(|| geometry::below(self.nodes()));
        let id = new_id(&mut self.taken(), now);
        let sticky = new_node(&id, "text", Some(("text", text)), Rect::at(corner, STICKY));
        self.list_mut("nodes").push(sticky);
        id
    }

    /// Connects two nodes, named by id, from the side of `from` that faces
    /// `to` (right to left when `to` is further right, bottom to top when it
    /// is further down, and so on). An edge already joining the two, either
    /// way round, with the same label or none, is reused. Returns the id.
    pub fn connect(
        &mut self,
        from: &str,
        to: &str,
        label: Option<&str>,
        now: Instant,
    ) -> Result<String> {
        self.connect_sides(from, to, label, (None, None), now)
    }

    /// `connect`, from and to the sides given, where given: the handles a
    /// person dragged between.
    pub(super) fn connect_sides(
        &mut self,
        from: &str,
        to: &str,
        label: Option<&str>,
        sides: (Option<&str>, Option<&str>),
        now: Instant,
    ) -> Result<String> {
        let start = self.node(from).ok_or_else(|| no_node(from))?;
        let end = self.node(to).ok_or_else(|| no_node(to))?;
        if from == to {
            return Err(Error::Invalid(
                "A connection needs two different nodes".to_owned(),
            ));
        }
        let (facing_from, facing_to) = geometry::sides(
            Rect::of(start).unwrap_or_default(),
            Rect::of(end).unwrap_or_default(),
        );
        let from_side = sides.0.unwrap_or(facing_from);
        let to_side = sides.1.unwrap_or(facing_to);
        let label = label.map(str::trim).filter(|label| !label.is_empty());
        let joins = |edge: &Value| {
            let ends = (field(edge, "fromNode"), field(edge, "toNode"));
            (ends == (Some(from), Some(to)) || ends == (Some(to), Some(from)))
                && field(edge, "label")
                    .map(str::trim)
                    .filter(|label| !label.is_empty())
                    == label
        };
        if let Some(id) = self
            .edges()
            .iter()
            .filter(|&edge| joins(edge))
            .find_map(|edge| field(edge, "id"))
        {
            return Ok(id.to_owned());
        }
        let id = new_id(&mut self.taken(), now);
        let mut edge = Map::new();
        for (key, value) in [
            ("id", id.as_str()),
            ("fromNode", from),
            ("fromSide", from_side),
            ("toNode", to),
            ("toSide", to_side),
        ] {
            edge.insert(key.to_owned(), value.into());
        }
        if let Some(label) = label {
            edge.insert("label".to_owned(), label.into());
        }
        self.list_mut("edges").push(Value::Object(edge));
        Ok(id)
    }

    /// Wraps nodes, named by id, in a section labelled `label`: their
    /// bounding box with 40 px around it and 40 px more on top for the
    /// label. The section goes just before the lowest of them in z-order,
    /// so it stays behind them. Returns its id.
    pub fn group<S: AsRef<str>>(
        &mut self,
        node_ids: &[S],
        label: &str,
        now: Instant,
    ) -> Result<String> {
        let mut first = usize::MAX;
        let mut bounds: Option<Rect> = None;
        for id in node_ids {
            let id = id.as_ref();
            let index = self
                .nodes()
                .iter()
                .position(|node| field(node, "id") == Some(id))
                .ok_or_else(|| no_node(id))?;
            first = first.min(index);
            let rect = Rect::of(&self.nodes()[index]).unwrap_or_default();
            bounds = Some(bounds.map_or(rect, |all| all.union(rect)));
        }
        let Some(bounds) = bounds else {
            return Err(Error::Invalid(
                "A section needs at least one node".to_owned(),
            ));
        };
        let id = new_id(&mut self.taken(), now);
        let node = section(&id, label.trim(), bounds.section());
        self.list_mut("nodes").insert(first, node);
        Ok(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_ids_skip_ones_taken() {
        let mut taken: HashSet<String> = ["a", "b"].map(String::from).into();
        let mut offers = ["a", "b", "a", "c"].into_iter().map(String::from);
        assert_eq!(unused(&mut taken, || offers.next().unwrap()), "c");
        assert!(taken.contains("c"));
    }
}
