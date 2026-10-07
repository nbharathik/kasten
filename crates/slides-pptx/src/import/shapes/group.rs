//! `p:grpSp`: a group. Its children are carried onto the slide through the
//! group's transform, so the group in the deck holds them in slide coordinates.

use slides_core::{Element, Extra, GroupEl, Style};

use super::base::{base_of, nv_of};
use super::frame::{self, Frame};
use crate::import::cx::Cx;
use crate::import::dom::Node;

/// The upright box round a box turned by `degrees` about its centre.
fn turned(x: f64, y: f64, w: f64, h: f64, degrees: f64) -> (f64, f64, f64, f64) {
    if degrees % 360.0 == 0.0 {
        return (x, y, w, h);
    }
    let (sin, cos) = degrees.to_radians().sin_cos();
    let (sin, cos) = (sin.abs(), cos.abs());
    let (cx, cy) = (x + w / 2.0, y + h / 2.0);
    let (tw, th) = (w * cos + h * sin, w * sin + h * cos);
    (cx - tw / 2.0, cy - th / 2.0, tw, th)
}

/// The smallest box that holds all the children, as they are turned.
fn around(children: &[Element]) -> Option<(f64, f64, f64, f64)> {
    let mut found: Option<(f64, f64, f64, f64)> = None;
    for child in children {
        let b = child.base();
        let Some((x, y, w, h)) = b.rect() else {
            continue;
        };
        let (x, y, w, h) = turned(x, y, w, h, b.rotation.unwrap_or(0.0));
        found = Some(match found {
            None => (x, y, w, h),
            Some((fx, fy, fw, fh)) => {
                let left = fx.min(x);
                let top = fy.min(y);
                (
                    left,
                    top,
                    (fx + fw).max(x + w) - left,
                    (fy + fh).max(y + h) - top,
                )
            }
        });
    }
    found
}

pub fn convert(cx: &mut Cx, grp: &Node, out: &mut Vec<Element>) {
    let nv = nv_of(grp.at(&["p:nvGrpSpPr", "p:cNvPr"]));
    let transform = grp.at(&["p:grpSpPr", "a:xfrm"]).and_then(frame::read_group);
    let pushed = transform.is_some();
    if let Some(t) = transform {
        cx.groups.push(t);
    }
    let children = super::children(cx, grp);
    if pushed {
        cx.groups.pop();
    }
    if children.is_empty() {
        return;
    }
    let frame = around(&children).map(|(x, y, w, h)| Frame {
        x: crate::import::units::round2(x),
        y: crate::import::units::round2(y),
        w: crate::import::units::round2(w),
        h: crate::import::units::round2(h),
        rot: 0.0,
        flip_h: false,
        flip_v: false,
    });
    let base = base_of(cx, &nv, frame.as_ref(), None, Style::default());
    out.push(Element::Group(GroupEl {
        base,
        children,
        extra: Extra::new(),
    }));
}
