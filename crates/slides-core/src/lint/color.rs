//! Colour arithmetic for the contrast rule: theme tokens and hex values to
//! RGB, blending, and the contrast ratio of the WCAG.

/// A colour as red, green and blue between 0 and 1.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rgb(pub f64, pub f64, pub f64);

impl Rgb {
    /// Reads `#rgb` or `#rrggbb`.
    pub fn parse(hex: &str) -> Option<Rgb> {
        let digits = hex.strip_prefix('#')?;
        if !digits.chars().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        let byte = |s: &str| u8::from_str_radix(s, 16).ok().map(|v| f64::from(v) / 255.0);
        match digits.len() {
            3 => {
                let one = |i: usize| byte(&digits[i..=i].repeat(2));
                Some(Rgb(one(0)?, one(1)?, one(2)?))
            }
            6 => Some(Rgb(
                byte(&digits[0..2])?,
                byte(&digits[2..4])?,
                byte(&digits[4..6])?,
            )),
            _ => None,
        }
    }

    /// `alpha` of `self` laid over `under`.
    pub fn over(self, alpha: f64, under: Rgb) -> Rgb {
        let a = alpha.clamp(0.0, 1.0);
        Rgb(
            self.0 * a + under.0 * (1.0 - a),
            self.1 * a + under.1 * (1.0 - a),
            self.2 * a + under.2 * (1.0 - a),
        )
    }

    /// Relative luminance, as the WCAG defines it.
    pub fn luminance(self) -> f64 {
        let channel = |c: f64| {
            if c <= 0.039_28 {
                c / 12.92
            } else {
                ((c + 0.055) / 1.055).powf(2.4)
            }
        };
        0.2126 * channel(self.0) + 0.7152 * channel(self.1) + 0.0722 * channel(self.2)
    }

    /// `#rrggbb`.
    pub fn hex(self) -> String {
        let byte = |c: f64| (c.clamp(0.0, 1.0) * 255.0).round() as u8;
        format!(
            "#{:02x}{:02x}{:02x}",
            byte(self.0),
            byte(self.1),
            byte(self.2)
        )
    }
}

/// The contrast ratio of two colours, from 1 (the same) to 21 (black on white).
pub fn contrast(a: Rgb, b: Rgb) -> f64 {
    let (la, lb) = (a.luminance(), b.luminance());
    let (light, dark) = if la >= lb { (la, lb) } else { (lb, la) };
    (light + 0.05) / (dark + 0.05)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn black_on_white_is_twenty_one_to_one() {
        let ratio = contrast(Rgb::parse("#000").unwrap(), Rgb::parse("#ffffff").unwrap());
        assert!((ratio - 21.0).abs() < 1e-9, "{ratio}");
    }

    #[test]
    fn a_known_grey_on_white_is_about_three_to_one() {
        let ratio = contrast(Rgb::parse("#949494").unwrap(), Rgb(1.0, 1.0, 1.0));
        assert!((ratio - 3.03).abs() < 0.02, "{ratio}");
        let same = contrast(
            Rgb::parse("#1a73e8").unwrap(),
            Rgb::parse("#1a73e8").unwrap(),
        );
        assert!((same - 1.0).abs() < 1e-9);
    }

    #[test]
    fn reads_short_and_long_hex_and_refuses_the_rest() {
        assert_eq!(Rgb::parse("#fff"), Some(Rgb(1.0, 1.0, 1.0)));
        assert_eq!(
            Rgb::parse("#ff0000").map(Rgb::hex).as_deref(),
            Some("#ff0000")
        );
        for bad in ["fff", "#ffff", "#12345g", "accent1", ""] {
            assert_eq!(Rgb::parse(bad), None, "{bad}");
        }
    }

    #[test]
    fn a_half_clear_colour_lies_between() {
        let mixed = Rgb(0.0, 0.0, 0.0).over(0.5, Rgb(1.0, 1.0, 1.0));
        assert_eq!(mixed, Rgb(0.5, 0.5, 0.5));
    }
}
