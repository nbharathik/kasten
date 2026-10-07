//! The elements of a diagram: a shape for each box and a connector for each arrow.

use super::plan;
use super::{DiagramNode, Direction};
use crate::lint::color::{Rgb, contrast};
use crate::model::{
    Align, Anchor, Arrow, Base, ConnectorEl, Element, Extra, Fill, Paragraph, Route, Side, Stroke,
    Style, Text, Theme, VAlign,
};
use crate::resolve::Rect;

/// Whichever of the theme's paper and ink colours reads better on a fill.
pub(super) fn readable_on(theme: &Theme, fill: &str) -> &'static str {
    let (Some(fill), Some(light), Some(dark)) = (
        theme.resolve_color(fill).and_then(|h| Rgb::parse(&h)),
        Rgb::parse(&theme.colors.bg1),
        Rgb::parse(&theme.colors.text1),
    ) else {
        return "text1";
    };
    if contrast(light, fill) >= contrast(dark, fill) {
        "bg1"
    } else {
        "text1"
    }
}

pub(super) fn node_element(
    theme: &Theme,
    node: &DiagramNode,
    id: &str,
    rect: Rect,
    font: f64,
) -> Element {
    let (fill, stroke) = match (&node.color, node.emphasis) {
        (Some(color), _) => (color.as_str(), color.as_str()),
        (None, true) => ("accent1", "accent1"),
        (None, false) => ("bg2", "accent1"),
    };
    let ink = if node.color.is_some() || node.emphasis {
        Some(readable_on(theme, fill))
    } else {
        None
    };
    let mut text = plan::words(&node.label, font, node.emphasis);
    for run in text.paragraphs.iter_mut().flat_map(|p| p.runs.iter_mut()) {
        run.color = ink.map(str::to_owned);
        run.bold = node.emphasis;
    }
    let mut base = Base::new(id).place(rect.x, rect.y, rect.w, rect.h);
    base.name = node.label.lines().next().map(str::to_owned);
    base.style = Some(Style {
        fill: Some(Fill {
            color: fill.to_owned(),
            alpha: None,
            extra: Extra::new(),
        }),
        stroke: Some(Stroke {
            color: stroke.to_owned(),
            width: Some(1.5),
            dash: None,
            alpha: None,
            extra: Extra::new(),
        }),
        radius: Some(plan::RADIUS),
        ..Style::default()
    });
    Element::shape(
        base,
        node.shape.as_deref().unwrap_or("roundRect"),
        Some(text),
    )
}

/// How an edge is drawn.
pub(super) struct Flow {
    pub direction: Direction,
    pub back: bool,
    /// The two boxes are level with each other.
    pub level: bool,
}

pub(super) fn connector(
    id: &str,
    (from, to): (&str, &str),
    flow: &Flow,
    label: Option<&str>,
) -> Element {
    let (leave, arrive) = match (flow.direction, flow.back) {
        (Direction::LeftToRight, false) => (Side::Right, Side::Left),
        (Direction::LeftToRight, true) => (Side::Left, Side::Right),
        (Direction::TopDown, false) => (Side::Bottom, Side::Top),
        (Direction::TopDown, true) => (Side::Top, Side::Bottom),
    };
    // A bent line reads well between columns; between rows it would run along the boxes' edges.
    let route = if flow.direction == Direction::LeftToRight && !flow.level {
        Route::Elbow
    } else {
        Route::Straight
    };
    let mut base = Base::new(id).place(0.0, 0.0, 1.0, 1.0);
    base.style = Some(Style {
        stroke: Some(Stroke {
            color: "text2".to_owned(),
            width: Some(1.5),
            dash: None,
            alpha: None,
            extra: Extra::new(),
        }),
        end_arrow: Some(Arrow::Triangle),
        ..Style::default()
    });
    let label = label.filter(|l| !l.trim().is_empty()).map(|l| {
        let mut paragraph = Paragraph::plain(l);
        paragraph.style = Some("caption".to_owned());
        paragraph.align = Some(Align::Center);
        let mut text = Text::from_paragraphs(vec![paragraph]);
        text.valign = Some(VAlign::Middle);
        text
    });
    Element::Connector(ConnectorEl {
        base,
        route,
        from: Some(Anchor {
            el: from.to_owned(),
            side: leave,
            extra: Extra::new(),
        }),
        to: Some(Anchor {
            el: to.to_owned(),
            side: arrive,
            extra: Extra::new(),
        }),
        label,
        extra: Extra::new(),
    })
}
