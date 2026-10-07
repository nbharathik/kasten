//! The colours of a code block. They are fixed hex values, not theme colours:
//! a block is dark or light by its own `theme` field whatever the deck's theme
//! is, and every colour keeps at least 7:1 against its panel, so code reads
//! from the back of a room. Colouring names a kind of word; the palette says
//! which colour the kind gets.

use crate::model::CodeTheme;

/// What a stretch of code is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Kind {
    Plain = 0,
    Comment,
    Keyword,
    Str,
    Number,
    Function,
    Type,
    Constant,
    Inserted,
    Deleted,
}

impl Kind {
    pub const ALL: [Kind; 10] = [
        Kind::Plain,
        Kind::Comment,
        Kind::Keyword,
        Kind::Str,
        Kind::Number,
        Kind::Function,
        Kind::Type,
        Kind::Constant,
        Kind::Inserted,
        Kind::Deleted,
    ];

    /// The kind whose number is `n`; plain for any other.
    pub fn from_number(n: u8) -> Kind {
        Kind::ALL
            .get(usize::from(n))
            .copied()
            .unwrap_or(Kind::Plain)
    }
}

/// The colours of one look of a code block.
pub struct Palette {
    /// The panel behind the code.
    pub panel: &'static str,
    /// The thin line round the panel, so it stands out from a slide of nearly its own colour.
    pub border: &'static str,
    /// Line numbers: dimmer than the code, but still readable.
    pub gutter: &'static str,
    colors: [&'static str; 10],
}

impl Palette {
    pub fn color(&self, kind: Kind) -> &'static str {
        self.colors[kind as usize]
    }
}

const DARK: Palette = Palette {
    panel: "#161b22",
    border: "#30363d",
    gutter: "#7e858f",
    colors: [
        "#e6edf3", // plain
        "#a3aab2", // comment
        "#ff857d", // keyword
        "#7ee787", // string
        "#ffa657", // number
        "#d2a8ff", // function
        "#79c0ff", // type
        "#56d4dd", // constant
        "#7ee787", // inserted
        "#ff857d", // deleted
    ],
};

const LIGHT: Palette = Palette {
    panel: "#f6f8fa",
    border: "#d0d7de",
    gutter: "#68717b",
    colors: [
        "#1f2328", // plain
        "#4b535c", // comment
        "#a11b24", // keyword
        "#105f27", // string
        "#8f3600", // number
        "#603ba5", // function
        "#054eab", // type
        "#0a5b64", // constant
        "#105f27", // inserted
        "#a11b24", // deleted
    ],
};

/// The palette of a code block's `theme`: dark unless it says light.
pub fn palette(theme: Option<&CodeTheme>) -> &'static Palette {
    match theme {
        Some(CodeTheme::Light) => &LIGHT,
        _ => &DARK,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn channel(hex: &str, at: usize) -> f64 {
        let v = f64::from(u8::from_str_radix(&hex[at..at + 2], 16).unwrap_or(0)) / 255.0;
        if v <= 0.03928 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    }

    fn luminance(hex: &str) -> f64 {
        0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
    }

    /// The WCAG 2 contrast ratio of two `#rrggbb` colours.
    fn contrast(a: &str, b: &str) -> f64 {
        let (a, b) = (luminance(a), luminance(b));
        (a.max(b) + 0.05) / (a.min(b) + 0.05)
    }

    #[test]
    fn every_colour_of_the_code_has_seven_to_one_on_its_panel() {
        for (name, palette) in [("dark", &DARK), ("light", &LIGHT)] {
            for kind in Kind::ALL {
                let ratio = contrast(palette.color(kind), palette.panel);
                assert!(ratio >= 7.0, "{name} {kind:?} is {ratio:.2}:1");
            }
        }
    }

    #[test]
    fn line_numbers_are_dimmer_than_the_code_but_still_readable() {
        for (name, palette) in [("dark", &DARK), ("light", &LIGHT)] {
            let ratio = contrast(palette.gutter, palette.panel);
            assert!(ratio >= 4.5, "{name} gutter is {ratio:.2}:1");
            assert!(
                ratio < contrast(palette.color(Kind::Plain), palette.panel),
                "{name}"
            );
        }
    }

    #[test]
    fn kinds_come_back_from_their_numbers_and_unknown_numbers_are_plain() {
        for kind in Kind::ALL {
            assert_eq!(Kind::from_number(kind as u8), kind);
        }
        assert_eq!(Kind::from_number(200), Kind::Plain);
    }

    #[test]
    fn the_theme_field_picks_the_palette_and_dark_is_the_default() {
        assert_eq!(palette(None).panel, DARK.panel);
        assert_eq!(palette(Some(&CodeTheme::Dark)).panel, DARK.panel);
        assert_eq!(palette(Some(&CodeTheme::Light)).panel, LIGHT.panel);
    }
}
