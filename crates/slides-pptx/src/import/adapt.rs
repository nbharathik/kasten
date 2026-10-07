//! Slides from one deck put into another: onto a layout of the other deck's theme, with the
//! slots they filled and the size of the other deck's slides. What a slide's words are set in
//! follows the deck it lands in; where it put things itself stays where it put them.

use std::collections::HashSet;

use slides_core::resolve::box_in;
use slides_core::{Element, Layout, PlaceholderKind, Size, Slide, Theme};

/// A deck as far as moving a slide out of it or into it matters.
#[derive(Clone, Copy)]
pub struct Frame<'a> {
    pub theme: &'a Theme,
    pub size: &'a Size,
}

/// The roles of the slots a slide fills, that its layout has.
fn roles_used(slide: &Slide, from: &Theme) -> HashSet<String> {
    let layout = from.layout(&slide.layout);
    slide
        .elements
        .iter()
        .filter_map(|e| e.base().placeholder.clone())
        .filter(|role| layout.is_some_and(|l| l.placeholder(role).is_some()))
        .collect()
}

fn roles_of(layout: &Layout) -> HashSet<String> {
    layout.placeholders.iter().map(|p| p.role.clone()).collect()
}

/// The layout of `to` a slide that used `slide.layout` of `from` goes on: its own name if `to`
/// has that layout with all the slots the slide fills, otherwise the layout whose slots are the
/// most like the ones it fills.
pub fn choose_layout(slide: &Slide, from: &Theme, to: &Theme) -> String {
    let used = roles_used(slide, from);
    if let Some(same) = to.layout(&slide.layout)
        && used.is_subset(&roles_of(same))
    {
        return same.name.clone();
    }
    let score = |layout: &Layout| -> i64 {
        let has = roles_of(layout);
        let hit = used.intersection(&has).count() as i64;
        let missing = used.difference(&has).count() as i64;
        let spare = has.difference(&used).count() as i64;
        hit * 10 - missing * 10 - spare
    };
    let mut best: Option<(&Layout, i64)> = None;
    for layout in &to.layouts {
        let s = score(layout);
        if best.is_none_or(|(_, b)| s > b) {
            best = Some((layout, s));
        }
    }
    best.map_or_else(|| slide.layout.clone(), |(l, _)| l.name.clone())
}

fn fits(slot: &PlaceholderKind, element: &Element) -> bool {
    matches!(
        (element, slot),
        (Element::Text(_), PlaceholderKind::Text) | (Element::Image(_), PlaceholderKind::Image)
    )
}

/// Moves and scales the boxes an element names itself, and the sizes that go with them.
fn fit_geometry(list: &mut [Element], scale: f64, shift: (f64, f64)) {
    for e in list {
        let base = e.base_mut();
        if let Some(x) = base.x.as_mut() {
            *x = round2(*x * scale + shift.0);
        }
        if let Some(y) = base.y.as_mut() {
            *y = round2(*y * scale + shift.1);
        }
        for side in [&mut base.w, &mut base.h].into_iter().flatten() {
            *side = round2(*side * scale);
        }
        if (scale - 1.0).abs() > 1e-9 {
            if let Some(style) = base.style.as_mut() {
                style.radius = style.radius.map(|r| round2(r * scale));
                if let Some(stroke) = style.stroke.as_mut() {
                    stroke.width = stroke.width.map(|w| round2(w * scale));
                }
            }
            for text in texts_mut(e) {
                for run in text.paragraphs.iter_mut().flat_map(|p| p.runs.iter_mut()) {
                    run.size = run.size.map(|s| (s * scale * 2.0).round() / 2.0);
                }
            }
        }
        if let Some(children) = e.children_mut() {
            fit_geometry(children, scale, shift);
        }
    }
}

fn texts_mut(element: &mut Element) -> Vec<&mut slides_core::Text> {
    match element {
        Element::Text(e) => vec![&mut e.text],
        Element::Shape(e) => e.text.iter_mut().collect(),
        Element::Connector(e) => e.label.iter_mut().collect(),
        Element::Table(e) => e
            .rows
            .iter_mut()
            .flat_map(|row| row.cells.iter_mut().map(|cell| &mut cell.text))
            .collect(),
        _ => Vec::new(),
    }
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// A slide of the deck `from` as it goes into the deck `to`.
pub fn adapt_slide(mut slide: Slide, from: Frame, to: Frame) -> Slide {
    let layout = choose_layout(&slide, from.theme, to.theme);
    let target = to.theme.layout(&layout);
    let home = slide.layout.clone();
    for e in &mut slide.elements {
        let Some(role) = e.base().placeholder.clone() else {
            continue;
        };
        let slot = target.and_then(|l| l.placeholder(&role));
        if slot.is_some_and(|s| fits(&s.kind, e)) {
            continue;
        }
        // The slot is not there any more: the element keeps the box the slot gave it.
        if let Some(rect) = box_in(from.theme, &home, e) {
            let base = e.base_mut();
            (base.x, base.y, base.w, base.h) =
                (Some(rect.x), Some(rect.y), Some(rect.w), Some(rect.h));
        }
        e.base_mut().placeholder = None;
    }
    slide.layout = layout;
    let (sw, sh) = (
        to.size.w / from.size.w.max(1.0),
        to.size.h / from.size.h.max(1.0),
    );
    let scale = sw.min(sh);
    let shift = (
        (to.size.w - from.size.w * scale) / 2.0,
        (to.size.h - from.size.h * scale) / 2.0,
    );
    if (scale - 1.0).abs() > 1e-9 || shift.0.abs() > 1e-9 || shift.1.abs() > 1e-9 {
        fit_geometry(&mut slide.elements, scale, shift);
    }
    slide
}

#[cfg(test)]
mod tests;
