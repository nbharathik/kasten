//! Embedded page: a live web page in present mode, a picture and a link everywhere else.
//!
//! With a poster the box is that picture. Without one it is a dashed panel
//! that says what the page is: a small globe, the page's title (or the site's
//! name), and its address in the code font. Every part carries the address as its
//! link, so clicking the slide in PowerPoint opens the page.

use super::Ctx;
use super::build::{
    ParaExt, Parts, RunExt, StyleExt, filled, insets, outlined, para, run, text_of,
};
use super::geom::{pad, sane};
use super::measure::{Face, MONO_EM, columns, fit_pt, line_count};
use super::media::{RADIUS, READABLE, addressed, host_of, middle, still, web_address};
use crate::model::{Align, Element, EmbedEl, VAlign};
use crate::resolve::Rect;
use crate::units::points_to_units;

const TITLE_CAP: f64 = 24.0;
const TITLE_FLOOR: f64 = 12.0;
/// The most lines an address takes; longer ones are cut in the middle.
const URL_LINES: usize = 2;

/// The words a person who cannot see the embedded page is told.
pub fn alt_of(element: &EmbedEl) -> String {
    format!("Web page: {}", title_of(element, &element.url))
}

fn title_of(element: &EmbedEl, fallback: &str) -> String {
    element
        .title
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map_or_else(|| fallback.to_owned(), str::to_owned)
}

/// The address the parts link to, if it is one that is safe to link.
pub fn link_of(element: &EmbedEl) -> Option<&str> {
    web_address(&element.url)
}

/// What is inside the panel at a size of the title, in units: the space it takes and its parts.
struct Stack {
    icon: f64,
    title: f64,
    url: f64,
    url_text: String,
    gap: f64,
}

/// The size of the address under a title of `size` points on a panel with no room for readable
/// words: about half the title's.
fn compact_url(size: f64) -> f64 {
    ((size * 0.55 * 2.0).round() / 2.0).clamp(9.0, 13.0)
}

fn stack(inner: Rect, size: f64, small: f64, title: &str, url: &str, icon: f64) -> Stack {
    let per_line = ((inner.w / (MONO_EM * points_to_units(small) * 1.01)).floor() as usize).max(3);
    let url_text = middle(url, per_line * URL_LINES);
    let url_lines = columns(&url_text).div_ceil(per_line).max(1);
    let title_lines = line_count(title, inner.w, size, Face::Sans, true);
    let gap = points_to_units(size * 0.5);
    Stack {
        icon,
        title: title_lines as f64 * points_to_units(size * 1.2),
        url: url_lines as f64 * points_to_units(small * 1.25),
        url_text,
        gap,
    }
}

/// The sizes, in points, of the title and of the address. Where the panel has room the address
/// is set at [`READABLE`] and the title at that or bigger, up to `TITLE_CAP`. A panel too small
/// for that gets both smaller, the address at about half the title, so that they still fit.
fn sizes(inner: Rect, title: &str, url: &str, icon: f64) -> (f64, f64) {
    let fits =
        |size: f64, small: f64| stack(inner, size, small, title, url, icon).height() <= inner.h;
    let readable = fit_pt(TITLE_CAP, READABLE, |size| fits(size, READABLE));
    if fits(readable, READABLE) {
        return (readable, READABLE);
    }
    let size = fit_pt(TITLE_CAP, TITLE_FLOOR, |size| fits(size, compact_url(size)));
    (size, compact_url(size))
}

impl Stack {
    fn height(&self) -> f64 {
        let icon = if self.icon > 0.0 {
            self.icon + self.gap * 1.5
        } else {
            0.0
        };
        icon + self.title + self.gap + self.url
    }
}

pub fn expand(cx: &Ctx, element: &EmbedEl) -> Vec<Element> {
    let rect = sane(cx.rect);
    let mut parts = Parts::new(cx.id, rect);
    let poster = element
        .poster
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty());
    if let Some(src) = poster {
        parts.image(rect, src, None);
        let mut done = parts.finish();
        if let Some(picture) = done.first_mut() {
            still(picture);
        }
        return addressed(done, link_of(element), &alt_of(element));
    }

    let panel = filled("bg2")
        .radius(RADIUS)
        .stroke("text2", 1.5)
        .stroke_alpha(0.6)
        .dashed();
    parts.shape("roundRect", rect, panel, None);
    let inner = pad(
        rect,
        (rect.w * 0.05).clamp(8.0, 24.0),
        (rect.h * 0.06).clamp(6.0, 20.0),
    );
    let title = title_of(element, &host_of(&element.url));
    let url = element.url.trim();

    // A globe over the words when the panel is big enough to have room for it.
    let globe = (inner.h * 0.22).clamp(24.0, 48.0);
    let with_icon = inner.h >= 130.0 && inner.w >= 140.0 && {
        let (size, small) = sizes(inner, &title, url, globe);
        stack(inner, size, small, &title, url, globe).height() <= inner.h
    };
    let icon = if with_icon { globe } else { 0.0 };
    let (size, small) = sizes(inner, &title, url, icon);
    let layout = stack(inner, size, small, &title, url, icon);

    let mut y = inner.y + ((inner.h - layout.height()) / 2.0).max(0.0);
    if with_icon {
        let x = inner.x + (inner.w - globe) / 2.0;
        let ink = |style: crate::model::Style| style.stroke_alpha(0.8);
        parts.shape(
            "ellipse",
            Rect {
                x,
                y,
                w: globe,
                h: globe,
            },
            ink(outlined("text2", 1.75)),
            None,
        );
        parts.shape(
            "ellipse",
            Rect {
                x: x + globe * 0.25,
                y,
                w: globe * 0.5,
                h: globe,
            },
            ink(outlined("text2", 1.25)),
            None,
        );
        parts.line(
            Rect {
                x,
                y: y + globe / 2.0,
                w: globe,
                h: 0.0,
            },
            ink(outlined("text2", 1.25)),
        );
        y += globe + layout.gap * 1.5;
    } else {
        for _ in 0..3 {
            parts.skip();
        }
    }
    let flat = insets(0.0, 0.0, 0.0, 0.0);
    let name = para(vec![
        run(&title, size).bold().font("heading").color("text1"),
    ])
    .style("body")
    .spacing(1.2)
    .after(0.0)
    .align(Align::Center);
    parts.text(
        Rect {
            x: inner.x,
            y,
            w: inner.w,
            h: layout.title,
        },
        text_of(vec![name], VAlign::Top, flat.clone()),
    );
    y += layout.title + layout.gap;
    let address = para(vec![
        run(&layout.url_text, small).font("code").color("text2"),
    ])
    .style("code")
    .spacing(1.25)
    .align(Align::Center);
    parts.text(
        Rect {
            x: inner.x,
            y,
            w: inner.w,
            h: layout.url,
        },
        text_of(vec![address], VAlign::Top, flat),
    );
    addressed(parts.finish(), link_of(element), &alt_of(element))
}

#[cfg(test)]
mod tests;
