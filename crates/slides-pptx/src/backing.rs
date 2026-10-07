//! What lies behind words on a page. A file has no opacity for an element, so words a step
//! dims are mixed toward the colour they are drawn over, and words that are not there yet
//! are given that colour. It is the page's, unless a shape drawn before the words holds them:
//! the dark panel of a code block, or a card.

use slides_core::resolve::Rect;

/// What words are drawn over.
#[derive(Clone, Debug, Default, PartialEq)]
pub enum Behind {
    /// Only the page, whose colour is the slide's background.
    #[default]
    Page,
    /// A filled shape, of this colour as `#rrggbb`.
    Color(String),
    /// A picture, or anything else with no one colour to mix words with.
    Unknown,
}

/// How far a shape may fall short of an element and still be behind it, in slide units.
const SLACK: f64 = 1.0;

/// Whether `inner` lies inside `outer`, give or take `SLACK`.
fn holds(outer: &Rect, inner: &Rect) -> bool {
    inner.x >= outer.x - SLACK
        && inner.y >= outer.y - SLACK
        && inner.x + inner.w <= outer.x + outer.w + SLACK
        && inner.y + inner.h <= outer.y + outer.h + SLACK
}

/// The shapes drawn so far on a slide, first to last: what is drawn after them may lie over them.
#[derive(Clone, Debug, Default)]
pub struct Backings(Vec<(Rect, Behind)>);

impl Backings {
    /// Records a shape that has just been drawn, as it shows over what was behind it.
    pub fn push(&mut self, rect: Rect, shown: Behind) {
        self.0.push((rect, shown));
    }

    /// What lies behind `rect`: the last shape drawn that holds it whole, else the page.
    pub fn behind(&self, rect: &Rect) -> Behind {
        self.0
            .iter()
            .rev()
            .find(|(shape, _)| holds(shape, rect))
            .map_or(Behind::Page, |(_, shown)| shown.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect { x, y, w, h }
    }

    fn colour(hex: &str) -> Behind {
        Behind::Color(hex.to_owned())
    }

    #[test]
    fn with_nothing_drawn_the_page_is_behind() {
        assert_eq!(
            Backings::default().behind(&at(0.0, 0.0, 10.0, 10.0)),
            Behind::Page
        );
    }

    #[test]
    fn the_last_shape_that_holds_the_box_is_behind_it() {
        let mut shapes = Backings::default();
        shapes.push(at(0.0, 0.0, 400.0, 300.0), colour("#111111"));
        shapes.push(at(50.0, 50.0, 100.0, 100.0), colour("#222222"));
        let inside_both = at(60.0, 60.0, 30.0, 20.0);
        assert_eq!(shapes.behind(&inside_both), colour("#222222"));
        let inside_the_first = at(200.0, 60.0, 30.0, 20.0);
        assert_eq!(shapes.behind(&inside_the_first), colour("#111111"));
        let outside = at(500.0, 60.0, 30.0, 20.0);
        assert_eq!(shapes.behind(&outside), Behind::Page);
    }

    #[test]
    fn a_box_that_sticks_out_of_a_shape_is_not_on_it() {
        let mut shapes = Backings::default();
        shapes.push(at(0.0, 0.0, 100.0, 100.0), colour("#111111"));
        assert_eq!(
            shapes.behind(&at(90.0, 10.0, 30.0, 20.0)),
            Behind::Page,
            "a third of it hangs over the edge"
        );
        assert_eq!(
            shapes.behind(&at(0.0, 0.0, 100.5, 100.0)),
            colour("#111111"),
            "a hair over is still on it"
        );
    }

    #[test]
    fn a_picture_is_behind_without_a_colour() {
        let mut shapes = Backings::default();
        shapes.push(at(0.0, 0.0, 100.0, 100.0), Behind::Unknown);
        assert_eq!(shapes.behind(&at(10.0, 10.0, 20.0, 20.0)), Behind::Unknown);
    }
}
