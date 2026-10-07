//! Things that get in each other's way: text that overlaps other text or a
//! shape, and edges that miss lining up by a few units.

use std::collections::BTreeMap;

use crate::model::Element;
use crate::resolve::Rect;

use super::super::geometry::{bottom, contains, right, shared, units};
use super::super::scene::{Kind, Leaf, Scene, is_blank, together};
use super::super::texts::{describe_leaf, describe_unit, parts, sentence};
use super::{Found, Sink, element_of};

/// Two boxes must share at least this much in both directions to count as
/// overlapping: edges that touch, or miss by a rounding, do not.
const SHARED_MIN: f64 = 2.0;

/// How far one box may reach out of another and still be inside it.
const INSIDE: f64 = 1.0;

/// Edges this far apart, at least, are not the same edge...
const NEAR_MIN: f64 = 1.0;
/// ... and up to this far they are a slip; further apart, a choice.
const NEAR_MAX: f64 = 6.0;

fn has_text(scene: &Scene, leaf: &Leaf) -> bool {
    matches!(
        leaf.el,
        Element::Text(_) | Element::Shape(_) | Element::Table(_)
    ) && parts(scene, leaf).iter().any(|p| !is_blank(p.text))
}

fn is_shape(leaf: &Leaf) -> bool {
    matches!(leaf.el, Element::Shape(_))
}

/// What a leaf is called for the purpose of telling two apart.
fn key_of<'a>(leaf: &Leaf<'a>) -> &'a str {
    leaf.owner.map_or_else(|| leaf.el.id(), |o| o.id)
}

pub fn overlap(scene: &Scene, sink: &mut Sink) {
    let candidates: Vec<(usize, bool, Rect)> = scene
        .leaves
        .iter()
        .enumerate()
        .filter(|(_, l)| !l.undrawn)
        .filter_map(|(i, l)| {
            let text = has_text(scene, l);
            (text || is_shape(l)).then_some(())?;
            l.bounds.map(|b| (i, text, b))
        })
        .collect();
    for (at, &(i, text_i, box_i)) in candidates.iter().enumerate() {
        for &(j, text_j, box_j) in &candidates[at + 1..] {
            if !text_i && !text_j {
                continue;
            }
            let (a, b) = (&scene.leaves[i], &scene.leaves[j]);
            let same_composite = a
                .owner
                .is_some_and(|x| b.owner.is_some_and(|y| x.id == y.id));
            let same_group = a.groups.iter().any(|g| b.groups.contains(g));
            if same_composite || same_group || !together(a.visible, b.visible) {
                continue;
            }
            let (w, h) = shared(box_i, box_j);
            if w < SHARED_MIN || h < SHARED_MIN {
                continue;
            }
            if contains(box_i, box_j, INSIDE) || contains(box_j, box_i, INSIDE) {
                continue;
            }
            let (first, other) = if text_i { (a, b) } else { (b, a) };
            sink.add(Found {
                rule: "overlap",
                order: first.z + 1,
                key: &format!("{}|{}", key_of(first), key_of(other)),
                rank: -(w * h),
                element: Some(element_of(scene, first.unit)),
                message: format!(
                    "{} overlaps {}.",
                    sentence(&describe_leaf(first)),
                    describe_leaf(other)
                ),
                hint: "Move one of them, or make one smaller, so they do not cover each other. Text that sits on a card belongs inside the card's box.",
            });
        }
    }
}

/// The four edges of a unit that alignment is judged by.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Edge {
    Left,
    Right,
    Top,
    Bottom,
}

impl Edge {
    fn name(self) -> &'static str {
        match self {
            Edge::Left => "left",
            Edge::Right => "right",
            Edge::Top => "top",
            Edge::Bottom => "bottom",
        }
    }

    fn at(self, b: Rect) -> f64 {
        match self {
            Edge::Left => b.x,
            Edge::Right => right(b),
            Edge::Top => b.y,
            Edge::Bottom => bottom(b),
        }
    }

    /// How to put the edge at `value`, in terms of the box the element has.
    fn fix(self, b: Rect, value: f64) -> String {
        match self {
            Edge::Left => format!("Set x to {} (transform_elements).", units(value)),
            Edge::Right => format!(
                "Set x to {} so its right edge is at {} (transform_elements).",
                units(value - b.w),
                units(value)
            ),
            Edge::Top => format!("Set y to {} (transform_elements).", units(value)),
            Edge::Bottom => format!(
                "Set y to {} so its bottom edge is at {} (transform_elements).",
                units(value - b.h),
                units(value)
            ),
        }
    }
}

/// The value that most edges have exactly; of equal counts, the one an earlier element has.
fn anchor(members: &[(f64, usize)]) -> f64 {
    let mut counts: BTreeMap<i64, (usize, usize, f64)> = BTreeMap::new();
    for &(value, unit) in members {
        let entry = counts
            .entry((value * 100.0).round() as i64)
            .or_insert((0, unit, value));
        entry.0 += 1;
        entry.1 = entry.1.min(unit);
    }
    counts
        .values()
        .max_by(|a, b| a.0.cmp(&b.0).then(b.1.cmp(&a.1)))
        .map_or(0.0, |best| best.2)
}

pub fn near_miss(scene: &Scene, sink: &mut Sink) {
    let eligible: Vec<usize> = (0..scene.units.len())
        .filter(|&n| {
            let u = &scene.units[n];
            !u.undrawn && !u.turned && u.bounds.is_some() && u.kind != Kind::Line
        })
        .collect();
    for edge in [Edge::Left, Edge::Right, Edge::Top, Edge::Bottom] {
        let mut edges: Vec<(f64, usize)> = eligible
            .iter()
            .filter_map(|&n| scene.units[n].bounds.map(|b| (edge.at(b), n)))
            .collect();
        edges.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
        let mut start = 0;
        while start < edges.len() {
            let mut end = start + 1;
            while end < edges.len() && edges[end].0 - edges[end - 1].0 <= NEAR_MAX {
                end += 1;
            }
            let cluster = &edges[start..end];
            start = end;
            if cluster.len() < 2 {
                continue;
            }
            let value = anchor(cluster);
            for &(at, n) in cluster {
                let gap = (at - value).abs();
                if !(NEAR_MIN - 1e-9..=NEAR_MAX + 1e-9).contains(&gap) {
                    continue;
                }
                // Compared with an element that stands on the anchor and that it could
                // be lined up with: it shows with it and does not hold it or sit in it.
                let (unit, b) = (&scene.units[n], scene.units[n].bounds);
                let Some(b) = b else { continue };
                let partner = cluster.iter().find(|&&(v, m)| {
                    m != n
                        && (v - value).abs() < NEAR_MIN
                        && scene.units[m].bounds.is_some_and(|c| {
                            together(unit.visible, scene.units[m].visible)
                                && !contains(c, b, INSIDE)
                                && !contains(b, c, INSIDE)
                        })
                });
                let Some(&(_, other)) = partner else { continue };
                sink.add(Found {
                    rule: "near-miss-align",
                    order: n + 1,
                    key: &format!("{}|{}", unit.id, edge.name()),
                    rank: gap,
                    element: Some(unit.id),
                    message: format!(
                        "The {} edge of {} is {} units from that of {}; they should probably line up.",
                        edge.name(),
                        describe_unit(unit),
                        units(gap),
                        describe_unit(&scene.units[other])
                    ),
                    hint: &edge.fix(b, value),
                });
            }
        }
    }
}
