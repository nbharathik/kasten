//! Sizes and places: how big the boxes are, how far apart the layers and the
//! boxes in a layer are, and where each box goes so that the whole diagram
//! fits its area, centred in it, with the type as large as it can be.

use crate::error::{Error, Result};
use crate::lint::estimate::{room, text_size};
use crate::model::{Align, Insets, Paragraph, Run, Text, Theme, VAlign};
use crate::resolve::Rect;

use super::Direction;
use super::layers::Layering;

/// The type sizes tried, in points, largest first. Nothing goes under 14: the
/// lint rule for small type would object.
const FONTS: [f64; 4] = [20.0, 18.0, 16.0, 14.0];
/// The widest a box may be, and the least.
const WIDEST: f64 = 220.0;
const NARROWEST: f64 = 72.0;
/// The shortest a box may be.
const SHORTEST: f64 = 48.0;
/// Space around the words in a box, at the left and right, and at the top and bottom.
const INSET_X: f64 = 10.0;
const INSET_Y: f64 = 6.0;

/// The space around the words in a box.
pub fn insets() -> Insets {
    Insets {
        left: INSET_X,
        top: INSET_Y,
        right: INSET_X,
        bottom: INSET_Y,
        extra: crate::model::Extra::new(),
    }
}

/// What the plan decided.
pub struct Plan {
    /// The type size of the words in the boxes, in points.
    pub font: f64,
    /// The box of each node, by index.
    pub rects: Vec<Rect>,
}

/// The words of a box, as it is set in, for measuring.
pub fn words(label: &str, font: f64, bold: bool) -> Text {
    let mut paragraph = Paragraph::plain("");
    paragraph.runs = vec![Run {
        size: Some(font),
        bold,
        ..Run::plain(label)
    }];
    paragraph.align = Some(Align::Center);
    let mut text = Text::from_paragraphs(vec![paragraph]);
    text.valign = Some(VAlign::Middle);
    text.insets = Some(insets());
    text
}

