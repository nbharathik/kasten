//! The deck's named text styles while the import builds them. The master's
//! title and body styles become `title` and `body`; a layout's placeholder
//! whose text is set differently gets a style of its own, so a slide's
//! paragraphs can say only how they differ from the style they start from.

use std::collections::BTreeMap;

use slides_core::{Align, TextStyle};

use super::text::levels::{Level, Spacing};
use super::units::round4;

/// PowerPoint's single line spacing is the face's own line height, about this many times the type size.
pub const NATURAL_LINE: f64 = 1.2;

/// The type size a paragraph has when nothing in the file names one.
pub const DEFAULT_SIZE: f64 = 18.0;

/// The line height as a multiple of the type size, for a spacing at a type size.
pub fn line_multiple(spacing: Spacing, size: f64) -> f64 {
    match spacing {
        Spacing::Percent(p) => round4(p * NATURAL_LINE),
        Spacing::Points(v) => round4(v / size.max(1.0)),
    }
}

/// Points of space above or below a paragraph.
pub fn space_points(spacing: Spacing, size: f64) -> f64 {
    match spacing {
        Spacing::Percent(p) => round4(p * size),
        Spacing::Points(v) => round4(v),
    }
}

/// The style a level describes, with the file's colour and font kept as they are.
pub fn text_style(level: &Level) -> TextStyle {
    let size = level.run.size.unwrap_or(DEFAULT_SIZE);
    TextStyle {
        size,
        color: level
            .run
            .color
            .as_ref()
            .map_or_else(|| "text1".to_owned(), |c| c.value.clone()),
        font: level.run.font.clone().unwrap_or_else(|| "body".to_owned()),
        bold: level.run.bold.unwrap_or(false),
        italic: level.run.italic.unwrap_or(false),
        align: level.align.clone().filter(|a| *a != Align::Left),
        line_spacing: level.line.map(|s| line_multiple(s, size)),
        space_before: level.before.map(|s| space_points(s, size)),
        space_after: level.after.map(|s| space_points(s, size)),
        extra: slides_core::Extra::new(),
    }
}

/// The text styles of the deck being made.
#[derive(Clone, Debug)]
pub struct StyleBook {
    pub styles: BTreeMap<String, TextStyle>,
}

fn same(a: &TextStyle, b: &TextStyle) -> bool {
    a.color == b.color
        && a.font == b.font
        && a.bold == b.bold
        && a.italic == b.italic
        && a.align == b.align
        && (a.size - b.size).abs() < 0.01
        && close(a.line_spacing, b.line_spacing)
        && close(a.space_before, b.space_before)
        && close(a.space_after, b.space_after)
}

fn close(a: Option<f64>, b: Option<f64>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => (a - b).abs() < 0.001,
        _ => false,
    }
}

impl StyleBook {
    /// The built-in styles, for the names an editor expects to find in a deck.
    pub fn new() -> StyleBook {
        StyleBook {
            styles: slides_core::themes::light().text_styles,
        }
    }

    /// No styles yet; the master's are set first, and `fill_missing` adds the rest afterwards.
    pub fn empty() -> StyleBook {
        StyleBook {
            styles: BTreeMap::new(),
        }
    }

    /// Adds the built-in styles the deck has no style of the name of.
    pub fn fill_missing(&mut self) {
        for (name, style) in slides_core::themes::light().text_styles {
            self.styles.entry(name).or_insert(style);
        }
    }

    pub fn get(&self, name: &str) -> Option<&TextStyle> {
        self.styles.get(name)
    }

    /// Sets a style outright (the master's `title` and `body`).
    pub fn set(&mut self, name: &str, style: TextStyle) {
        self.styles.insert(name.to_owned(), style);
    }

    /// The name of a style equal to `style`, made under the first of `names` that is free.
    /// A name taken by a different style is passed over; when all are taken a number is added to the last.
    pub fn intern(&mut self, names: &[&str], style: TextStyle) -> String {
        for name in names {
            match self.styles.get(*name) {
                Some(found) if same(found, &style) => return (*name).to_owned(),
                Some(_) => {}
                None => {
                    self.styles.insert((*name).to_owned(), style);
                    return (*name).to_owned();
                }
            }
        }
        let stem = names.last().copied().unwrap_or("style");
        for n in 2.. {
            let name = format!("{stem}-{n}");
            match self.styles.get(&name) {
                Some(found) if same(found, &style) => return name,
                Some(_) => {}
                None => {
                    self.styles.insert(name.clone(), style);
                    return name;
                }
            }
        }
        unreachable!("a free name is found")
    }
}

impl Default for StyleBook {
    fn default() -> StyleBook {
        StyleBook::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::color::Paint;
    use crate::import::text::levels::RunProps;

    fn level(size: f64, bold: bool) -> Level {
        Level {
            run: RunProps {
                size: Some(size),
                bold: Some(bold),
                color: Some(Paint::solid("accent1")),
                ..RunProps::default()
            },
            ..Level::default()
        }
    }

    #[test]
    fn a_level_becomes_a_style_with_spacing_in_the_editors_terms() {
        let mut l = level(28.0, true);
        l.line = Some(Spacing::Percent(0.9));
        l.before = Some(Spacing::Percent(0.2));
        l.after = Some(Spacing::Points(6.0));
        l.align = Some(Align::Center);
        let s = text_style(&l);
        assert_eq!(
            (s.size, s.bold, s.color.as_str(), s.font.as_str()),
            (28.0, true, "accent1", "body")
        );
        assert_eq!(s.line_spacing, Some(1.08));
        assert_eq!(s.space_before, Some(5.6));
        assert_eq!(s.space_after, Some(6.0));
        assert_eq!(s.align, Some(Align::Center));
        assert_eq!(text_style(&Level::default()).size, 18.0);
        assert_eq!(text_style(&Level::default()).align, None);
    }

    #[test]
    fn spacing_in_points_is_a_multiple_of_the_size() {
        assert_eq!(line_multiple(Spacing::Points(25.3), 22.0), 1.15);
        assert_eq!(line_multiple(Spacing::Percent(1.0), 22.0), 1.2);
    }

    #[test]
    fn a_style_keeps_the_first_free_name_and_an_equal_style_is_found_again() {
        let mut book = StyleBook::empty();
        book.set("title", text_style(&level(36.0, true)));
        let a = text_style(&level(40.0, true));
        assert_eq!(book.intern(&["title", "display"], a.clone()), "display");
        assert_eq!(
            book.intern(&["title", "display"], a.clone()),
            "display",
            "equal, so the same name"
        );
        let b = text_style(&level(41.0, true));
        assert_eq!(book.intern(&["title", "display"], b.clone()), "display-2");
        assert_eq!(book.intern(&["title", "display"], b), "display-2");
        assert_eq!(book.intern(&["fresh"], a), "fresh");
    }
}
