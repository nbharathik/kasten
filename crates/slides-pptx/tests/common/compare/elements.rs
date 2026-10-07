//! Comparing the elements of two slides: the same kinds in the same order,
//! in the same places, looking the same, saying the same.

use slides_core::resolve::box_of;
use slides_core::{Deck, Element, Slide, VAlign};

use super::table::compare_table;
use super::text::{self, Side, box_style};
use super::{Diff, style};

/// The medium for what a deck names pictures by.
pub type Media<'a> = &'a dyn Fn(&str) -> Option<Vec<u8>>;

/// Two slides being compared, each with its deck.
pub struct Pair<'a> {
    pub a: (&'a Deck, &'a Slide),
    pub b: (&'a Deck, &'a Slide),
    pub index_a: &'a dyn Fn(&str) -> Option<usize>,
    pub index_b: &'a dyn Fn(&str) -> Option<usize>,
    pub media_a: Media<'a>,
    pub media_b: Media<'a>,
}

const POSITION: f64 = 0.5;

fn near(a: f64, b: f64, tolerance: f64) -> bool {
    (a - b).abs() <= tolerance
}

fn turn_between(a: f64, b: f64) -> f64 {
    let d = (a - b).rem_euclid(360.0);
    d.min(360.0 - d)
}

/// What the exporter is expected to have written, from what the deck holds: things that
/// cannot be written are gone, a picture stands for what could not be understood.
pub fn expected(list: &[Element]) -> Vec<Element> {
    let mut out = Vec::new();
    for e in list {
        match e {
            Element::Raw(r) => {
                if let Some(preview) = r.preview.as_deref().filter(|p| !p.trim().is_empty()) {
                    out.push(Element::Image(slides_core::ImageEl {
                        base: r.base.clone(),
                        src: preview.to_owned(),
                        crop: None,
                        mask: None,
                        extra: slides_core::Extra::new(),
                    }));
                }
            }
            Element::Image(i) if i.src.trim().is_empty() => {}
            Element::Text(t)
                if t.base.placeholder.is_some()
                    && t.text.is_blank()
                    && t.base
                        .style
                        .as_ref()
                        .is_none_or(|s| s.fill.is_none() && s.stroke.is_none()) => {}
            Element::Group(g) => {
                let children = expected(&g.children);
                if !children.is_empty() {
                    let mut group = g.clone();
                    group.children = children;
                    out.push(Element::Group(group));
                }
            }
            other => out.push(other.clone()),
        }
    }
    out
}

fn flat<'a>(list: &'a [Element], out: &mut Vec<&'a Element>) {
    for e in list {
        out.push(e);
        flat(e.children(), out);
    }
}

fn index_in(list: &[Element], id: &str) -> Option<usize> {
    let mut all = Vec::new();
    flat(list, &mut all);
    all.iter().position(|e| e.id() == id)
}

/// Compares two lists of elements, the first as the exporter should have written it.
pub fn compare_lists(
    diff: &mut Diff,
    at: &str,
    pair: &Pair,
    list_a: &[Element],
    list_b: &[Element],
) {
    if list_a.len() != list_b.len() {
        let kinds = |l: &[Element]| l.iter().map(Element::kind).collect::<Vec<_>>().join(",");
        diff.note(
            at,
            format!(
                "{} elements ({}) became {} ({})",
                list_a.len(),
                kinds(list_a),
                list_b.len(),
                kinds(list_b)
            ),
        );
        return;
    }
    for (n, (ea, eb)) in list_a.iter().zip(list_b).enumerate() {
        compare_one(
            diff,
            &format!("{at}/{n}:{}", ea.kind()),
            pair,
            ea,
            eb,
            list_a,
            list_b,
        );
    }
}

