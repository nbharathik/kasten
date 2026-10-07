//! What an element looks like at a step of its slide. A page of the file is one
//! slide at one step; without a step every element shows as it is styled.

use slides_core::resolve::{Rect, box_in};
use slides_core::{Element, Mask, StepState, Stroke, Style};

use super::common::{Frame, write_xfrm};
use super::shape::corner;
use crate::backing::Behind;
use crate::color::Color;
use crate::cx::Cx;
use crate::style::{write_fill, write_line};
use crate::xml::Xml;

/// The state from the latest step at or before `step`; normal when the element names none.
pub fn state(el: &Element, step: Option<u32>) -> StepState {
    step.map_or(StepState::Normal, |step| el.base().state_at(step))
}

/// What lies behind an element: the last shape drawn that holds its box, else the page.
pub fn behind(cx: &Cx, el: &Element) -> Behind {
    group_frame(cx, el).map_or(Behind::Page, |frame| cx.backing.behind(&frame.rect))
}

/// What an element shows over what lies `behind` it, when it hides that: a filled shape or
/// text box its fill as drawn (see-through as it is), a picture no colour at all. None for
/// an element that leaves what is behind showing. Words on it mix toward this, and so do
/// the words of anything drawn over it.
pub fn shows(cx: &Cx, el: &Element, opacity: f64, behind: &Behind) -> Option<Behind> {
    match el {
        Element::Image(_) | Element::Raw(_) => Some(Behind::Unknown),
        Element::Shape(_) | Element::Text(_) => {
            let fill = el.base().style.as_ref()?.fill.as_ref()?;
            let alpha = (fill.alpha.unwrap_or(1.0) * opacity).clamp(0.0, 1.0);
            let Some(hex) = cx.deck.theme.resolve_color(&fill.color) else {
                return Some(Behind::Unknown);
            };
            if alpha >= 1.0 {
                return Some(Behind::Color(hex));
            }
            if alpha <= 0.0 {
                return None;
            }
            Some(
                match cx
                    .shown(behind)
                    .and_then(|under| Color::blend(&hex, &under, alpha))
                {
                    Some(Color::Rgb(mixed)) => Behind::Color(format!("#{mixed}")),
                    _ => Behind::Unknown,
                },
            )
        }
        _ => None,
    }
}

/// How far the outline of a highlighted element stands off it, as the editor draws it.
const GAP: f64 = 2.0;

/// The widest outline the editor draws.
const MOST_WIDTH: f64 = 100.0;

/// The corner a rounded picture is given when it does not say.
const MASK_RADIUS: f64 = 12.0;

/// The shape of the outline round an element, and the corner of the element it must
/// follow: a rounded shape or picture and an ellipse are followed, anything else gets a
/// plain frame, as in the editor.
fn ring_shape(el: &Element, rect: &Rect) -> (&'static str, Option<f64>) {
    let half = rect.w.min(rect.h) / 2.0;
    let own = el.base().style.as_ref().and_then(|s| s.radius);
    match el {
        Element::Shape(s) => match s.shape.as_str() {
            "roundRect" | "flowChartAlternateProcess" => (
                "roundRect",
                Some(own.unwrap_or(half / 3.0).clamp(0.0, half)),
            ),
            "ellipse" | "flowChartConnector" => ("ellipse", None),
            _ => ("rect", None),
        },
        Element::Text(_) => match own.filter(|r| *r > 0.0) {
            Some(radius) => ("roundRect", Some(radius.clamp(0.0, half))),
            None => ("rect", None),
        },
        Element::Image(i) => match i.mask {
            Some(Mask::RoundRect) => (
                "roundRect",
                Some(own.unwrap_or(MASK_RADIUS).clamp(0.0, half)),
            ),
            Some(Mask::Ellipse) => ("ellipse", None),
            _ => ("rect", None),
        },
        _ => ("rect", None),
    }
}

