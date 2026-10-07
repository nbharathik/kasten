//! How much room text takes. An expansion cannot ask a browser or PowerPoint how
//! wide a word is, so it estimates: an average width for each kind of character,
//! measured a little wide, so a line the estimate says fits is a line that fits.
//! Sizes are searched for from the largest down, so text shrinks before it overflows.

use crate::units::points_to_units;

/// The advance of a monospace glyph in em. Roboto Mono, Courier New and Liberation Mono all have 0.6.
pub const MONO_EM: f64 = 0.6;

/// Proportional text is measured this much wider than its average, so a wrong
/// guess is that a line breaks early, not late.
const SAFETY: f64 = 1.04;

/// Bold letters are this much wider than regular ones.
const BOLD: f64 = 1.07;

/// The steps sizes are searched in, in points.
const STEP: f64 = 0.5;

/// Widths are sums of many small numbers; a line that fits to within this fits.
const EPS: f64 = 1.0e-6;

/// The kind of type text is set in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Face {
    /// The body and heading fonts.
    Sans,
    /// The code font.
    Mono,
}

/// Whether a character takes two columns: East Asian wide forms and emoji.
pub fn is_wide(c: char) -> bool {
    matches!(u32::from(c),
        0x1100..=0x115F
        | 0x2E80..=0xA4CF
        | 0xAC00..=0xD7A3
        | 0xF900..=0xFAFF
        | 0xFE30..=0xFE6F
        | 0xFF00..=0xFF60
        | 0xFFE0..=0xFFE6
        | 0x1F300..=0x1FAFF
        | 0x20000..=0x3FFFD)
}

/// Marks that add no width: combining accents, joiners and variation selectors.
fn is_zero_width(c: char) -> bool {
    matches!(u32::from(c), 0x0300..=0x036F | 0x200B..=0x200F | 0xFE00..=0xFE0F | 0x2060)
}

fn sans_em(c: char) -> f64 {
    match c {
        ' ' => 0.28,
        'i' | 'j' | 'l' | '!' | '|' | '\'' | '.' | ',' | ':' | ';' | '`' => 0.27,
        'I' => 0.3,
        'f' | 't' | 'r' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '-' | '/' | '\\' | '*' => 0.36,
        'm' => 0.86,
        'w' => 0.8,
        'M' | 'W' => 0.88,
        '@' | '%' | '&' => 0.85,
        '0'..='9' => 0.6,
        'A'..='Z' => 0.68,
        'a'..='z' => 0.55,
        c if c.is_ascii() => 0.6,
        c if c.is_alphabetic() => 0.6,
        _ => 0.7,
    }
}

/// The width of one character in em.
pub fn glyph_em(c: char, face: Face) -> f64 {
    if is_zero_width(c) {
        return 0.0;
    }
    match (face, is_wide(c)) {
        (Face::Mono, false) => MONO_EM,
        (Face::Mono, true) => 2.0 * MONO_EM,
        (Face::Sans, true) => 1.0,
        (Face::Sans, false) => sans_em(c),
    }
}

/// How many columns of a monospace font the text takes (a tab counts as one; expand tabs first).
pub fn columns(text: &str) -> usize {
    text.chars()
        .map(|c| {
            if is_zero_width(c) {
                0
            } else if is_wide(c) {
                2
            } else {
                1
            }
        })
        .sum()
}

/// The width of `text` in em, measured on the wide side.
pub fn width_em(text: &str, face: Face, bold: bool) -> f64 {
    let em: f64 = text.chars().map(|c| glyph_em(c, face)).sum();
    match face {
        Face::Mono => em,
        Face::Sans => em * SAFETY * if bold { BOLD } else { 1.0 },
    }
}

/// The width of `text` in slide units when set at `size` points.
pub fn width(text: &str, size: f64, face: Face, bold: bool) -> f64 {
    width_em(text, face, bold) * points_to_units(size)
}

/// The lines `text` breaks into in a box `max_w` units wide, set at `size` points:
/// a new line where the text has one, a break at a space when a word would pass
/// the edge, and inside a word that is wider than the box. Every line is a piece
/// of `text`, and a blank line is an empty one.
pub fn wrap(text: &str, max_w: f64, size: f64, face: Face, bold: bool) -> Vec<&str> {
    let scale = points_to_units(size)
        * match face {
            Face::Mono => 1.0,
            Face::Sans => SAFETY * if bold { BOLD } else { 1.0 },
        };
    let max_w = if max_w.is_finite() { max_w } else { 0.0 };
    let mut lines = Vec::new();
    for paragraph in text.split('\n') {
        wrap_paragraph(paragraph, max_w, scale, face, &mut lines);
    }
    lines
}

fn wrap_paragraph<'a>(
    paragraph: &'a str,
    max_w: f64,
    scale: f64,
    face: Face,
    lines: &mut Vec<&'a str>,
) {
    let mut start = 0;
    let mut used = 0.0;
    // Where the line may break: just after a space or a wide character, and the width up to there.
    let mut chance: Option<(usize, f64)> = None;
    for (at, c) in paragraph.char_indices() {
        let advance = glyph_em(c, face) * scale;
        // A space hangs past the edge instead of wrapping.
        if c != ' ' && used + advance > max_w + EPS && used > 0.0 {
            match chance.filter(|(b, _)| *b > start) {
                Some((b, upto)) => {
                    lines.push(&paragraph[start..b]);
                    start = b;
                    used -= upto;
                }
                None => {
                    lines.push(&paragraph[start..at]);
                    start = at;
                    used = 0.0;
                }
            }
            chance = None;
        }
        used += advance;
        if c == ' ' || is_wide(c) {
            chance = Some((at + c.len_utf8(), used));
        }
    }
    lines.push(&paragraph[start..]);
}

