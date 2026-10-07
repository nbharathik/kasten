//! Board geometry: node rectangles, where new cards go and which sides an
//! edge joins. Coordinates are whole pixels and y grows downwards.

use serde_json::Value;

/// A top-left corner.
pub type Point = (i64, i64);

/// A new card for a note: width and height.
pub const CARD: (i64, i64) = (320, 180);
/// A new sticky: width and height.
pub const STICKY: (i64, i64) = (260, 120);
/// Between cards in a grid or a section.
const GAP: i64 = 40;
/// Between what is on a board and what is added below it.
const BELOW: i64 = 80;
/// Cards per grid row.
const COLUMNS: usize = 4;
/// Inside a section around its nodes; its label gets as much again on top.
const PAD: i64 = 40;
/// Numbers far beyond any real board are clamped, so sums cannot overflow.
const LIMIT: i64 = 1 << 40;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Rect {
    pub x: i64,
    pub y: i64,
    pub width: i64,
    pub height: i64,
}

/// A whole number from JSON: fractions round and extremes are clamped.
fn int(value: Option<&Value>) -> Option<i64> {
    let value = value?;
    let n = value.as_i64().or_else(|| {
        value
            .as_f64()
            .filter(|f| f.is_finite())
            .map(|f| f.round() as i64)
    })?;
    Some(n.clamp(-LIMIT, LIMIT))
}

impl Rect {
    /// A node's rectangle, if it has a position; a missing size counts as 0.
    pub fn of(node: &Value) -> Option<Rect> {
        let size = |key: &str| int(node.get(key)).unwrap_or(0).max(0);
        Some(Rect {
            x: int(node.get("x"))?,
            y: int(node.get("y"))?,
            width: size("width"),
            height: size("height"),
        })
    }

    /// A rectangle of `size` at `corner`.
    pub fn at((x, y): Point, (width, height): (i64, i64)) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    pub fn right(self) -> i64 {
        self.x + self.width
    }

    pub fn bottom(self) -> i64 {
        self.y + self.height
    }

    /// The smallest rectangle holding both.
    pub fn union(self, other: Rect) -> Rect {
        let (x, y) = (self.x.min(other.x), self.y.min(other.y));
        Rect {
            x,
            y,
            width: self.right().max(other.right()) - x,
            height: self.bottom().max(other.bottom()) - y,
        }
    }

    /// A section around this rectangle: 40 px on every side and 40 px more
    /// on top for its label.
    pub fn section(self) -> Rect {
        Rect {
            x: self.x - PAD,
            y: self.y - 2 * PAD,
            width: self.width + 2 * PAD,
            height: self.height + 3 * PAD,
        }
    }
}

/// Where content added below a board starts: 80 px under its lowest node,
/// in line with its leftmost one; (0, 0) on an empty board.
pub fn below(nodes: &[Value]) -> Point {
    nodes
        .iter()
        .filter_map(Rect::of)
        .reduce(Rect::union)
        .map_or((0, 0), |all| (all.x, all.bottom() + BELOW))
}

/// Top-left corners for `count` items of `size` in rows of four, 40 px
/// apart, from `origin`.
pub fn grid(origin: Point, count: usize, size: (i64, i64)) -> Vec<Point> {
    (0..count)
        .map(|i| {
            let (column, row) = ((i % COLUMNS) as i64, (i / COLUMNS) as i64);
            (
                origin.0 + column * (size.0 + GAP),
                origin.1 + row * (size.1 + GAP),
            )
        })
        .collect()
}

/// Top-left corners for `count` cards in rows of four inside a new section
/// below `nodes`: the section, its label included, starts where `below`
/// puts new content, so it keeps the same gap and lines up with the
/// leftmost node.
pub fn grid_in_section_below(nodes: &[Value], count: usize) -> Vec<Point> {
    let (x, y) = below(nodes);
    grid((x + PAD, y + 2 * PAD), count, CARD)
}

/// Sections side by side from `origin`, one per count, each holding that
/// many cards in one column: each section's rectangle and its cards' corners.
pub fn columns(origin: Point, counts: &[usize]) -> Vec<(Rect, Vec<Point>)> {
    let mut out = Vec::with_capacity(counts.len());
    let mut left = origin.0;
    for &count in counts {
        let first = (left + PAD, origin.1 + 2 * PAD);
        let cards: Vec<Point> = (0..count as i64)
            .map(|k| (first.0, first.1 + k * (CARD.1 + GAP)))
            .collect();
        let inside = Rect::at(first, (CARD.0, count as i64 * (CARD.1 + GAP) - GAP));
        let section = inside.section();
        left = section.right() + GAP;
        out.push((section, cards));
    }
    out
}

/// The sides an edge from `from` to `to` leaves and enters: the ones that
/// face each other along the axis where the centres are further apart.
pub fn sides(from: Rect, to: Rect) -> (&'static str, &'static str) {
    // Twice the distance between the centres, to stay in whole numbers.
    let dx = (2 * to.x + to.width) - (2 * from.x + from.width);
    let dy = (2 * to.y + to.height) - (2 * from.y + from.height);
    if dx.abs() >= dy.abs() {
        if dx >= 0 {
            ("right", "left")
        } else {
            ("left", "right")
        }
    } else if dy > 0 {
        ("bottom", "top")
    } else {
        ("top", "bottom")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_rectangles_leniently() {
        let r = Rect::of(&json!({"x": 1.6, "y": -2, "width": 10})).unwrap();
        assert_eq!(r, Rect::at((2, -2), (10, 0)));
        assert_eq!(Rect::of(&json!({"x": 1})), None);
        let huge = Rect::of(&json!({"x": 1e300, "y": u64::MAX, "width": -5, "height": 3})).unwrap();
        assert_eq!(huge, Rect::at((LIMIT, LIMIT), (0, 3)));
    }

    #[test]
    fn grids_wrap_after_four() {
        assert_eq!(
            grid((10, 20), 5, CARD),
            [(10, 20), (370, 20), (730, 20), (1090, 20), (10, 240)]
        );
        assert_eq!(below(&[]), (0, 0));
    }

    #[test]
    fn a_section_below_keeps_the_gap_and_the_left_edge() {
        let nodes = [
            json!({"x": 100, "y": 0, "width": 320, "height": 180}),
            json!({"x": -20, "y": 300, "width": 260, "height": 120}),
        ];
        let corners = grid_in_section_below(&nodes, 5);
        assert_eq!(corners[0], (20, 580));
        assert_eq!(corners[4], (20, 800));
        let cards = corners
            .iter()
            .map(|&c| Rect::at(c, CARD))
            .reduce(Rect::union)
            .unwrap();
        assert_eq!((cards.section().x, cards.section().y), (-20, 500));
    }

    #[test]
    fn edges_join_the_facing_sides() {
        let a = Rect::at((0, 0), (100, 100));
        assert_eq!(sides(a, Rect::at((300, 50), (100, 100))), ("right", "left"));
        assert_eq!(sides(a, Rect::at((-300, 0), (100, 100))), ("left", "right"));
        assert_eq!(sides(a, Rect::at((50, 300), (100, 100))), ("bottom", "top"));
        assert_eq!(sides(a, Rect::at((0, -300), (100, 100))), ("top", "bottom"));
        assert_eq!(sides(a, a), ("right", "left"));
    }
}
