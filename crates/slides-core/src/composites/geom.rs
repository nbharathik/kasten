//! Boxes for expansions. Every part of a composite is placed with these, so it
//! lies inside the composite's box however small, odd or huge that box is.

use crate::resolve::Rect;

/// The largest coordinate an expansion works with. A box beyond it is a mistake, not a slide.
const LIMIT: f64 = 1.0e6;

fn finite(v: f64) -> f64 {
    if v.is_finite() {
        v.clamp(-LIMIT, LIMIT)
    } else {
        0.0
    }
}

/// Two decimals: enough for a position, and short in the file.
pub fn round2(v: f64) -> f64 {
    let r = (finite(v) * 100.0).round() / 100.0;
    // Negative zero would be written as `-0`.
    if r == 0.0 { 0.0 } else { r }
}

/// A box with finite numbers and a size that is not negative.
pub fn sane(r: Rect) -> Rect {
    Rect {
        x: finite(r.x),
        y: finite(r.y),
        w: finite(r.w).max(0.0),
        h: finite(r.h).max(0.0),
    }
}

/// `r` shrunk by `l`, `t`, `rt` and `b` on its sides. Squeezed to nothing, it
/// collapses to a line or a point inside `r` instead of turning inside out.
pub fn inset(r: Rect, l: f64, t: f64, rt: f64, b: f64) -> Rect {
    let r = sane(r);
    let (l, t, rt, b) = (l.max(0.0), t.max(0.0), rt.max(0.0), b.max(0.0));
    let w = (r.w - l - rt).max(0.0);
    let h = (r.h - t - b).max(0.0);
    Rect {
        x: r.x + l.min(r.w - w),
        y: r.y + t.min(r.h - h),
        w,
        h,
    }
}

/// `r` shrunk by `dx` on the left and right and `dy` at the top and bottom.
pub fn pad(r: Rect, dx: f64, dy: f64) -> Rect {
    inset(r, dx, dy, dx, dy)
}

/// The right edge.
pub fn right(r: Rect) -> f64 {
    r.x + r.w
}

/// The middle of the box.
pub fn middle(r: Rect) -> (f64, f64) {
    (r.x + r.w / 2.0, r.y + r.h / 2.0)
}

/// `r` cut down to the part that lies inside `outer`.
pub fn within(r: Rect, outer: Rect) -> Rect {
    let (r, outer) = (sane(r), sane(outer));
    let edge = |lo: f64, size: f64, from: f64, span: f64| {
        let a = lo.clamp(from, from + span);
        let b = (lo + size).clamp(from, from + span);
        (a, b - a)
    };
    let (x, w) = edge(r.x, r.w, outer.x, outer.w);
    let (y, h) = edge(r.y, r.h, outer.y, outer.h);
    Rect { x, y, w, h }
}

/// `r` with every number rounded to two decimals, by its edges so neighbours still meet.
pub fn snap(r: Rect) -> Rect {
    let r = sane(r);
    let (x0, x1) = (round2(r.x), round2(r.x + r.w));
    let (y0, y1) = (round2(r.y), round2(r.y + r.h));
    // The difference of two hundredths is a hundredth again, up to the noise of the arithmetic.
    Rect {
        x: x0,
        y: y0,
        w: round2(x1 - x0).max(0.0),
        h: round2(y1 - y0).max(0.0),
    }
}

/// Whether `r` lies inside `outer`, allowing for the rounding of a hundredth.
#[cfg(test)]
pub fn is_inside(r: Rect, outer: Rect) -> bool {
    let slack = 0.011;
    r.x >= outer.x - slack
        && r.y >= outer.y - slack
        && right(r) <= right(outer) + slack
        && r.y + r.h <= outer.y + outer.h + slack
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect { x, y, w, h }
    }

    #[test]
    fn a_box_is_made_finite_and_not_negative() {
        let bad = sane(r(f64::NAN, f64::INFINITY, -5.0, f64::NEG_INFINITY));
        assert_eq!((bad.x, bad.y, bad.w, bad.h), (0.0, 0.0, 0.0, 0.0));
        let huge = sane(r(1.0e12, -1.0e12, 5.0, 5.0));
        assert_eq!((huge.x, huge.y), (1.0e6, -1.0e6));
    }

    #[test]
    fn insetting_keeps_the_middle_and_never_turns_inside_out() {
        let a = inset(r(10.0, 20.0, 100.0, 50.0), 5.0, 6.0, 7.0, 8.0);
        assert_eq!((a.x, a.y, a.w, a.h), (15.0, 26.0, 88.0, 36.0));
        let squeezed = pad(r(10.0, 20.0, 10.0, 10.0), 30.0, 30.0);
        assert_eq!((squeezed.w, squeezed.h), (0.0, 0.0));
        assert!(is_inside(squeezed, r(10.0, 20.0, 10.0, 10.0)));
    }

    #[test]
    fn a_box_is_cut_to_what_lies_inside_another() {
        let outer = r(0.0, 0.0, 100.0, 100.0);
        let c = within(r(-10.0, 90.0, 50.0, 50.0), outer);
        assert_eq!((c.x, c.y, c.w, c.h), (0.0, 90.0, 40.0, 10.0));
        let away = within(r(500.0, 500.0, 5.0, 5.0), outer);
        assert_eq!((away.w, away.h), (0.0, 0.0));
        assert!(is_inside(away, outer));
    }

    #[test]
    fn snapping_rounds_the_edges_so_neighbours_still_meet() {
        let a = snap(r(0.0, 0.0, 33.333_333, 10.0));
        let b = snap(r(33.333_333, 0.0, 33.333_333, 10.0));
        assert_eq!(right(a), b.x);
        assert_eq!(round2(-0.001).to_string(), "0");
    }
}
