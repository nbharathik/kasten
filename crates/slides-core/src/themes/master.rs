//! The elements a theme draws on every slide, under the slide's own: the
//! slide number of every theme, and Lecture's header bar and logo.

use crate::model::{Align, Base, Element, Extra, Fill, ImageEl, Paragraph, Run, Style, Text};
use crate::units::SLIDE_WIDTH;

/// The grey bar across the top of a Lecture slide. Content starts below it.
pub(super) fn header_bar() -> Element {
    let mut base = Base::new("master-bar").place(0.0, 0.0, SLIDE_WIDTH, 56.0);
    base.style = Some(Style {
        fill: Some(Fill {
            color: "bg2".to_owned(),
            alpha: None,
            extra: Extra::new(),
        }),
        ..Style::default()
    });
    Element::shape(base, "rect", None)
}

/// Where the university's logo goes, at the right end of the bar. It is empty
/// because the deck's owner brings the image; the theme ships none.
pub(super) fn logo() -> Element {
    let mut base = Base::new("master-logo").place(836.0, 8.0, 100.0, 40.0);
    base.alt = Some("Logo".to_owned());
    Element::Image(ImageEl {
        base,
        src: String::new(),
        crop: None,
        mask: None,
        extra: Extra::new(),
    })
}

/// The number of the slide, at the bottom right. The run stands for the
/// field: its text is only the sample shown when the slide is edited.
pub(super) fn slide_number() -> Element {
    let run = Run {
        field: Some("slideNumber".to_owned()),
        ..Run::plain("‹#›")
    };
    let paragraph = Paragraph {
        runs: vec![run],
        align: Some(Align::Right),
        style: Some("caption".to_owned()),
        ..Paragraph::plain("")
    };
    Element::text_el(
        Base::new("master-number").place(860.0, 500.0, 80.0, 24.0),
        Text::from_paragraphs(vec![paragraph]),
    )
}
