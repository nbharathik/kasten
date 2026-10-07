//! Video: a still with a play button on it.
//!
//! The picture is the poster, or a dark panel when there is none, and a white
//! triangle in a dark, see-through circle sits in the middle. The video itself
//! plays in present mode; everywhere else this is what shows. A video that is a web
//! address links to it from every part, so the slide opens it in PowerPoint; a file
//! in the host's store is not an address, so it gets no link.

use super::Ctx;
use super::build::{ParaExt, Parts, RunExt, StyleExt, faded, filled, insets, para, run, text_of};
use super::geom::{middle, pad, sane};
use super::measure::MONO_EM;
use super::media::{RADIUS, READABLE, addressed, middle as cut, still, web_address};
use crate::model::{Element, VAlign, VideoEl};
use crate::resolve::Rect;
use crate::units::points_to_units;

/// The words a person who cannot see the video is told.
pub const ALT: &str = "Video";

/// The colour behind a video with no still: black, whatever the theme is.
const PANEL: &str = "#0b0d10";
const WHITE: &str = "#ffffff";

/// The address the parts link to, if the source is a web address.
pub fn link_of(element: &VideoEl) -> Option<&str> {
    web_address(&element.src)
}

/// The name of the file or page a source points at: the last part of its path.
fn name_of(src: &str) -> String {
    let path = src.trim().split(['?', '#']).next().unwrap_or("");
    path.rsplit(['/', '\\']).next().unwrap_or(path).to_owned()
}

pub fn expand(cx: &Ctx, element: &VideoEl) -> Vec<Element> {
    let rect = sane(cx.rect);
    let mut parts = Parts::new(cx.id, rect);
    let poster = element
        .poster
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty());
    let has_poster = poster.is_some();
    match poster {
        Some(src) => {
            let picture = parts.image(rect, src, None);
            still(picture);
        }
        None => {
            // A thin light edge keeps the panel from vanishing on a dark slide.
            let panel = filled(PANEL)
                .radius(RADIUS)
                .stroke(WHITE, 1.0)
                .stroke_alpha(0.16);
            parts.shape("roundRect", rect, panel, None);
        }
    }

    // The play button: a circle a quarter of the shorter side, with a triangle pointing right.
    let side = rect.w.min(rect.h);
    let d = (side * 0.24).clamp(32.0, 120.0).min(side * 0.8);
    let (cx_, cy) = middle(rect);
    let circle = Rect {
        x: cx_ - d / 2.0,
        y: cy - d / 2.0,
        w: d,
        h: d,
    };
    parts.shape(
        "ellipse",
        circle,
        faded("#000000", 0.6)
            .stroke(WHITE, (d / 32.0).clamp(1.0, 3.0))
            .stroke_alpha(0.9),
        None,
    );
    // A triangle stands on its base; turned a quarter it points right. Its box is drawn upright,
    // so it is as wide as the arrow is tall. It sits a little right of the middle to look centred.
    let (arrow_w, arrow_h) = (d * 0.42, d * 0.36);
    let tip = parts.shape(
        "triangle",
        Rect {
            x: cx_ + d * 0.05 - arrow_w / 2.0,
            y: cy - arrow_h / 2.0,
            w: arrow_w,
            h: arrow_h,
        },
        filled(WHITE),
        None,
    );
    tip.base_mut().rotation = Some(90.0);

    // The name of the file, along the bottom, when the box is tall enough to have it clear of the button.
    let room = pad(rect, 16.0, 12.0);
    let line = points_to_units(READABLE * 4.0 / 3.0);
    if !has_poster && rect.w >= 120.0 && room.y + room.h - line >= circle.y + circle.h {
        let cols = (room.w / (MONO_EM * points_to_units(READABLE) * 1.01)).floor() as usize;
        let name = cut(&name_of(&element.src), cols.max(3));
        let label = para(vec![run(&name, READABLE).font("code").color("#c9d1d9")]).style("code");
        parts.text(
            Rect {
                x: room.x,
                y: room.y + room.h - line,
                w: room.w,
                h: line,
            },
            text_of(vec![label], VAlign::Bottom, insets(0.0, 0.0, 0.0, 0.0)),
        );
    }
    addressed(parts.finish(), link_of(element), ALT)
}

#[cfg(test)]
mod tests;