/// How many lines `text` takes; see [`wrap`].
pub fn line_count(text: &str, max_w: f64, size: f64, face: Face, bold: bool) -> usize {
    wrap(text, max_w, size, face, bold).len()
}

/// The greatest size in points, at most `max` and at least `min`, for which `fits` says yes.
/// Sizes are tried in half points from `max` down, so the answer is a size a person would
/// type. When nothing fits, it is `min`: text that cannot be made to fit is still readable.
/// `fits` should hold at every size below one that holds.
pub fn fit_pt(max: f64, min: f64, fits: impl Fn(f64) -> bool) -> f64 {
    let max = if max.is_finite() { max } else { min };
    if max <= min || fits(max) {
        return max;
    }
    let mut lo = (min / STEP).ceil() as i64;
    let mut hi = (max / STEP).floor() as i64;
    if hi < lo || !fits(lo as f64 * STEP) {
        return lo as f64 * STEP;
    }
    // `lo` fits; `hi` may. Find the greatest that does.
    while lo < hi {
        let mid = lo + (hi - lo + 1) / 2;
        if fits(mid as f64 * STEP) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    lo as f64 * STEP
}

/// A size in points from a field a person filled in: `default` when it is missing, zero,
/// negative or not a number, and never below 1 or above 400.
pub fn size_or(value: Option<f64>, default: f64) -> f64 {
    match value {
        Some(v) if v.is_finite() && v > 0.0 => v.clamp(1.0, 400.0),
        _ => default,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_monospace_line_is_six_tenths_of_an_em_a_column() {
        assert_eq!(width_em("abcde", Face::Mono, false), 3.0);
        assert_eq!(columns("abcde"), 5);
        assert_eq!(columns("日本"), 4);
        // 12 pt is 16 units; 10 columns of 0.6 em.
        assert!((width("0123456789", 12.0, Face::Mono, false) - 96.0).abs() < 1e-9);
    }

    #[test]
    fn proportional_text_averages_about_half_an_em_and_bold_is_wider() {
        let text = "The quick brown fox jumps over the lazy dog";
        let per_char = width_em(text, Face::Sans, false) / text.chars().count() as f64;
        assert!((0.45..0.6).contains(&per_char), "{per_char}");
        assert!(width_em(text, Face::Sans, true) > width_em(text, Face::Sans, false));
        assert!(width_em("iiii", Face::Sans, false) < width_em("mmmm", Face::Sans, false));
    }

    #[test]
    fn words_wrap_at_spaces_and_long_words_break_inside() {
        // Ten columns of monospace at 12 pt take 96 units.
        assert_eq!(
            wrap("aaaa bbbb cccc", 96.0, 12.0, Face::Mono, false),
            ["aaaa bbbb ", "cccc"]
        );
        assert_eq!(
            wrap("aaaaaaaaaaaaaaaaaaaaaaaaa", 96.0, 12.0, Face::Mono, false),
            ["aaaaaaaaaa", "aaaaaaaaaa", "aaaaa"]
        );
        assert_eq!(
            wrap("one\n\ntwo", 96.0, 12.0, Face::Mono, false),
            ["one", "", "two"]
        );
        assert_eq!(wrap("", 96.0, 12.0, Face::Mono, false), [""]);
    }

    #[test]
    fn wrapping_survives_a_box_with_no_room_and_a_hundred_kilobytes() {
        assert_eq!(line_count("abc", 0.0, 12.0, Face::Sans, false), 3);
        assert_eq!(line_count("abc def", f64::NAN, 12.0, Face::Sans, false), 6);
        let big = "word ".repeat(20_000);
        let n = line_count(&big, 300.0, 12.0, Face::Sans, false);
        assert!(n > 100 && n < 20_000, "{n}");
        assert!(line_count("日本語のテキスト", 40.0, 12.0, Face::Sans, false) > 1);
    }

    #[test]
    fn the_largest_size_that_fits_is_found_in_half_points() {
        assert_eq!(fit_pt(20.0, 10.0, |s| s <= 13.4), 13.0);
        assert_eq!(fit_pt(20.0, 10.0, |_| true), 20.0);
        assert_eq!(fit_pt(20.0, 10.0, |_| false), 10.0);
        assert_eq!(fit_pt(12.0, 12.0, |_| false), 12.0);
        assert_eq!(
            fit_pt(8.0, 10.0, |_| false),
            8.0,
            "a size below the floor asked for stays"
        );
        assert_eq!(fit_pt(f64::NAN, 10.0, |_| false), 10.0);
        assert_eq!(fit_pt(13.3, 10.0, |s| s <= 13.0), 13.0);
    }

    #[test]
    fn a_size_from_a_field_is_sane() {
        assert_eq!(size_or(None, 16.0), 16.0);
        assert_eq!(size_or(Some(0.0), 16.0), 16.0);
        assert_eq!(size_or(Some(-3.0), 16.0), 16.0);
        assert_eq!(size_or(Some(f64::NAN), 16.0), 16.0);
        assert_eq!(size_or(Some(1.0e9), 16.0), 400.0);
        assert_eq!(size_or(Some(0.2), 16.0), 1.0);
        assert_eq!(size_or(Some(24.0), 16.0), 24.0);
    }
}
