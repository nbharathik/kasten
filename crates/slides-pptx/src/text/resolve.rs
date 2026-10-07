//! A theme's named text styles, turned into the values a paragraph starts from.
//! Every paragraph and run is written with these spelled out, so the file looks
//! right even in a viewer that ignores the master and the layouts.

use slides_core::{Align, Theme};

use super::metrics::DEFAULT_LINE_SPACING;

/// What a paragraph looks like before its own settings and its runs' are applied.
#[derive(Clone, Debug, PartialEq)]
pub struct Style {
    /// Points.
    pub size: f64,
    /// A colour token or hex value.
    pub color: String,
    /// `heading`, `body`, `code` or a family.
    pub font: String,
    pub bold: bool,
    pub italic: bool,
    pub align: Align,
    /// A multiple of the line height.
    pub line_spacing: f64,
    /// Points.
    pub space_before: f64,
    pub space_after: f64,
}

impl Default for Style {
    fn default() -> Style {
        Style {
            size: 18.0,
            color: "text1".to_owned(),
            font: "body".to_owned(),
            bold: false,
            italic: false,
            align: Align::Left,
            line_spacing: DEFAULT_LINE_SPACING,
            space_before: 0.0,
            space_after: 0.0,
        }
    }
}

/// The look a theme text style gives.
fn of(found: &slides_core::TextStyle) -> Style {
    Style {
        size: found.size,
        color: found.color.clone(),
        font: found.font.clone(),
        bold: found.bold,
        italic: found.italic,
        align: found.align.clone().unwrap_or(Align::Left),
        line_spacing: found.line_spacing.unwrap_or(DEFAULT_LINE_SPACING),
        space_before: found.space_before.unwrap_or(0.0),
        space_after: found.space_after.unwrap_or(0.0),
    }
}

/// The style a paragraph is set in, as the editor picks it: the one the
/// paragraph names, else the box's, else `body`, and plain 18-point text when the
/// theme has none of them.
pub fn style_for(theme: &Theme, own: Option<&str>, base: &str) -> Style {
    own.and_then(|name| theme.text_style(name))
        .or_else(|| theme.text_style(base))
        .or_else(|| theme.text_style("body"))
        .map(of)
        .unwrap_or_default()
}

/// The style called `name`; the body style when the theme has no such one, and plain 18-point text when it has no body style either.
pub fn style(theme: &Theme, name: &str) -> Style {
    style_for(theme, None, name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_style_carries_the_themes_numbers() {
        let theme = slides_core::themes::light();
        let body = style(&theme, "body");
        assert_eq!(
            (body.size, body.line_spacing, body.space_after),
            (22.0, 1.15, 6.0)
        );
        assert_eq!((body.color.as_str(), body.font.as_str()), ("text1", "body"));
        let title = style(&theme, "title");
        assert!(title.bold && !title.italic);
        assert_eq!((title.size, title.line_spacing), (36.0, 1.0));
        assert!(style(&theme, "quote").italic);
    }

    #[test]
    fn an_unknown_style_is_the_body_style_and_no_body_style_is_plain_text() {
        let mut theme = slides_core::themes::light();
        assert_eq!(style(&theme, "no-such-style"), style(&theme, "body"));
        theme.text_styles.clear();
        assert_eq!(style(&theme, "title"), Style::default());
    }

    #[test]
    fn a_paragraph_that_names_no_known_style_keeps_the_style_of_its_box() {
        let theme = slides_core::themes::light();
        let named = style_for(&theme, Some("caption"), "title");
        assert_eq!(named, style(&theme, "caption"));
        for own in [None, Some("no-such-style")] {
            assert_eq!(style_for(&theme, own, "title"), style(&theme, "title"));
            assert_eq!(style_for(&theme, own, "no-such"), style(&theme, "body"));
        }
    }
}
