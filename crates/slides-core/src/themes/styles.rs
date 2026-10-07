//! The named looks for text. They hold colour tokens and font roles only
//! (`text1`, `heading`), never a hex value or a family, so one table serves
//! all four themes and a deck that changes theme restyles its text with it.

use std::collections::BTreeMap;

use crate::model::TextStyle;

fn style(size: f64, color: &str, font: &str) -> TextStyle {
    TextStyle {
        size,
        color: color.to_owned(),
        font: font.to_owned(),
        bold: false,
        italic: false,
        align: None,
        line_spacing: None,
        space_before: None,
        space_after: None,
        extra: crate::model::Extra::new(),
    }
}

/// The nine styles, sizes in points. The first six are the ones every deck can
/// rely on; `display`, `big-number` and `quote` are set for the layouts that
/// carry their names.
pub(super) fn text_styles() -> BTreeMap<String, TextStyle> {
    [
        (
            "title",
            TextStyle {
                bold: true,
                ..style(36.0, "text1", "heading")
            },
        ),
        ("subtitle", style(20.0, "text2", "body")),
        // Air between lines and paragraphs keeps a list readable from the back of a room.
        (
            "body",
            TextStyle {
                line_spacing: Some(1.15),
                space_after: Some(6.0),
                ..style(22.0, "text1", "body")
            },
        ),
        ("caption", style(14.0, "text2", "body")),
        ("code", style(16.0, "text1", "code")),
        ("citation", style(10.0, "text2", "body")),
        (
            "display",
            TextStyle {
                bold: true,
                ..style(44.0, "text1", "heading")
            },
        ),
        (
            "big-number",
            TextStyle {
                bold: true,
                ..style(96.0, "accent1", "heading")
            },
        ),
        (
            "quote",
            TextStyle {
                italic: true,
                ..style(32.0, "text1", "heading")
            },
        ),
    ]
    .into_iter()
    .map(|(name, style)| (name.to_owned(), style))
    .collect()
}
