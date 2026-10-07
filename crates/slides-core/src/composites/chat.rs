//! Chat: a conversation as a stack of bubbles, one for each message.
//!
//! The user's messages sit on the right in the accent colour, the model's on the
//! left, a system prompt runs the whole width, and a tool call and its result are
//! set in the code font. Each bubble is a rounded rectangle holding a small role
//! label and the words. All bubbles are set at one size, the largest (up to 20 pt)
//! at which they fit the box; at 12 pt they are drawn even if they run past the
//! bottom, since cutting a conversation short would hide it.

use super::Ctx;
use super::build::{
    ParaExt, Parts, RunExt, StyleExt, faded, filled, insets, outlined, para, run, shown, text_of,
};
use super::geom::{right, sane};
use super::measure::{Face, fit_pt, line_count};
use crate::model::{ChatEl, ChatRole, Element, Style, VAlign};
use crate::resolve::Rect;
use crate::units::points_to_units;

/// The space between bubbles.
const GAP: f64 = 8.0;
/// The space between a bubble's edge and its words.
const PAD_X: f64 = 14.0;
const PAD_Y: f64 = 9.0;
const RADIUS: f64 = 12.0;
/// What a rounded corner takes from the rectangle a shape's text may use.
const CORNER: f64 = 0.292_89 * RADIUS;
/// Line heights, as multiples of the type size.
const LINE: f64 = 1.25;
const LABEL_LINE: f64 = 1.2;
/// Space between the label and the words, in points.
const LABEL_GAP: f64 = 2.0;
const CAP_PT: f64 = 20.0;
const FLOOR_PT: f64 = 12.0;
/// The share of the width a bubble may take, except a system prompt's.
const SHARE: f64 = 0.8;

/// How a kind of message looks.
struct Look {
    label: &'static str,
    fill: Option<(&'static str, f64)>,
    outline: Option<&'static str>,
    ink: &'static str,
    label_ink: &'static str,
    code: bool,
    full_width: bool,
    on_right: bool,
}

fn look(role: &ChatRole) -> Look {
    let base = Look {
        label: "",
        fill: None,
        outline: None,
        ink: "text1",
        label_ink: "text2",
        code: false,
        full_width: false,
        on_right: false,
    };
    match role {
        ChatRole::System => Look {
            label: "System",
            fill: Some(("bg2", 1.0)),
            ink: "text2",
            full_width: true,
            ..base
        },
        // Paper-coloured words on the accent: white on a light theme, near-black on a dark one.
        ChatRole::User => Look {
            label: "User",
            fill: Some(("accent1", 1.0)),
            ink: "bg1",
            label_ink: "bg1",
            on_right: true,
            ..base
        },
        ChatRole::Assistant => Look {
            label: "Assistant",
            fill: Some(("bg2", 1.0)),
            ..base
        },
        ChatRole::ToolCall => Look {
            label: "Tool call",
            outline: Some("accent3"),
            code: true,
            ..base
        },
        ChatRole::ToolResult => Look {
            label: "Tool result",
            fill: Some(("accent4", 0.18)),
            code: true,
            ..base
        },
    }
}

/// What a message says: a tool call is shown as `→ name(args)`.
fn said(role: &ChatRole, text: &str) -> String {
    match role {
        ChatRole::ToolCall if !text.trim_start().starts_with('→') => format!("→ {text}"),
        _ => text.to_owned(),
    }
}

/// The size of the role label: smaller than the words, in half points.
fn label_size(size: f64) -> f64 {
    ((size * 0.72 * 2.0).round() / 2.0).max(9.0)
}

/// One message: what it says, how it looks, and how wide its bubble is.
struct Bubble {
    look: Look,
    text: String,
    x: f64,
    w: f64,
}

impl Bubble {
    fn height(&self, size: f64) -> f64 {
        let face = if self.look.code {
            Face::Mono
        } else {
            Face::Sans
        };
        let lines = line_count(&self.text, self.w - 2.0 * PAD_X, size, face, false);
        let label = points_to_units(label_size(size) * LABEL_LINE + LABEL_GAP);
        2.0 * PAD_Y + label + lines as f64 * points_to_units(size * LINE)
    }
}

fn total(bubbles: &[Bubble], size: f64) -> f64 {
    let heights: f64 = bubbles.iter().map(|b| b.height(size)).sum();
    heights + GAP * bubbles.len().saturating_sub(1) as f64
}

fn style_of(look: &Look) -> Style {
    let base = match (look.fill, look.outline) {
        (Some((color, alpha)), _) if alpha < 1.0 => faded(color, alpha),
        (Some((color, _)), _) => filled(color),
        (None, Some(color)) => outlined(color, 1.5),
        (None, None) => Style::default(),
    };
    base.radius(RADIUS)
}

pub fn expand(cx: &Ctx, element: &ChatEl) -> Vec<Element> {
    let rect = sane(cx.rect);
    let bubbles: Vec<Bubble> = element
        .messages
        .iter()
        .map(|m| {
            let look = look(&m.role);
            let w = if look.full_width {
                rect.w
            } else {
                rect.w * SHARE
            };
            let x = if look.on_right {
                right(rect) - w
            } else {
                rect.x
            };
            Bubble {
                text: said(&m.role, &m.text),
                look,
                x,
                w,
            }
        })
        .collect();
    if bubbles.is_empty() {
        return Vec::new();
    }
    let size = fit_pt(CAP_PT, FLOOR_PT, |pt| total(&bubbles, pt) <= rect.h);
    // Past the box at the smallest size, the bubbles are still drawn whole.
    let mut parts = if total(&bubbles, size) <= rect.h + 0.01 {
        Parts::new(cx.id, rect)
    } else {
        Parts::unbounded(cx.id)
    };
    let space = insets(
        PAD_X - CORNER,
        PAD_Y - CORNER,
        PAD_X - CORNER,
        PAD_Y - CORNER,
    );
    let mut y = rect.y;
    for bubble in &bubbles {
        let h = bubble.height(size);
        let look = &bubble.look;
        let (face, style) = if look.code {
            ("code", "code")
        } else {
            ("body", "body")
        };
        let label = para(vec![
            run(look.label, label_size(size)).color(look.label_ink),
        ])
        .style("caption")
        .spacing(LABEL_LINE)
        .after(LABEL_GAP);
        let words = para(vec![
            run(shown(&bubble.text), size).color(look.ink).font(face),
        ])
        .style(style)
        .spacing(LINE)
        .after(0.0);
        let text = text_of(vec![label, words], VAlign::Top, space.clone());
        let r = Rect {
            x: bubble.x,
            y,
            w: bubble.w,
            h,
        };
        parts.shape("roundRect", r, style_of(look), Some(text));
        y += h + GAP;
    }
    parts.finish()
}

#[cfg(test)]
mod tests;
