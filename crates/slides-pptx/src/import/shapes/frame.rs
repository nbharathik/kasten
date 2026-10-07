//! Where a shape is: its box, turn and mirroring, and how the transforms of the groups
//! around it carry them onto the slide. A group maps its own child space (`chOff`,
//! `chExt`) onto a box of its own, and may itself be turned and mirrored.

use crate::import::dom::Node;
use crate::import::units::{degrees, length, position, round2, snapped};

/// A shape's place, in slide units.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frame {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    /// Degrees clockwise, in `0..360`.
    pub rot: f64,
    pub flip_h: bool,
    pub flip_v: bool,
}

impl Frame {
    pub fn centre(&self) -> (f64, f64) {
        (self.x + self.w / 2.0, self.y + self.h / 2.0)
    }
}

/// The transform of one group: where its children's space lands.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GroupXf {
    pub frame: Frame,
    pub child_off: (f64, f64),
    pub child_ext: (f64, f64),
}

/// Reads an `a:xfrm` (or `p:xfrm`).
pub fn read(xfrm: &Node) -> Option<Frame> {
    let off = xfrm.child("a:off")?;
    let ext = xfrm.child("a:ext")?;
    Some(Frame {
        x: snapped(position(off.int("x")?)),
        y: snapped(position(off.int("y")?)),
        w: snapped(length(ext.int("cx")?)),
        h: snapped(length(ext.int("cy")?)),
        rot: xfrm.int("rot").map_or(0.0, degrees),
        flip_h: xfrm.flag("flipH").unwrap_or(false),
        flip_v: xfrm.flag("flipV").unwrap_or(false),
    })
}

/// Reads a group's transform.
pub fn read_group(xfrm: &Node) -> Option<GroupXf> {
    let frame = read(xfrm)?;
    let pair = |name: &str, a: &str, b: &str| {
        let n = xfrm.child(name)?;
        Some((n.int(a)?, n.int(b)?))
    };
    let (cx, cy) = pair("a:chOff", "x", "y").unwrap_or((0, 0));
    let (ew, eh) = pair("a:chExt", "cx", "cy").unwrap_or((0, 0));
    let child_off = (snapped(position(cx)), snapped(position(cy)));
    // A group with no child space of its own maps its children onto itself.
    let child_ext = if ew > 0 && eh > 0 {
        (snapped(length(ew)), snapped(length(eh)))
    } else {
        (frame.w, frame.h)
    };
    Some(GroupXf {
        frame,
        child_off: if ew > 0 && eh > 0 {
            child_off
        } else {
            (frame.x, frame.y)
        },
        child_ext,
    })
}

/// A frame in a group's child space, carried onto the space the group stands in.
pub fn through(group: &GroupXf, f: Frame) -> Frame {
    let g = group.frame;
    let sx = if group.child_ext.0 > 0.0 {
        g.w / group.child_ext.0
    } else {
        1.0
    };
    let sy = if group.child_ext.1 > 0.0 {
        g.h / group.child_ext.1
    } else {
        1.0
    };
    let (cx, cy) = f.centre();
    let mut centre = (
        g.x + (cx - group.child_off.0) * sx,
        g.y + (cy - group.child_off.1) * sy,
    );
    let (w, h) = (f.w * sx, f.h * sy);
    let mut rot = f.rot;
    let (mut flip_h, mut flip_v) = (f.flip_h, f.flip_v);
    if g.rot != 0.0 || g.flip_h || g.flip_v {
        // About the group's centre: mirror, then turn.
        let (gx, gy) = g.centre();
        let (mut dx, mut dy) = (centre.0 - gx, centre.1 - gy);
        if g.flip_h {
            dx = -dx;
        }
        if g.flip_v {
            dy = -dy;
        }
        let (sin, cos) = g.rot.to_radians().sin_cos();
        centre = (gx + dx * cos - dy * sin, gy + dx * sin + dy * cos);
        // A mirror across one axis turns the child's own turn the other way.
        let sign = if g.flip_h != g.flip_v { -1.0 } else { 1.0 };
        rot = (g.rot + sign * f.rot).rem_euclid(360.0);
        flip_h ^= g.flip_h;
        flip_v ^= g.flip_v;
    }
    Frame {
        x: round2(centre.0 - w / 2.0),
        y: round2(centre.1 - h / 2.0),
        w: round2(w),
        h: round2(h),
        rot: (rot * 1000.0).round() / 1000.0 % 360.0,
        flip_h,
        flip_v,
    }
}

/// A line turned half way round is the same line mirrored both ways; a line has no words to turn, so
/// it is written the second way.
pub fn half_turn_as_flips(f: Frame) -> Frame {
    if (f.rot - 180.0).abs() < 0.01 {
        Frame {
            rot: 0.0,
            flip_h: !f.flip_h,
            flip_v: !f.flip_v,
            ..f
        }
    } else {
        f
    }
}

/// A frame carried out through a stack of groups, the innermost last in `groups`.
pub fn place(groups: &[GroupXf], frame: Frame) -> Frame {
    groups.iter().rev().fold(frame, |f, g| through(g, f))
}

#[cfg(test)]
mod tests;
