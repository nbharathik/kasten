//! Where things are on the slide: sticking out past an edge, and crowding one.

use crate::resolve::Rect;

use super::super::geometry::{bottom, right, units};
use super::super::scene::{Kind, Scene, Unit};
use super::super::texts::{describe_unit, sentence};
use super::{Found, Sink};

/// Half a unit: how far past an edge is still on the edge.
const EDGE: f64 = 0.5;

/// How close to an edge content may come, in slide units.
pub const MARGIN: f64 = 24.0;

/// Whether a name marks an element as meant to run off the edge.
fn bleeds(name: Option<&str>) -> bool {
    let Some(name) = name.map(str::trim) else {
        return false;
    };
    let lower = name.to_ascii_lowercase();
    lower == "bleed"
        || lower
            .strip_prefix("bleed")
            .is_some_and(|rest| rest.starts_with(|c: char| !c.is_alphanumeric()))
}

/// Whether a unit is a picture or a shape spread over the whole slide.
fn covers(scene: &Scene, unit: &Unit, b: Rect) -> bool {
    matches!(
        unit.kind,
        Kind::Shape | Kind::Image | Kind::Group | Kind::Raw | Kind::Composite(_)
    ) && b.x <= EDGE
        && b.y <= EDGE
        && right(b) >= scene.width - EDGE
        && bottom(b) >= scene.height - EDGE
}

/// The units that are on the slide and have a box, in the order of the stack.
fn drawn<'a, 's>(scene: &'a Scene<'s>) -> impl Iterator<Item = (usize, &'a Unit<'s>, Rect)> {
    scene
        .units
        .iter()
        .enumerate()
        .filter(|(_, u)| !u.undrawn)
        .filter_map(|(n, u)| u.bounds.map(|b| (n, u, b)))
}

/// How far each edge of the box is past the slide's edge, worst first.
fn overhang(scene: &Scene, b: Rect) -> Vec<(&'static str, f64)> {
    let mut sides = vec![
        ("left", -b.x),
        ("top", -b.y),
        ("right", right(b) - scene.width),
        ("bottom", bottom(b) - scene.height),
    ];
    sides.retain(|(_, past)| *past > EDGE);
    sides.sort_by(|a, b| b.1.total_cmp(&a.1));
    sides
}

pub fn off_slide(scene: &Scene, sink: &mut Sink) {
    for (n, unit, b) in drawn(scene) {
        if bleeds(unit.el.base().name.as_deref()) || covers(scene, unit, b) {
            continue;
        }
        let past = overhang(scene, b);
        if past.is_empty() {
            continue;
        }
        let how = past
            .iter()
            .map(|(side, by)| format!("the {side} edge by {} units", units(*by)))
            .collect::<Vec<_>>()
            .join(" and ");
        sink.add(Found {
            rule: "off-slide",
            order: n + 1,
            key: unit.id,
            rank: -past[0].1,
            element: Some(unit.id),
            message: format!(
                "{} sticks out past {how}.",
                sentence(&describe_unit(unit))
            ),
            hint: &format!(
                "Move it or make it smaller so it fits inside the slide ({} by {}). Name it \"bleed\" if it is meant to run off the edge.",
                units(scene.width),
                units(scene.height)
            ),
        });
    }
}

pub fn margin(scene: &Scene, sink: &mut Sink) {
    for (n, unit, b) in drawn(scene) {
        if unit.kind == Kind::Line
            || bleeds(unit.el.base().name.as_deref())
            || covers(scene, unit, b)
            || !overhang(scene, b).is_empty()
        {
            continue;
        }
        let mut close: Vec<(&str, f64)> = vec![
            ("left", b.x),
            ("top", b.y),
            ("right", scene.width - right(b)),
            ("bottom", scene.height - bottom(b)),
        ];
        close.retain(|(_, gap)| *gap < MARGIN - 0.01);
        close.sort_by(|a, b| a.1.total_cmp(&b.1));
        let Some((_, nearest)) = close.first().copied() else {
            continue;
        };
        let how = close
            .iter()
            .map(|(side, gap)| format!("{} units from the {side} edge", units(*gap)))
            .collect::<Vec<_>>()
            .join(" and ");
        sink.add(Found {
            rule: "margin",
            order: n + 1,
            key: unit.id,
            rank: nearest,
            element: Some(unit.id),
            message: format!("{} is only {how} of the slide.", sentence(&describe_unit(unit))),
            hint: "Move it in, or make it smaller: leave at least 24 units around text and pictures. A full-slide picture or shape may run to the edge, and so may an element named \"bleed\".",
        });
    }
}
