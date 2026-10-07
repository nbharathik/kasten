//! Citation: references by their BibTeX keys, set small in the citation style.
//!
//! It is one text box. What it says comes from [`crate::citations::lines`]:
//! `short` is one line, `Vaswani et al., 2017 (NeurIPS)`; `numbered` is `[1][2]`,
//! the numbers the deck gives the works; `full` is a line for each reference;
//! `list` is every work the deck cites, each with its number in front. Without a
//! bibliography the keys are written as they are, so a host that has none still
//! draws something.

use super::Ctx;
use super::build::{ParaExt, Parts, insets, para, run, shown};
use super::geom::sane;
use super::measure::{Face, fit_pt, line_count};
use crate::citations;
use crate::model::{CitationEl, CitationStyle, Element, Paragraph, Text, VAlign};
use crate::units::points_to_units;

/// The smallest a citation is set, in points.
const FLOOR_PT: f64 = 8.0;
const LINE: f64 = 1.25;
/// Space between two references, in points.
const BETWEEN: f64 = 2.0;
/// The insets of the text: the sides are what a text box has by default; the top and bottom are
/// tighter, so that one line of the citation style fits the strip of 24 units that a footer
/// has between the content and the margin of the slide.
const SIDE: f64 = 9.6;
const TOP: f64 = 2.4;

/// The lines a citation is made of, one paragraph each.
fn lines(cx: &Ctx, element: &CitationEl) -> Vec<String> {
    let style = element.format.as_ref().unwrap_or(&CitationStyle::Short);
    citations::lines(&element.keys, style, &cx.cites)
}

pub fn expand(cx: &Ctx, element: &CitationEl) -> Vec<Element> {
    let rect = sane(cx.rect);
    let theme_size = cx.theme.text_style("citation").map_or(10.0, |s| s.size);
    let lines = lines(cx, element);
    let (room_w, room_h) = (rect.w - 2.0 * SIDE, rect.h - 2.0 * TOP);
    let fits = |pt: f64| {
        let rows: usize = lines
            .iter()
            .map(|l| line_count(l, room_w, pt, Face::Sans, false))
            .sum();
        rows as f64 * points_to_units(pt * LINE)
            + lines.len().saturating_sub(1) as f64 * points_to_units(BETWEEN)
            <= room_h
    };
    let size = fit_pt(theme_size, FLOOR_PT.min(theme_size), fits);
    let paragraphs: Vec<Paragraph> = lines
        .iter()
        .map(|l| {
            // The theme's size stands unless the box is too small for it.
            let mut words = run(shown(l), size);
            if size == theme_size {
                words.size = None;
            }
            para(vec![words])
                .style("citation")
                .spacing(LINE)
                .after(BETWEEN)
        })
        .collect();
    let text = Text {
        valign: Some(VAlign::Top),
        insets: Some(insets(SIDE, TOP, SIDE, TOP)),
        ..Text::from_paragraphs(paragraphs)
    };
    let mut parts = Parts::new(cx.id, rect);
    parts.text(rect, text);
    parts.finish()
}

#[cfg(test)]
mod resolved;
#[cfg(test)]
mod tests;
