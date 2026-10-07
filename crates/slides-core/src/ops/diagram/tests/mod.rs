//! Tests of `add_diagram`: boxes and arrows in a layered layout, that they
//! do not overlap, that every arrow is attached, that everything fits.

mod behaviour;
mod layout;

use serde_json::{Value, json};

use crate::model::{ConnectorEl, Element, Side};
use crate::ops::Engine;
use crate::resolve::Rect;

/// A deck with one slide of `layout`, titled.
pub(super) fn slide_of(layout: &str) -> (Engine, String) {
    let mut e = Engine::create("Diagrams", "Light", 3).unwrap();
    let first = e.deck().slides[0].clone();
    let subtitle = first
        .elements
        .iter()
        .find(|x| x.base().placeholder.as_deref() == Some("subtitle"))
        .unwrap()
        .id()
        .to_owned();
    e.apply(
        "set_text",
        json!({ "slide": first.id, "id": subtitle, "markdown": "A subtitle" }),
    )
    .unwrap();
    let content = if layout == "blank" {
        json!({})
    } else {
        json!({ "title": "The loop" })
    };
    let out = e
        .apply("add_slide", json!({ "layout": layout, "content": content }))
        .unwrap();
    let slide = out.output["slide"].as_str().unwrap().to_owned();
    (e, slide)
}

pub(super) fn nodes(labels: &[&str]) -> Value {
    Value::Array(
        labels
            .iter()
            .map(|l| json!({ "id": l.to_lowercase().replace(' ', "-"), "label": l }))
            .collect(),
    )
}

pub(super) fn edges(pairs: &[(&str, &str)]) -> Value {
    Value::Array(
        pairs
            .iter()
            .map(|(a, b)| json!({ "from": a, "to": b }))
            .collect(),
    )
}

pub(super) fn draw(
    e: &mut Engine,
    slide: &str,
    nodes: Value,
    edges: Value,
    extra: Value,
) -> crate::Result<crate::Applied> {
    let mut input = json!({ "slide": slide, "nodes": nodes, "edges": edges });
    if let Value::Object(more) = extra {
        for (k, v) in more {
            input[k] = v;
        }
    }
    e.apply("add_diagram", input)
}

/// The boxes of a slide (its shapes), by name.
pub(super) fn boxes(e: &Engine, slide: &str) -> Vec<(String, String, Rect)> {
    e.deck()
        .slide(slide)
        .unwrap()
        .elements
        .iter()
        .filter_map(|el| match el {
            Element::Shape(s) => {
                let (x, y, w, h) = s.base.rect()?;
                Some((
                    s.base.id.clone(),
                    s.base.name.clone().unwrap_or_default(),
                    Rect { x, y, w, h },
                ))
            }
            _ => None,
        })
        .collect()
}

pub(super) fn connectors(e: &Engine, slide: &str) -> Vec<ConnectorEl> {
    e.deck()
        .slide(slide)
        .unwrap()
        .elements
        .iter()
        .filter_map(|el| match el {
            Element::Connector(c) => Some(c.clone()),
            _ => None,
        })
        .collect()
}

pub(super) fn rect_named(list: &[(String, String, Rect)], name: &str) -> Rect {
    list.iter().find(|(_, n, _)| n == name).unwrap().2
}

pub(super) fn disjoint(a: Rect, b: Rect) -> bool {
    a.x + a.w <= b.x + 1e-6
        || b.x + b.w <= a.x + 1e-6
        || a.y + a.h <= b.y + 1e-6
        || b.y + b.h <= a.y + 1e-6
}

pub(super) fn inside(area: Rect, r: Rect) -> bool {
    r.x >= area.x - 1e-6
        && r.y >= area.y - 1e-6
        && r.x + r.w <= area.x + area.w + 1e-6
        && r.y + r.h <= area.y + area.h + 1e-6
}

/// Where a connector's ends are, from its box and flips.
pub(super) fn ends(c: &ConnectorEl) -> ((f64, f64), (f64, f64)) {
    let (x, y, w, h) = c.base.rect().unwrap();
    let start = (
        if c.base.flip_h { x + w } else { x },
        if c.base.flip_v { y + h } else { y },
    );
    let end = (
        if c.base.flip_h { x } else { x + w },
        if c.base.flip_v { y } else { y + h },
    );
    (start, end)
}

pub(super) fn point(r: Rect, side: &Side) -> (f64, f64) {
    match side {
        Side::Left => (r.x, r.y + r.h / 2.0),
        Side::Right => (r.x + r.w, r.y + r.h / 2.0),
        Side::Top => (r.x + r.w / 2.0, r.y),
        Side::Bottom => (r.x + r.w / 2.0, r.y + r.h),
    }
}

/// Every connector joins the boxes it names, at the sides it names, and its ends are on them.
pub(super) fn assert_attached(e: &Engine, slide: &str) {
    let list = boxes(e, slide);
    for c in connectors(e, slide) {
        let (Some(from), Some(to)) = (&c.from, &c.to) else {
            panic!("a connector is attached at both ends: {c:?}")
        };
        let a = list
            .iter()
            .find(|(id, _, _)| *id == from.el)
            .expect("from is a box")
            .2;
        let b = list
            .iter()
            .find(|(id, _, _)| *id == to.el)
            .expect("to is a box")
            .2;
        let (start, end) = ends(&c);
        let (want_start, want_end) = (point(a, &from.side), point(b, &to.side));
        assert!(
            (start.0 - want_start.0).abs() < 0.02 && (start.1 - want_start.1).abs() < 0.02,
            "{start:?} vs {want_start:?}"
        );
        assert!(
            (end.0 - want_end.0).abs() < 0.02 && (end.1 - want_end.1).abs() < 0.02,
            "{end:?} vs {want_end:?}"
        );
    }
}

pub(super) const AREA: Rect = Rect {
    x: 64.0,
    y: 148.0,
    w: 832.0,
    h: 344.0,
};
