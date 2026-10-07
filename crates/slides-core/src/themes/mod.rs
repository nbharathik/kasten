//! The built-in themes: Light, Dark, Serif and Lecture.
//!
//! A theme is plain data. A deck copies the one it starts from, so it opens
//! the same wherever it goes and never looks this catalog up again.
//!
//! All four offer the same twelve layouts under the same names, so a deck can
//! change theme and keep every slide's layout. They differ in colour and type
//! and, in Lecture's case, in a header bar with a logo that pushes content down.

mod fonts;
mod layouts;
mod master;
mod palette;
mod styles;
#[cfg(test)]
mod tests;

use crate::model::{Colors, Element, Extra, Fonts, Highlight, Layout, Theme};

const LIGHT: &str = "Light";
const DARK: &str = "Dark";
const SERIF: &str = "Serif";
const LECTURE: &str = "Lecture";

/// The theme a new deck starts from.
pub const DEFAULT: &str = LIGHT;

/// Builds one of the themes.
type Build = fn() -> Theme;

/// The built-in themes by name, in the order a picker lists them.
const BUILT_IN: [(&str, Build); 4] = [
    (LIGHT, light),
    (DARK, dark),
    (SERIF, serif),
    (LECTURE, lecture),
];

/// White paper, Inter, and the blue, red, yellow and green of Google's own slides.
pub fn light() -> Theme {
    theme(
        LIGHT,
        palette::light(),
        fonts::sans(),
        layouts::twelve(&layouts::PLAIN),
        vec![master::slide_number()],
    )
}

/// The light theme's type and layouts on near-black paper.
pub fn dark() -> Theme {
    theme(
        DARK,
        palette::dark(),
        fonts::sans(),
        layouts::twelve(&layouts::PLAIN),
        vec![master::slide_number()],
    )
}

/// Warm paper and serif headings, set in the fonts PowerPoint ships with.
pub fn serif() -> Theme {
    theme(
        SERIF,
        palette::serif(),
        fonts::serif(),
        layouts::twelve(&layouts::PLAIN),
        vec![master::slide_number()],
    )
}

/// The university look: a grey header bar across the top of every content
/// slide, with the university's logo at its right. The title and section
/// slides go without the bar, the logo and the number.
pub fn lecture() -> Theme {
    let mut layouts = layouts::twelve(&layouts::BARRED);
    for layout in layouts
        .iter_mut()
        .filter(|layout| matches!(layout.name.as_str(), "title" | "section"))
    {
        layout.hide_master = true;
    }
    let master = vec![master::header_bar(), master::logo(), master::slide_number()];
    theme(LECTURE, palette::lecture(), fonts::sans(), layouts, master)
}

/// The four built-in themes, in the order a picker lists them.
pub fn all() -> Vec<Theme> {
    BUILT_IN.iter().map(|(_, build)| build()).collect()
}

/// The built-in theme called `name`, whatever the case it is written in.
pub fn by_name(name: &str) -> Option<Theme> {
    BUILT_IN
        .iter()
        .find(|(known, _)| known.eq_ignore_ascii_case(name))
        .map(|(_, build)| build())
}

/// What the four themes share: the text styles, how a dimmed element looks
/// and the outline of a highlighted one.
fn theme(
    name: &str,
    colors: Colors,
    fonts: Fonts,
    layouts: Vec<Layout>,
    master: Vec<Element>,
) -> Theme {
    Theme {
        name: name.to_owned(),
        colors,
        fonts,
        text_styles: styles::text_styles(),
        layouts,
        master,
        dimmed_opacity: 0.25,
        highlight: Highlight {
            color: "accent1".to_owned(),
            width: 2.0,
            extra: Extra::new(),
        },
        extra: Extra::new(),
    }
}
