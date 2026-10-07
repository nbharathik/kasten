//! Token probabilities: the words so far as chips, and a bar for each likely next word.
//!
//! The tokens written so far flow left to right as rounded chips, wrapping like
//! words do; under them each candidate for the next token has a row: its text in
//! the code font with spaces and line breaks made visible, a bar as long as its
//! probability on a faint track as long as 100%, and the percentage after the track. The token that was picked is
//! drawn in the accent colour and in bold. Eight candidates are shown, and the
//! rest are counted. Everything is set at one size, the largest (up to 20 pt) at
//! which it fits; if the tokens still do not fit at 10 pt, the earliest ones are
//! left out behind a chip of dots.

use super::Ctx;
use super::build::{ParaExt, Parts, RunExt, StyleExt, faded, filled, insets, para, run, text_of};
use super::geom::{right, sane};
use super::measure::{MONO_EM, columns, fit_pt};
use crate::model::{Align, Element, NextToken, TokenProbsEl, VAlign};
use crate::resolve::Rect;
use crate::units::points_to_units;

const CAP_PT: f64 = 20.0;
const FLOOR_PT: f64 = 10.0;
/// How many candidates get a row.
pub const MAX_CANDIDATES: usize = 8;
/// The most columns a candidate's text takes before it is cut short.
const MAX_LABEL: usize = 16;
/// The room the bars keep at least, in units, or the type is made smaller.
const MIN_BAR: f64 = 60.0;

/// The measures of a size, in slide units: everything is a multiple of the type.
struct Grid {
    unit: f64,
    chip_h: f64,
    pad: f64,
    gap: f64,
    row_gap: f64,
    section: f64,
    bar_row: f64,
    bar_gap: f64,
}

impl Grid {
    fn of(size: f64) -> Grid {
        let unit = points_to_units(size);
        Grid {
            unit,
            chip_h: unit * 1.9,
            pad: unit * 0.55,
            gap: unit * 0.45,
            row_gap: unit * 0.4,
            section: unit * 1.3,
            bar_row: unit * 1.7,
            bar_gap: unit * 0.35,
        }
    }

    fn text_w(&self, cols: usize) -> f64 {
        cols as f64 * MONO_EM * self.unit * 1.01
    }
}

/// The sign before the count of candidates that are not drawn. Kept apart so no format string starts with a plus.
const PLUS: &str = "+";

/// A token as text in a chip or a row: spaces, tabs and line breaks show as marks.
fn visible(token: &str) -> String {
    if token.is_empty() {
        return "\"\"".to_owned();
    }
    let mut out = String::with_capacity(token.len());
    for c in token.chars() {
        match c {
            ' ' => out.push('\u{b7}'),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            '\r' => out.push_str("\\r"),
            c if c.is_control() => out.push('\u{fffd}'),
            c => out.push(c),
        }
    }
    out
}

/// `text` cut to at most `cols` columns, ending in an ellipsis when it was cut.
fn cut(text: &str, cols: usize) -> String {
    if columns(text) <= cols {
        return text.to_owned();
    }
    let mut out = String::new();
    let mut used = 0;
    for c in text.chars() {
        let w = columns(c.encode_utf8(&mut [0; 4]));
        if used + w + 1 > cols {
            break;
        }
        out.push(c);
        used += w;
    }
    out.push('\u{2026}');
    out
}

/// A probability as a percentage: `42.5%`, `30%`, `0.4%`.
fn percent(p: f64) -> String {
    let tenths = (p * 1000.0).round() / 10.0;
    if tenths.fract() == 0.0 {
        format!("{tenths:.0}%")
    } else {
        format!("{tenths:.1}%")
    }
}

