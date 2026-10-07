//! Card grid: cards side by side, each a rounded rectangle with a heading and a line.
//!
//! The columns come from the number of cards unless the element names them, the
//! cells are all the same size with 16 units between them, and every card is set
//! at the same size: the largest, up to 20 pt for the line and a third more for
//! the heading, at which the fullest card fits its cell. Below 12 pt the words
//! overflow a card rather than shrink further.

use super::Ctx;
use super::build::{ParaExt, Parts, RunExt, StyleExt, filled, insets, para, run, text_of};
use super::geom::sane;
use super::measure::{Face, fit_pt, line_count};
use crate::model::{Card, CardGridEl, Element, VAlign};
use crate::resolve::Rect;
use crate::units::points_to_units;

/// The space between cells.
const GAP: f64 = 16.0;
/// The space between a card's edge and its words.
const PAD: f64 = 16.0;
const RADIUS: f64 = 12.0;
/// What a rounded corner takes from the rectangle a shape's text may use.
const CORNER: f64 = 0.292_89 * RADIUS;
const CAP_PT: f64 = 20.0;
const FLOOR_PT: f64 = 12.0;
/// The heading is this much larger than the line under it.
const HEADING: f64 = 1.3;
const HEADING_LINE: f64 = 1.2;
const BODY_LINE: f64 = 1.3;

/// How many cards go in a row when the element does not say.
pub fn auto_columns(cards: usize) -> usize {
    match cards {
        0 | 1 => 1,
        2 => 2,
        3 => 3,
        4 => 2,
        5..=9 => 3,
        _ => 4,
    }
}

/// The heading's size for a line of `body` points, in half points.
fn heading_size(body: f64) -> f64 {
    (body * HEADING * 2.0).round() / 2.0
}

/// The height the words of a card take, in slide units, at a body size in points, in a width.
fn words_height(card: &Card, body: f64, width: f64) -> f64 {
    let heading = heading_size(body);
    let mut height = line_count(&card.title, width, heading, Face::Sans, true) as f64
        * points_to_units(heading * HEADING_LINE);
    if let Some(text) = &card.body {
        height += points_to_units(body * 0.4)
            + line_count(text, width, body, Face::Sans, false) as f64
                * points_to_units(body * BODY_LINE);
    }
    height
}

pub fn expand(cx: &Ctx, element: &CardGridEl) -> Vec<Element> {
    let rect = sane(cx.rect);
    let cards = &element.cards;
    if cards.is_empty() {
        return Vec::new();
    }
    let columns = match element.columns {
        Some(n) if n > 0 => (n as usize).min(cards.len()),
        _ => auto_columns(cards.len()),
    };
    let rows = cards.len().div_ceil(columns);
    let cell_w = ((rect.w - GAP * (columns - 1) as f64) / columns as f64).max(0.0);
    let cell_h = ((rect.h - GAP * (rows - 1) as f64) / rows as f64).max(0.0);
    let (room_w, room_h) = (cell_w - 2.0 * PAD, cell_h - 2.0 * PAD);
    let body = fit_pt(CAP_PT, FLOOR_PT, |pt| {
        cards
            .iter()
            .all(|card| words_height(card, pt, room_w) <= room_h)
    });
    let heading = heading_size(body);

    // Cards with only a heading are centred; when any has a line, the words start at the top.
    let valign = if cards.iter().any(|c| c.body.is_some()) {
        VAlign::Top
    } else {
        VAlign::Middle
    };
    let space = insets(PAD - CORNER, PAD - CORNER, PAD - CORNER, PAD - CORNER);
    let mut parts = Parts::new(cx.id, rect);
    for (i, card) in cards.iter().enumerate() {
        let mut paragraphs = vec![
            para(vec![
                run(&card.title, heading)
                    .bold()
                    .font("heading")
                    .color("text1"),
            ])
            .style("body")
            .spacing(HEADING_LINE)
            .after((body * 0.4 * 2.0).round() / 2.0),
        ];
        if let Some(text) = &card.body {
            paragraphs.push(
                para(vec![run(text, body).font("body").color("text2")])
                    .style("body")
                    .spacing(BODY_LINE)
                    .after(0.0),
            );
        } else if let Some(first) = paragraphs.first_mut() {
            first.space_after = Some(0.0);
        }
        let r = Rect {
            x: rect.x + (i % columns) as f64 * (cell_w + GAP),
            y: rect.y + (i / columns) as f64 * (cell_h + GAP),
            w: cell_w,
            h: cell_h,
        };
        parts.shape(
            "roundRect",
            r,
            filled("bg2").radius(RADIUS),
            Some(text_of(paragraphs, valign.clone(), space.clone())),
        );
    }
    parts.finish()
}

#[cfg(test)]
mod tests;
