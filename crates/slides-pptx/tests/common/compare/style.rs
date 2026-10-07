//! Comparing how two elements look: fill, outline, corner radius, shadow and
//! arrowheads, with each value as it is drawn (a colour token as its hex, an
//! absent width as the default one) and the element's opacity folded into the
//! transparency of each part, which is how a file holds it.

use slides_core::{Arrow, Dash, Deck, Element, Mask};

use super::Diff;

#[derive(Debug, PartialEq)]
struct Drawn {
    fill: Option<(String, i64)>,
    stroke: Option<(String, i64, String, i64)>,
    radius: Option<i64>,
    shadow: Option<(String, i64, i64, i64, i64)>,
    arrows: (Option<String>, Option<String>),
}

fn hex(deck: &Deck, value: &str) -> String {
    deck.theme
        .resolve_color(value)
        .unwrap_or_else(|| value.to_owned())
        .to_ascii_lowercase()
}

/// A number to the nearest half unit, so a rounding in a file is not a difference.
fn half(v: f64) -> i64 {
    (v * 2.0).round() as i64
}

fn percent(v: f64) -> i64 {
    (v * 100.0).round() as i64
}

fn arrow(a: &Option<Arrow>) -> Option<String> {
    a.clone()
        .filter(|a| *a != Arrow::None)
        .map(|a| format!("{a:?}"))
}

fn drawn(deck: &Deck, element: &Element) -> Drawn {
    let style = element.base().style.clone().unwrap_or_default();
    let opacity = style.opacity.unwrap_or(1.0);
    let line_like = matches!(element, Element::Line(_) | Element::Connector(_));
    let stroke = match &style.stroke {
        Some(s) => Some((
            s.color.as_str(),
            s.width.unwrap_or(1.0),
            s.dash.clone(),
            s.alpha,
        )),
        None if line_like => Some(("text1", 1.5, None, None)),
        None => None,
    }
    .filter(|(_, width, _, _)| *width > 0.0);
    let rounded = match element {
        Element::Text(_) => true,
        Element::Shape(s) => matches!(s.shape.as_str(), "roundRect" | "wedgeRoundRectCallout"),
        Element::Image(i) => i.mask == Some(Mask::RoundRect),
        _ => false,
    };
    let radius = match element {
        Element::Image(i) if i.mask == Some(Mask::RoundRect) => Some(style.radius.unwrap_or(12.0)),
        _ => style.radius.filter(|r| *r > 0.0),
    };
    Drawn {
        fill: style.fill.as_ref().map(|f| {
            (
                hex(deck, &f.color),
                percent(f.alpha.unwrap_or(1.0) * opacity),
            )
        }),
        stroke: stroke.map(|(color, width, dash, alpha)| {
            (
                hex(deck, color),
                percent(width),
                format!("{:?}", dash.unwrap_or(Dash::Solid)),
                percent(alpha.unwrap_or(1.0) * opacity),
            )
        }),
        radius: radius.filter(|_| rounded).map(half),
        shadow: style.shadow.as_ref().map(|s| {
            (
                hex(deck, &s.color),
                half(s.blur),
                half(s.dx),
                half(s.dy),
                percent(s.alpha.unwrap_or(1.0) * opacity),
            )
        }),
        arrows: if line_like {
            (arrow(&style.start_arrow), arrow(&style.end_arrow))
        } else {
            (None, None)
        },
    }
}

/// Notes what differs between how two elements look.
pub fn compare(diff: &mut Diff, at: &str, a: (&Deck, &Element), b: (&Deck, &Element)) {
    let (da, db) = (drawn(a.0, a.1), drawn(b.0, b.1));
    if da != db {
        diff.note(at, format!("looks {da:?} came back as {db:?}"));
    }
}
