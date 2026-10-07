//! Boxes: the arithmetic the geometric rules share.

use crate::resolve::Rect;

/// The upright box that holds `r` turned by `degrees` about its centre.
pub fn turned(r: Rect, degrees: f64) -> Rect {
    if degrees.rem_euclid(360.0) == 0.0 {
        return r;
    }
    let t = degrees.to_radians();
    let (sin, cos) = (t.sin().abs(), t.cos().abs());
    let (cx, cy) = (r.x + r.w / 2.0, r.y + r.h / 2.0);
    let (w, h) = (r.w * cos + r.h * sin, r.w * sin + r.h * cos);
    Rect {
        x: cx - w / 2.0,
        y: cy - h / 2.0,
        w,
        h,
    }
}

/// The smallest box that holds both.
pub fn union(a: Rect, b: Rect) -> Rect {
    let x = a.x.min(b.x);
    let y = a.y.min(b.y);
    Rect {
        x,
        y,
        w: (a.x + a.w).max(b.x + b.w) - x,
        h: (a.y + a.h).max(b.y + b.h) - y,
    }
}

pub fn right(r: Rect) -> f64 {
    r.x + r.w
}

pub fn bottom(r: Rect) -> f64 {
    r.y + r.h
}

/// The width and height of what two boxes share; both are 0 or less when they
/// do not overlap.
pub fn shared(a: Rect, b: Rect) -> (f64, f64) {
    (
        right(a).min(right(b)) - a.x.max(b.x),
        bottom(a).min(bottom(b)) - a.y.max(b.y),
    )
}

/// Whether `outer` holds `inner`, give or take `slack` units on each side.
pub fn contains(outer: Rect, inner: Rect, slack: f64) -> bool {
    inner.x >= outer.x - slack
        && inner.y >= outer.y - slack
        && right(inner) <= right(outer) + slack
        && bottom(inner) <= bottom(outer) + slack
}

/// Whether the point is inside the box.
pub fn holds_point(r: Rect, x: f64, y: f64) -> bool {
    x >= r.x && x <= right(r) && y >= r.y && y <= bottom(r)
}

/// A number for a message: whole when it is, else one decimal.
pub fn units(v: f64) -> String {
    let rounded = (v * 10.0).round() / 10.0;
    if rounded.fract() == 0.0 {
        format!("{rounded:.0}")
    } else {
        format!("{rounded:.1}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const fn r(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect { x, y, w, h }
    }

    #[test]
    fn a_quarter_turn_swaps_width_and_height_about_the_centre() {
        let t = turned(r(0.0, 0.0, 100.0, 50.0), 90.0);
        assert!((t.w - 50.0).abs() < 1e-9 && (t.h - 100.0).abs() < 1e-9);
        assert_eq!(turned(r(1.0, 2.0, 3.0, 4.0), 360.0), r(1.0, 2.0, 3.0, 4.0));
    }

    #[test]
    fn boxes_share_and_contain() {
        assert_eq!(
            shared(r(0.0, 0.0, 10.0, 10.0), r(6.0, 4.0, 10.0, 10.0)),
            (4.0, 6.0)
        );
        assert!(shared(r(0.0, 0.0, 10.0, 10.0), r(20.0, 0.0, 10.0, 10.0)).0 < 0.0);
        assert!(contains(
            r(0.0, 0.0, 100.0, 100.0),
            r(10.0, 10.0, 20.0, 20.0),
            0.0
        ));
        assert!(!contains(
            r(0.0, 0.0, 100.0, 100.0),
            r(90.0, 10.0, 20.0, 20.0),
            1.0
        ));
        assert_eq!(
            union(r(0.0, 0.0, 10.0, 10.0), r(20.0, 5.0, 10.0, 10.0)),
            r(0.0, 0.0, 30.0, 15.0)
        );
    }

    #[test]
    fn numbers_in_messages_are_short() {
        assert_eq!(units(24.0), "24");
        assert_eq!(units(24.04), "24");
        assert_eq!(units(3.25), "3.3");
    }
}
