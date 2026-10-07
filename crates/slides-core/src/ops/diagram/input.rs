//! Checking what a diagram is asked to draw, and where.

use std::collections::{HashMap, HashSet};

use super::layers::{Layering, Slot};
use super::{AddDiagram, DiagramBox};
use crate::error::{Error, Result};
use crate::model::{Slide, Theme, is_color};
use crate::ops::Op;
use crate::resolve::{Rect, box_in};

/// The most boxes and arrows one diagram has.
const MOST_NODES: usize = 60;
const MOST_EDGES: usize = 200;
/// Room kept round a diagram that has no box of its own, and under the title.
const SIDE: f64 = 64.0;
const BELOW_TITLE: f64 = 16.0;
const FOOT: f64 = 48.0;
/// The smallest a box may be given.
const LEAST_BOX: f64 = 60.0;

/// Every box in a line of its own.
pub(super) fn in_a_line(count: usize) -> Layering {
    Layering {
        layer: (0..count).collect(),
        layers: (0..count).map(|i| vec![Slot::Node(i)]).collect(),
        back: Vec::new(),
    }
}

/// Checks the diagram makes sense; returns where each box is in the list, by its id.
pub(super) fn check(input: &AddDiagram) -> Result<HashMap<String, usize>> {
    let bad = |m: String| Error::bad_input(AddDiagram::NAME, m);
    if input.nodes.is_empty() {
        return Err(bad("a diagram needs at least one box in `nodes`".to_owned()));
    }
    if input.nodes.len() > MOST_NODES || input.edges.len() > MOST_EDGES {
        return Err(bad(format!(
            "a diagram has at most {MOST_NODES} boxes and {MOST_EDGES} arrows; split a bigger one over several slides"
        )));
    }
    let mut index = HashMap::new();
    for (i, node) in input.nodes.iter().enumerate() {
        if node.id.trim().is_empty() {
            return Err(bad(
                "every box needs an `id`, a short name the edges use".to_owned()
            ));
        }
        if index.insert(node.id.clone(), i).is_some() {
            return Err(bad(format!(
                "the box id `{}` is used twice; ids are unique",
                node.id
            )));
        }
        if node.label.trim().is_empty() {
            return Err(bad(format!("the box `{}` has no label", node.id)));
        }
        if node.shape.as_deref().is_some_and(|s| s.trim().is_empty()) {
            return Err(bad(format!(
                "the box `{}` names a shape that is empty; leave `shape` out for a rounded box",
                node.id
            )));
        }
        if let Some(color) = node.color.as_deref().filter(|c| !is_color(c)) {
            return Err(bad(format!(
                "`{color}` is not a theme colour (accent1, bg2 ...) or a #rrggbb value"
            )));
        }
    }
    let known: HashSet<&str> = input.nodes.iter().map(|n| n.id.as_str()).collect();
    for edge in &input.edges {
        for end in [&edge.from, &edge.to] {
            if !known.contains(end.as_str()) {
                let names: Vec<&str> = input.nodes.iter().map(|n| n.id.as_str()).collect();
                return Err(bad(format!(
                    "an edge names the box `{end}`, which is not in `nodes`; the boxes are: {}",
                    names.join(", ")
                )));
            }
        }
        if edge.from == edge.to {
            return Err(bad(format!(
                "an edge leads from `{}` to itself; an arrow joins two different boxes",
                edge.from
            )));
        }
    }
    Ok(index)
}

/// A box the person gave, checked.
pub(super) fn explicit(b: &DiagramBox, width: f64, height: f64) -> Result<Rect> {
    let ok = [b.x, b.y, b.w, b.h].iter().all(|v| v.is_finite());
    if !ok
        || b.w < LEAST_BOX
        || b.h < LEAST_BOX
        || b.x < 0.0
        || b.y < 0.0
        || b.x + b.w > width + 1e-6
        || b.y + b.h > height + 1e-6
    {
        return Err(Error::bad_input(
            AddDiagram::NAME,
            format!(
                "the box must be at least {LEAST_BOX} units each way and inside the slide ({width} by {height}), not x {} y {} w {} h {}",
                b.x, b.y, b.w, b.h
            ),
        ));
    }
    Ok(Rect {
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
    })
}

/// The free area: inside the margins, and under the title if the slide has one.
pub(super) fn free_area(theme: &Theme, slide: &Slide, width: f64, height: f64) -> Result<Rect> {
    let title = slide
        .elements
        .iter()
        .find(|e| e.base().placeholder.as_deref() == Some("title"))
        .and_then(|e| box_in(theme, &slide.layout, e));
    let top = title.map_or(FOOT, |t| t.y + t.h + BELOW_TITLE);
    let area = Rect {
        x: SIDE,
        y: top,
        w: width - 2.0 * SIDE,
        h: height - FOOT - top,
    };
    if area.h < 2.0 * LEAST_BOX || area.w < 2.0 * LEAST_BOX {
        return Err(Error::bad_input(
            AddDiagram::NAME,
            "there is no room left on the slide for a diagram; give it a `box`",
        ));
    }
    Ok(area)
}