/// The box a highlighted group is outlined round: its own, or the box round what it holds.
pub fn group_frame(cx: &Cx, group: &Element) -> Option<Frame> {
    fn round(cx: &Cx, el: &Element) -> Option<Rect> {
        if let Some(own) = box_in(&cx.deck.theme, &cx.layout, el) {
            return Some(own);
        }
        el.children()
            .iter()
            .filter_map(|child| round(cx, child))
            .reduce(|a, b| {
                let (x, y) = (a.x.min(b.x), a.y.min(b.y));
                Rect {
                    x,
                    y,
                    w: (a.x + a.w).max(b.x + b.w) - x,
                    h: (a.y + a.h).max(b.y + b.h) - y,
                }
            })
    }
    round(cx, group).map(|rect| Frame {
        rect,
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
    })
}

/// The outline of a highlighted element: a shape of its own after the element, of the
/// colour and width the theme names, standing a little off it and following its corners.
/// It turns with the element, and fades with the groups round it.
pub fn write_highlight(x: &mut Xml, cx: &mut Cx, el: &Element, frame: Frame, opacity: f64) {
    let theme = &cx.deck.theme.highlight;
    let width = theme.width.clamp(0.0, MOST_WIDTH);
    if width.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater) {
        return;
    }
    let color = theme.color.clone();
    // The editor's outline is drawn outside its offset; a line in a file is centred on its path.
    let pad = GAP + width / 2.0;
    let inner = frame.rect;
    let ring = Frame {
        rect: Rect {
            x: inner.x - pad,
            y: inner.y - pad,
            w: inner.w + 2.0 * pad,
            h: inner.h + 2.0 * pad,
        },
        ..frame
    };
    let (geometry, radius) = ring_shape(el, &inner);
    let id = cx.ids.fresh();
    x.open("p:sp");
    x.open("p:nvSpPr");
    x.open("p:cNvPr")
        .int("id", i64::from(id))
        .attr("name", &format!("Highlight {id}"))
        .close();
    x.open("p:cNvSpPr").close();
    x.open("p:nvPr").close();
    x.close();
    x.open("p:spPr");
    write_xfrm(x, "a:xfrm", &ring);
    x.open("a:prstGeom").attr("prst", geometry);
    x.open("a:avLst");
    if let Some(radius) = radius {
        x.open("a:gd")
            .attr("name", "adj")
            .attr("fmla", &format!("val {}", corner(radius + pad, &ring)))
            .close();
    }
    x.close();
    x.close();
    let line = Style {
        stroke: Some(Stroke {
            color,
            width: Some(width),
            dash: None,
            alpha: None,
            extra: slides_core::Extra::new(),
        }),
        ..Style::default()
    };
    write_fill(x, cx, None, opacity);
    write_line(x, cx, Some(&line), opacity, false, false);
    x.close();
    x.close();
}

#[cfg(test)]
mod tests {
    use slides_core::{Base, Text};

    use super::*;

    fn element() -> Element {
        let mut base = Base::new("e-1");
        base.step_states.insert(0, StepState::Dimmed);
        base.step_states.insert(2, StepState::Highlighted);
        base.step_states.insert(3, StepState::Normal);
        Element::text_el(base, Text::plain("x"))
    }

    #[test]
    fn without_a_step_everything_is_as_styled() {
        assert_eq!(state(&element(), None), StepState::Normal);
    }

    #[test]
    fn a_state_holds_until_the_next_change() {
        let el = element();
        let at: Vec<_> = (0..5).map(|n| state(&el, Some(n))).collect();
        assert_eq!(
            at,
            [
                StepState::Dimmed,
                StepState::Dimmed,
                StepState::Highlighted,
                StepState::Normal,
                StepState::Normal
            ]
        );
        let plain = Element::text_el(Base::new("e-2"), Text::plain("x"));
        assert_eq!(state(&plain, Some(4)), StepState::Normal);
    }
}
