//! Colours. A theme token is written as a scheme colour, so recolouring the
//! theme in PowerPoint recolours the deck; a hex value is written as it is.

use crate::xml::Xml;

#[derive(Clone, Debug, PartialEq)]
pub enum Color {
    /// `tx1`, `bg2`, `accent3` ...
    Scheme(&'static str),
    /// Six upper-case hex digits.
    Rgb(String),
}

/// The PPTX name of a theme token, which is what a `p:clrMap` maps to a theme slot.
pub fn scheme_name(token: &str) -> Option<&'static str> {
    Some(match token {
        "text1" => "tx1",
        "text2" => "tx2",
        "bg1" => "bg1",
        "bg2" => "bg2",
        "accent1" => "accent1",
        "accent2" => "accent2",
        "accent3" => "accent3",
        "accent4" => "accent4",
        "accent5" => "accent5",
        "accent6" => "accent6",
        _ => return None,
    })
}

impl Color {
    /// A theme token or `#rgb` / `#rrggbb`; None for anything else.
    pub fn parse(value: &str) -> Option<Color> {
        if let Some(name) = scheme_name(value) {
            return Some(Color::Scheme(name));
        }
        let digits = value.strip_prefix('#')?;
        if !digits.chars().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        match digits.len() {
            6 => Some(Color::Rgb(digits.to_ascii_uppercase())),
            3 => Some(Color::Rgb(
                digits
                    .chars()
                    .flat_map(|c| [c, c])
                    .collect::<String>()
                    .to_ascii_uppercase(),
            )),
            _ => None,
        }
    }

    /// `top` laid over `under` at `amount` (0 to 1), as one solid colour; None
    /// unless both are hex colours. For a ground the file cannot make see-through.
    pub fn blend(top: &str, under: &str, amount: f64) -> Option<Color> {
        let (Color::Rgb(top), Color::Rgb(under)) = (Color::parse(top)?, Color::parse(under)?)
        else {
            return None;
        };
        let amount = amount.clamp(0.0, 1.0);
        let mut mixed = String::with_capacity(6);
        for at in [0, 2, 4] {
            let channel = |hex: &str| u8::from_str_radix(&hex[at..at + 2], 16).map(f64::from);
            let (over, below) = (channel(&top).ok()?, channel(&under).ok()?);
            let value = (below + (over - below) * amount).round().clamp(0.0, 255.0);
            mixed.push_str(&format!("{:02X}", value as u8));
        }
        Some(Color::Rgb(mixed))
    }

    /// The colour, with `alpha` (1 is solid) as a child when it is see-through.
    pub fn write(&self, x: &mut Xml, alpha: Option<f64>) {
        let alpha = alpha
            .filter(|a| *a < 1.0)
            .map(|a| crate::units::thousandths(a.max(0.0)));
        match self {
            Color::Scheme(name) => x.open("a:schemeClr").attr("val", name),
            Color::Rgb(hex) => x.open("a:srgbClr").attr("val", hex),
        };
        if let Some(value) = alpha {
            x.open("a:alpha").int("val", value).close();
        }
        x.close();
    }

    /// `<a:solidFill>` holding the colour.
    pub fn solid_fill(&self, x: &mut Xml, alpha: Option<f64>) {
        x.open("a:solidFill");
        self.write(x, alpha);
        x.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fill(color: &Color, alpha: Option<f64>) -> String {
        let mut x = Xml::fragment();
        color.solid_fill(&mut x, alpha);
        x.into_string()
    }

    #[test]
    fn theme_tokens_become_scheme_colours() {
        assert_eq!(Color::parse("text1"), Some(Color::Scheme("tx1")));
        assert_eq!(Color::parse("bg2"), Some(Color::Scheme("bg2")));
        assert_eq!(Color::parse("accent6"), Some(Color::Scheme("accent6")));
        assert_eq!(
            fill(&Color::Scheme("accent2"), None),
            r#"<a:solidFill><a:schemeClr val="accent2"/></a:solidFill>"#
        );
    }

    #[test]
    fn hex_values_are_upper_case_and_short_ones_are_expanded() {
        assert_eq!(Color::parse("#1a73e8"), Some(Color::Rgb("1A73E8".into())));
        assert_eq!(Color::parse("#abc"), Some(Color::Rgb("AABBCC".into())));
        assert_eq!(
            fill(&Color::Rgb("1A73E8".into()), None),
            r#"<a:solidFill><a:srgbClr val="1A73E8"/></a:solidFill>"#
        );
    }

    #[test]
    fn anything_else_is_not_a_colour() {
        for bad in ["", "red", "#12", "#12345", "#gggggg", "accent7", "text3"] {
            assert_eq!(Color::parse(bad), None, "{bad}");
        }
    }

    #[test]
    fn a_colour_can_be_mixed_over_another_into_one_solid_colour() {
        let mixed = |amount| Color::blend("#000000", "#ffffff", amount);
        assert_eq!(mixed(0.0), Some(Color::Rgb("FFFFFF".into())));
        assert_eq!(mixed(1.0), Some(Color::Rgb("000000".into())));
        assert_eq!(mixed(0.08), Some(Color::Rgb("EBEBEB".into())));
        assert_eq!(mixed(9.0), mixed(1.0), "the share is kept between 0 and 1");
        assert_eq!(
            Color::blend("#f00", "#00f", 0.5),
            Some(Color::Rgb("800080".into()))
        );
        assert_eq!(Color::blend("accent1", "#ffffff", 0.5), None);
        assert_eq!(Color::blend("#000000", "nope", 0.5), None);
    }

    #[test]
    fn transparency_is_an_alpha_child_in_hundred_thousandths() {
        assert_eq!(
            fill(&Color::Scheme("tx2"), Some(0.3)),
            r#"<a:solidFill><a:schemeClr val="tx2"><a:alpha val="30000"/></a:schemeClr></a:solidFill>"#
        );
        assert_eq!(
            fill(&Color::Rgb("000000".into()), Some(0.0)),
            r#"<a:solidFill><a:srgbClr val="000000"><a:alpha val="0"/></a:srgbClr></a:solidFill>"#
        );
        assert_eq!(
            fill(&Color::Scheme("bg1"), Some(1.0)),
            r#"<a:solidFill><a:schemeClr val="bg1"/></a:solidFill>"#
        );
    }
}