fn compare_one(
    diff: &mut Diff,
    at: &str,
    pair: &Pair,
    a: &Element,
    b: &Element,
    list_a: &[Element],
    list_b: &[Element],
) {
    let like = |k: &str| matches!(k, "line" | "connector");
    if a.kind() != b.kind() && !(like(a.kind()) && like(b.kind())) {
        diff.note(at, format!("a {} came back as a {}", a.kind(), b.kind()));
        return;
    }
    let (ba, bb) = (a.base(), b.base());
    if !matches!(a, Element::Group(_)) {
        match (
            box_of(&pair.a.0.theme, pair.a.1, a),
            box_of(&pair.b.0.theme, pair.b.1, b),
        ) {
            (Some(ra), Some(rb)) => {
                for (name, x, y) in [
                    ("x", ra.x, rb.x),
                    ("y", ra.y, rb.y),
                    ("w", ra.w, rb.w),
                    ("h", ra.h, rb.h),
                ] {
                    if !near(x, y, POSITION) && !matches!(a, Element::Table(_)) {
                        diff.note(at, format!("{name} {x} came back as {y}"));
                    }
                }
            }
            (ra, rb) => diff.note(at, format!("box {ra:?} came back as {rb:?}")),
        }
        if turn_between(ba.rotation.unwrap_or(0.0), bb.rotation.unwrap_or(0.0)) > 0.1 {
            diff.note(
                at,
                format!("rotation {:?} came back as {:?}", ba.rotation, bb.rotation),
            );
        }
        if (ba.flip_h, ba.flip_v) != (bb.flip_h, bb.flip_v) {
            diff.note(
                at,
                format!(
                    "flips {:?} came back as {:?}",
                    (ba.flip_h, ba.flip_v),
                    (bb.flip_h, bb.flip_v)
                ),
            );
        }
    }
    if ba.placeholder != bb.placeholder {
        diff.note(
            at,
            format!(
                "slot {:?} came back as {:?}",
                ba.placeholder, bb.placeholder
            ),
        );
    }
    if ba.name != bb.name || ba.alt != bb.alt {
        diff.note(
            at,
            format!(
                "name/alt {:?}/{:?} came back as {:?}/{:?}",
                ba.name, ba.alt, bb.name, bb.alt
            ),
        );
    }
    let link = |l: &Option<String>, index: &dyn Fn(&str) -> Option<usize>| {
        l.as_ref().map(|l| match l.strip_prefix("slide:") {
            Some(id) => format!("slide#{:?}", index(id)),
            None => l.clone(),
        })
    };
    if link(&ba.link, pair.index_a) != link(&bb.link, pair.index_b) {
        diff.note(at, format!("link {:?} came back as {:?}", ba.link, bb.link));
    }
    if !matches!(a, Element::Group(_) | Element::Table(_)) {
        style::compare(diff, at, (pair.a.0, a), (pair.b.0, b));
    }
    match (a, b) {
        (Element::Text(ta), Element::Text(tb)) => {
            let slot_valign = |deck: &Deck, slide: &Slide, e: &Element| {
                slides_core::resolve::placeholder_of(&deck.theme, slide, e)
                    .and_then(|s| s.valign.clone())
                    .unwrap_or(VAlign::Top)
            };
            let (base_a, base_b) = (
                box_style(pair.a.0, pair.a.1, a, false),
                box_style(pair.b.0, pair.b.1, b, false),
            );
            text::compare(
                diff,
                at,
                &Side {
                    deck: pair.a.0,
                    text: &ta.text,
                    base: &base_a,
                    valign: slot_valign(pair.a.0, pair.a.1, a),
                    index_of: pair.index_a,
                },
                &Side {
                    deck: pair.b.0,
                    text: &tb.text,
                    base: &base_b,
                    valign: slot_valign(pair.b.0, pair.b.1, b),
                    index_of: pair.index_b,
                },
            );
        }
        (Element::Shape(sa), Element::Shape(sb)) => {
            if sa.shape != sb.shape {
                diff.note(at, format!("shape {} came back as {}", sa.shape, sb.shape));
            }
            match (&sa.text, &sb.text) {
                (Some(x), Some(y)) if !x.is_blank() || !y.is_blank() => text::compare(
                    diff,
                    at,
                    &Side {
                        deck: pair.a.0,
                        text: x,
                        base: "body",
                        valign: VAlign::Middle,
                        index_of: pair.index_a,
                    },
                    &Side {
                        deck: pair.b.0,
                        text: y,
                        base: "body",
                        valign: VAlign::Middle,
                        index_of: pair.index_b,
                    },
                ),
                (Some(x), None) | (None, Some(x)) if !x.is_blank() => {
                    diff.note(at, "the words of a shape were lost or made up".to_owned())
                }
                _ => {}
            }
        }
        (Element::Line(la), Element::Line(lb)) => {
            let route = |r: &Option<slides_core::Route>| {
                r.clone().filter(|r| *r != slides_core::Route::Straight)
            };
            if route(&la.route) != route(&lb.route) {
                diff.note(
                    at,
                    format!("route {:?} came back as {:?}", la.route, lb.route),
                );
            }
        }
        (Element::Connector(ca), Element::Connector(cb)) => {
            if ca.route != cb.route {
                diff.note(
                    at,
                    format!("route {:?} came back as {:?}", ca.route, cb.route),
                );
            }
            for (name, x, y) in [("from", &ca.from, &cb.from), ("to", &ca.to, &cb.to)] {
                let placed = |anchor: &Option<slides_core::Anchor>, list: &[Element]| {
                    anchor
                        .as_ref()
                        .map(|a| (index_in(list, &a.el), a.side.clone()))
                };
                if placed(x, list_a) != placed(y, list_b) {
                    diff.note(at, format!("{name} {x:?} came back as {y:?}"));
                }
            }
            if let (Some(x), Some(y)) = (&ca.label, &cb.label) {
                // The exporter centres a label's words unless they say otherwise.
                let mut x = x.clone();
                for p in &mut x.paragraphs {
                    p.align.get_or_insert(slides_core::Align::Center);
                }
                let x = &x;
                text::compare(
                    diff,
                    at,
                    &Side {
                        deck: pair.a.0,
                        text: x,
                        base: "caption",
                        valign: VAlign::Middle,
                        index_of: pair.index_a,
                    },
                    &Side {
                        deck: pair.b.0,
                        text: y,
                        base: "caption",
                        valign: VAlign::Middle,
                        index_of: pair.index_b,
                    },
                );
            } else if ca.label.as_ref().is_some_and(|l| !l.is_blank()) != cb.label.is_some() {
                diff.note(at, "a connector's label was lost or made up".to_owned());
            }
        }
        (Element::Image(ia), Element::Image(ib)) => {
            if ia.mask != ib.mask
                && !(ia.mask.is_none() && ib.mask == Some(slides_core::Mask::Rect))
            {
                diff.note(at, format!("mask {:?} came back as {:?}", ia.mask, ib.mask));
            }
            let crop = |c: &Option<slides_core::Crop>| {
                c.as_ref().map(|c| {
                    [c.left, c.top, c.right, c.bottom].map(|v| (v * 1000.0).round() as i64)
                })
            };
            // A picture that covers its box (a poster) goes out cut to the shape of the box, so it comes back with that crop.
            if !ia.covers() && crop(&ia.crop) != crop(&ib.crop) {
                diff.note(at, format!("crop {:?} came back as {:?}", ia.crop, ib.crop));
            }
            let (bytes_a, bytes_b) = ((pair.media_a)(&ia.src), (pair.media_b)(&ib.src));
            if bytes_a.is_none() || bytes_a != bytes_b {
                diff.note(
                    at,
                    format!(
                        "the picture {} came back as {} with different or no bytes",
                        ia.src, ib.src
                    ),
                );
            }
        }
        (Element::Group(ga), Element::Group(gb)) => {
            compare_lists(diff, at, pair, &ga.children, &gb.children);
        }
        (Element::Table(ta), Element::Table(tb)) => {
            compare_table(
                diff,
                at,
                pair,
                ta,
                tb,
                ba.w.or(box_of(&pair.a.0.theme, pair.a.1, a).map(|r| r.w))
                    .unwrap_or(1.0),
            );
        }
        _ => {}
    }
}