fn probability(p: f64) -> f64 {
    if p.is_finite() {
        p.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

/// The candidates that get a row: the first eight, or seven and the token that was picked when that is further down.
fn shown(next: &[NextToken], chosen: Option<usize>) -> Vec<usize> {
    let mut rows: Vec<usize> = (0..next.len().min(MAX_CANDIDATES)).collect();
    if let Some(c) = chosen.filter(|c| *c >= MAX_CANDIDATES && *c < next.len()) {
        rows[MAX_CANDIDATES - 1] = c;
    }
    rows
}

/// Where the chips go, row by row: (index in the list, x, row).
struct Flow {
    chips: Vec<(usize, f64, usize)>,
    rows: usize,
}

fn flow(widths: &[f64], max_w: f64, gap: f64) -> Flow {
    let mut chips = Vec::with_capacity(widths.len());
    let (mut x, mut row) = (0.0, 0);
    for (i, w) in widths.iter().enumerate() {
        if x > 0.0 && x + w > max_w {
            x = 0.0;
            row += 1;
        }
        chips.push((i, x, row));
        x += w + gap;
    }
    Flow {
        chips,
        rows: if widths.is_empty() { 0 } else { row + 1 },
    }
}

/// Everything decided for one size.
struct Arrangement {
    /// The chips to draw: their text and width.
    chips: Vec<(String, f64)>,
    flow: Flow,
    /// Whether tokens had to be left out.
    dropped: bool,
    label_w: f64,
    bar_w: f64,
    bars_h: f64,
    height: f64,
}

fn arrange(
    rect: Rect,
    size: f64,
    tokens: &[String],
    rows: &[(String, String)],
    more: usize,
) -> Arrangement {
    let g = Grid::of(size);
    let width_of = |text: &str| {
        (2.0 * g.pad + g.text_w(columns(text)) + 2.0).clamp(g.chip_h, rect.w.max(g.chip_h))
    };
    let label_cols = rows.iter().map(|(l, _)| columns(l)).max().unwrap_or(0);
    let pct_cols = rows.iter().map(|(_, p)| columns(p)).max().unwrap_or(0);
    let label_w = if rows.is_empty() {
        0.0
    } else {
        g.text_w(label_cols) + 2.0 + g.unit * 0.8
    };
    let pct_w = g.text_w(pct_cols) + g.unit * 0.5;
    let bar_w = (rect.w - label_w - pct_w).max(0.0);
    let bars_h = if rows.is_empty() {
        0.0
    } else {
        rows.len() as f64 * g.bar_row
            + (rows.len() - 1) as f64 * g.bar_gap
            + if more > 0 {
                g.bar_gap + g.unit * 1.4
            } else {
                0.0
            }
    };
    let section = if rows.is_empty() || tokens.is_empty() {
        0.0
    } else {
        g.section
    };
    let room = (rect.h - bars_h - section).max(0.0);
    let max_rows = (((room + g.row_gap) / (g.chip_h + g.row_gap)).floor() as usize).max(1);

    let all: Vec<(String, f64)> = tokens.iter().map(|t| (t.clone(), width_of(t))).collect();
    let rows_for = |from: usize| {
        let dots = if from > 0 { 1 } else { 0 };
        let mut widths = Vec::with_capacity(all.len() - from + dots);
        if dots == 1 {
            widths.push(width_of("..."));
        }
        widths.extend(all[from..].iter().map(|(_, w)| *w));
        flow(&widths, rect.w, g.gap)
    };
    // The fewest tokens dropped from the front for the chips to fit their rows.
    let (mut lo, mut hi) = (0, all.len());
    while lo < hi {
        let mid = (lo + hi) / 2;
        if rows_for(mid).rows <= max_rows {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    let dropped = lo > 0;
    let mut chips = Vec::new();
    if dropped {
        chips.push(("...".to_owned(), width_of("...")));
    }
    chips.extend(all[lo..].iter().cloned());
    let laid = rows_for(lo);
    let chips_h = if laid.rows == 0 {
        0.0
    } else {
        laid.rows as f64 * g.chip_h + (laid.rows - 1) as f64 * g.row_gap
    };
    Arrangement {
        chips,
        flow: laid,
        dropped,
        label_w,
        bar_w,
        bars_h,
        height: chips_h + section + bars_h,
    }
}

pub fn expand(cx: &Ctx, element: &TokenProbsEl) -> Vec<Element> {
    let rect = sane(cx.rect);
    let chosen = element
        .chosen
        .map(|c| c as usize)
        .filter(|c| *c < element.next.len());
    let picked = shown(&element.next, chosen);
    let more = element.next.len() - picked.len();
    let tokens: Vec<String> = element.tokens.iter().map(|t| visible(t)).collect();
    let rows: Vec<(String, String)> = picked
        .iter()
        .map(|i| {
            let next = &element.next[*i];
            (
                cut(&visible(&next.token), MAX_LABEL),
                percent(probability(next.p)),
            )
        })
        .collect();
    if tokens.is_empty() && rows.is_empty() {
        return Vec::new();
    }

    let size = fit_pt(CAP_PT, FLOOR_PT, |pt| {
        let a = arrange(rect, pt, &tokens, &rows, more);
        !a.dropped && a.height <= rect.h && (rows.is_empty() || a.bar_w >= MIN_BAR)
    });
    let g = Grid::of(size);
    let a = arrange(rect, size, &tokens, &rows, more);

    let mut parts = Parts::new(cx.id, rect);
    let corner = 0.292_89 * (g.chip_h * 0.3);
    for (i, x, row) in &a.flow.chips {
        let (text, w) = &a.chips[*i];
        let r = Rect {
            x: rect.x + x,
            y: rect.y + *row as f64 * (g.chip_h + g.row_gap),
            w: *w,
            h: g.chip_h,
        };
        let words = para(vec![run(text, size).font("code").color("text1")])
            .style("code")
            .align(Align::Center);
        parts.shape(
            "roundRect",
            r,
            filled("bg2")
                .radius(g.chip_h * 0.3)
                .stroke("text2", 1.0)
                .stroke_alpha(0.6),
            Some(text_of(
                vec![words],
                VAlign::Middle,
                insets(g.pad - corner, 0.0, g.pad - corner, 0.0),
            )),
        );
    }

    let top = rect.y + a.height - a.bars_h;
    let bars_x = rect.x + a.label_w;
    for (n, ((label, pct), index)) in rows.iter().zip(&picked).enumerate() {
        let is_chosen = chosen == Some(*index);
        let y = top + n as f64 * (g.bar_row + g.bar_gap);
        let flat = insets(0.0, 0.0, 0.0, 0.0);
        let mut name = run(label, size).font("code").color("text1");
        name.bold = is_chosen;
        parts.text(
            Rect {
                x: rect.x,
                y,
                w: (a.label_w - g.unit * 0.8).max(0.0),
                h: g.bar_row,
            },
            text_of(
                vec![para(vec![name]).style("code").align(Align::Right)],
                VAlign::Middle,
                flat.clone(),
            ),
        );
        let length = (probability(element.next[*index].p) * a.bar_w).max(2.0);
        let bar_h = g.bar_row * 0.62;
        let bar_y = y + (g.bar_row - bar_h) / 2.0;
        // A faint track as long as 100% makes the scale plain; the bar lies on it.
        parts.shape(
            "roundRect",
            Rect {
                x: bars_x,
                y: bar_y,
                w: a.bar_w,
                h: bar_h,
            },
            filled("bg2").radius(4.0),
            None,
        );
        let style = if is_chosen {
            filled("accent1")
        } else {
            faded("accent2", 0.55)
        };
        parts.shape(
            "roundRect",
            Rect {
                x: bars_x,
                y: bar_y,
                w: length,
                h: bar_h,
            },
            style.radius(4.0),
            None,
        );
        let mut number =
            run(pct, size)
                .font("code")
                .color(if is_chosen { "text1" } else { "text2" });
        number.bold = is_chosen;
        let after = bars_x + a.bar_w + g.unit * 0.5;
        parts.text(
            Rect {
                x: after,
                y,
                w: (right(rect) - after).max(0.0),
                h: g.bar_row,
            },
            text_of(
                vec![para(vec![number]).style("code").align(Align::Right)],
                VAlign::Middle,
                flat,
            ),
        );
    }
    if more > 0 {
        let y = top + rows.len() as f64 * (g.bar_row + g.bar_gap);
        let note = run(
            &format!("{PLUS}{more} more"),
            ((size * 0.85 * 2.0).round() / 2.0).max(9.0),
        )
        .color("text2");
        parts.text(
            Rect {
                x: bars_x,
                y,
                w: a.bar_w,
                h: g.unit * 1.4,
            },
            text_of(
                vec![para(vec![note]).style("caption")],
                VAlign::Top,
                insets(0.0, 0.0, 0.0, 0.0),
            ),
        );
    }
    parts.finish()
}

#[cfg(test)]
mod tests;