fn up_to_even(v: f64) -> f64 {
    (v / 2.0).ceil() * 2.0
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// An arrow of the diagram, for the room its label takes.
pub struct Arrow {
    pub from: usize,
    pub to: usize,
    pub label: Option<String>,
}

/// How big each layer is along the flow, the gap after each, and the gap between the boxes of a layer.
struct Spacing {
    /// The size of each layer along the flow.
    along: Vec<f64>,
    /// The gap between a layer and the next.
    layer: Vec<f64>,
    slot: f64,
}

/// The least gap between layers: room for an arrow and, if it has one, its label.
fn least_gaps(
    direction: Direction,
    layering: &Layering,
    arrows: &[Arrow],
    label_widths: &[f64],
    layers: usize,
) -> Vec<f64> {
    let horizontal = direction == Direction::LeftToRight;
    let base: f64 = if horizontal { 36.0 } else { 32.0 };
    let mut gaps = vec![base; layers.saturating_sub(1)];
    for (arrow, width) in arrows.iter().zip(label_widths) {
        if *width <= 0.0 {
            continue;
        }
        let (a, b) = (layering.layer[arrow.from], layering.layer[arrow.to]);
        for gap in gaps.iter_mut().take(a.max(b)).skip(a.min(b)) {
            // A label sits on its arrow: beside it in a row of boxes, and above the arrow in a column.
            *gap = (*gap).max(if horizontal { width + 18.0 } else { 44.0 });
        }
    }
    gaps
}

/// The gaps that the sizes leave room for, or None (and how much room they would need).
fn spacing(
    direction: Direction,
    (along, across): (Vec<f64>, f64),
    slots: usize,
    area: (f64, f64),
    least: &[f64],
) -> std::result::Result<Spacing, (f64, f64)> {
    let horizontal = direction == Direction::LeftToRight;
    let (min_slot, nominal_slot) = if horizontal {
        (16.0, 28.0)
    } else {
        (24.0, (across * 0.2).clamp(24.0, 40.0))
    };
    let (room_along, room_across) = if horizontal { area } else { (area.1, area.0) };
    let need_along = along.iter().sum::<f64>() + least.iter().sum::<f64>();
    let need_across = slots as f64 * across + slots.saturating_sub(1) as f64 * min_slot;
    if need_along > room_along + 1e-6 || need_across > room_across + 1e-6 {
        return Err(if horizontal {
            (need_along, need_across)
        } else {
            (need_across, need_along)
        });
    }
    // What is left over goes to the gaps, each up to about half a box.
    let mean = along.iter().sum::<f64>() / along.len().max(1) as f64;
    let nominal = if horizontal {
        (mean * 0.5).clamp(48.0, 100.0)
    } else {
        (mean * 0.9).clamp(40.0, 72.0)
    };
    let wanted: Vec<f64> = least.iter().map(|l| nominal.max(*l)).collect();
    let extra = room_along - need_along;
    let asked: f64 = wanted.iter().zip(least).map(|(w, l)| w - l).sum();
    let share = if asked > 0.0 {
        (extra / asked).min(1.0)
    } else {
        0.0
    };
    let layer = wanted
        .iter()
        .zip(least)
        .map(|(w, l)| l + (w - l) * share)
        .collect();
    let slot = if slots <= 1 {
        nominal_slot
    } else {
        ((room_across - slots as f64 * across) / (slots - 1) as f64).clamp(min_slot, nominal_slot)
    };
    Ok(Spacing { along, layer, slot })
}

/// The corner radius of the boxes, in units.
pub const RADIUS: f64 = 10.0;

/// Real type is wider than the estimate of it (capitals most, by up to about 6%): a box is made this
/// much wider than the estimate says its longest word needs, so the word is never broken in a browser.
const WORD_SLACK: f64 = 1.10;

/// The width an estimate says a text needs (its insets included), with room for the estimate being low.
fn widened(width: f64) -> f64 {
    let insets = INSET_X + INSET_X;
    (width - insets).max(0.0) * WORD_SLACK + insets
}

/// The height every box needs so that the words fit at the widths given, or None if a word does not fit its box.
fn height_for(
    theme: &Theme,
    texts: &[Text],
    rooms: &[crate::lint::estimate::Room],
    widths: &[f64],
) -> Option<f64> {
    let mut h: f64 = SHORTEST;
    for ((text, r), w) in texts.iter().zip(rooms).zip(widths) {
        let size = text_size(theme, "body", text, w * r.across - r.pad);
        if widened(size.width) > w * r.across - r.pad + 0.5 {
            return None;
        }
        h = h.max((size.height + r.pad) / r.down);
    }
    Some(up_to_even(h))
}

/// Works out the sizes and places, or says why the diagram cannot fit.
pub fn plan(
    theme: &Theme,
    boxes: &[(String, String, bool)],
    arrows: &[Arrow],
    layering: &Layering,
    direction: Direction,
    area: Rect,
) -> Result<Plan> {
    let layers = layering.layers.len();
    let slots = layering.layers.iter().map(Vec::len).max().unwrap_or(1);
    let label_widths: Vec<f64> = arrows
        .iter()
        .map(|a| {
            a.label.as_deref().map_or(0.0, |l| {
                text_size(theme, "caption", &Text::plain(l), 1.0e6).natural
            })
        })
        .collect();
    let least = least_gaps(direction, layering, arrows, &label_widths, layers);
    // What of a box its words are set in, for each: less for an ellipse than for a rectangle.
    let rooms: Vec<_> = boxes
        .iter()
        .map(|(_, shape, _)| room(shape, 100.0, 100.0, Some(RADIUS)))
        .collect();
    let mut nearest: Option<(f64, f64)> = None;
    for font in FONTS {
        let texts: Vec<Text> = boxes
            .iter()
            .map(|(label, _, bold)| words(label, font, *bold))
            .collect();
        // The width each box would like, in one line.
        let wish: Vec<f64> = texts
            .iter()
            .zip(&rooms)
            .map(|(t, r)| (widened(text_size(theme, "body", t, 1.0e6).natural) + r.pad) / r.across)
            .collect();
        let start = wish.iter().copied().fold(0.0, f64::max).clamp(88.0, WIDEST);
        let mut tried: Vec<Vec<f64>> = Vec::new();
        for share in [1.0, 0.85, 0.7, 0.6, 0.5] {
            // Every box as wide as the widest needs; and, when the boxes go in a row, each column as wide as its own boxes need.
            let uniform = up_to_even((start * share).max(NARROWEST));
            let mut candidates = vec![vec![uniform; boxes.len()]];
            if direction == Direction::LeftToRight {
                let column: Vec<f64> = (0..layers)
                    .map(|k| {
                        layering.layers[k]
                            .iter()
                            .filter_map(|slot| match slot {
                                super::layers::Slot::Node(v) => Some(wish[*v]),
                                super::layers::Slot::Dummy(_) => None,
                            })
                            .fold(0.0, f64::max)
                    })
                    .map(|w| up_to_even((w.clamp(NARROWEST, WIDEST) * share).max(NARROWEST)))
                    .collect();
                candidates.push(
                    (0..boxes.len())
                        .map(|v| column[layering.layer[v]])
                        .collect(),
                );
            }
            for widths in candidates {
                if tried.contains(&widths) {
                    continue;
                }
                tried.push(widths.clone());
                let Some(h) = height_for(theme, &texts, &rooms, &widths) else {
                    continue;
                };
                let along: Vec<f64> = (0..layers)
                    .map(|k| {
                        let here = layering.layers[k].iter().find_map(|slot| match slot {
                            super::layers::Slot::Node(v) => Some(widths[*v]),
                            super::layers::Slot::Dummy(_) => None,
                        });
                        let w = here.unwrap_or(uniform);
                        if direction == Direction::LeftToRight {
                            w
                        } else {
                            h
                        }
                    })
                    .collect();
                let across = if direction == Direction::LeftToRight {
                    h
                } else {
                    widths.iter().copied().fold(0.0, f64::max)
                };
                match spacing(direction, (along, across), slots, (area.w, area.h), &least) {
                    Ok(gap) => return Ok(place(layering, direction, area, &widths, h, &gap, font)),
                    Err(need) => {
                        if font == FONTS[FONTS.len() - 1]
                            && nearest.is_none_or(|n| need.0 * need.1 < n.0 * n.1)
                        {
                            nearest = Some(need);
                        }
                    }
                }
            }
        }
    }
    let needs = nearest.map_or_else(String::new, |(w, h)| {
        format!(
            " At 14 pt it needs about {} by {}.",
            round2(w.ceil()),
            round2(h.ceil())
        )
    });
    Err(Error::refused(format!(
        "The diagram has {} boxes in {layers} steps of up to {slots}, which does not fit the {} by {} box at a readable size (14 pt).{needs} Give it a bigger box, use fewer boxes or shorter labels, drop the labels on the arrows, or split it over two slides.",
        boxes.len(),
        round2(area.w),
        round2(area.h)
    )))
}

fn place(
    layering: &Layering,
    direction: Direction,
    area: Rect,
    widths: &[f64],
    h: f64,
    gap: &Spacing,
    font: f64,
) -> Plan {
    let horizontal = direction == Direction::LeftToRight;
    let slots = layering.layers.iter().map(Vec::len).max().unwrap_or(1);
    let across = if horizontal {
        h
    } else {
        widths.iter().copied().fold(0.0, f64::max)
    };
    let used_along = gap.along.iter().sum::<f64>() + gap.layer.iter().sum::<f64>();
    let used_across = slots as f64 * across + slots.saturating_sub(1) as f64 * gap.slot;
    let (room_along, room_across) = if horizontal {
        (area.w, area.h)
    } else {
        (area.h, area.w)
    };
    let start_along = (room_along - used_along) / 2.0;
    let start_across = (room_across - used_across) / 2.0;
    let mut rects = vec![
        Rect {
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0
        };
        layering.layer.len()
    ];
    let mut a = start_along;
    for (k, layer) in layering.layers.iter().enumerate() {
        let here = layer.len() as f64 * across + layer.len().saturating_sub(1) as f64 * gap.slot;
        let lead = start_across + (used_across - here) / 2.0;
        for (i, slot) in layer.iter().enumerate() {
            let super::layers::Slot::Node(v) = slot else {
                continue;
            };
            let c = lead + i as f64 * (across + gap.slot);
            let (x, y, w, height) = if horizontal {
                (area.x + a, area.y + c, gap.along[k], h)
            } else {
                (area.x + c, area.y + a, widths[*v], h)
            };
            rects[*v] = Rect {
                x: round2(x),
                y: round2(y),
                w,
                h: height,
            };
        }
        a += gap.along[k] + gap.layer.get(k).copied().unwrap_or(0.0);
    }
    Plan { font, rects }
}
