//! Math: a formula is drawn as a picture of the whole box.
//!
//! PowerPoint cannot typeset LaTeX, so a formula leaves the deck as a picture.
//! The picture's name says what is in it: [`math_image_path`] hashes the formula,
//! its colour and its size, so the same formula is the same file wherever it is
//! used. The editor draws formulas itself; a host that exports makes a picture of
//! each one and hands it over under that name. Without it the exporter writes the
//! LaTeX as text in the box, which is why the picture's alt text is the LaTeX.

use super::geom::sane;
use super::{Ctx, Parts, measure::size_or};
use crate::model::{Element, MathEl};

/// The size a formula is set at when it names none, in points.
pub const DEFAULT_SIZE: f64 = 32.0;

/// FNV-1a over 64 bits: cheap, simple to write in any language, and the same everywhere.
fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x0100_0000_01b3)
    })
}

/// The name of the picture of a formula in the host's image store: `math/` and 16 hex
/// digits and `.png`. The digits are the FNV-1a hash (64 bits) of the LaTeX, the colour
/// as written (empty when absent), the size in points as written by `{}` (32 when absent)
/// and `i` for an inline formula or `d` for a display one, each followed by a zero byte.
///
/// The picture is drawn in the element's colour, or the theme's text colour when it has
/// none. The name does not say which colour that is, so a host that keeps pictures from
/// one export to the next should keep them per theme.
pub fn math_image_path(element: &MathEl) -> String {
    let size = size_or(element.font_size, DEFAULT_SIZE);
    let key = format!(
        "{}\0{}\0{}\0{}\0",
        element.latex,
        element.color.as_deref().unwrap_or(""),
        size,
        if element.inline { "i" } else { "d" }
    );
    format!("math/{:016x}.png", fnv1a(key.as_bytes()))
}

pub fn expand(cx: &Ctx, element: &MathEl) -> Vec<Element> {
    let rect = sane(cx.rect);
    let mut parts = Parts::new(cx.id, rect);
    parts.image(rect, &math_image_path(element), Some(&element.latex));
    parts.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::composites::expand as expand_element;
    use crate::model::{Base, Extra};

    fn formula(latex: &str) -> MathEl {
        MathEl {
            base: Base::new("e-math").place(100.0, 100.0, 400.0, 120.0),
            latex: latex.to_owned(),
            inline: false,
            color: None,
            font_size: None,
            extra: Extra::new(),
        }
    }

    #[test]
    fn the_hash_is_the_fnv_1a_of_the_formula_colour_size_and_kind() {
        // The bytes of the key, hashed by the definition of FNV-1a.
        let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
        for byte in b"E=mc^2\0\0".iter().chain(b"32\0d\0") {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0100_0000_01b3);
        }
        assert_eq!(
            math_image_path(&formula("E=mc^2")),
            format!("math/{hash:016x}.png")
        );
        // Written down, so a host that makes the same names in another language can check itself
        // (worked out by a second implementation, in Python).
        assert_eq!(
            math_image_path(&formula("E=mc^2")),
            "math/5236592fa920b5e6.png"
        );
        assert_eq!(
            math_image_path(&formula("\\frac{a}{b}")),
            "math/e1c1b7990b7d697d.png"
        );
    }

    #[test]
    fn the_same_formula_is_the_same_name_and_any_difference_is_another() {
        let base = formula("\\frac{a}{b}");
        assert_eq!(math_image_path(&base), math_image_path(&base.clone()));
        let path = math_image_path(&base);
        assert!(
            path.starts_with("math/")
                && path.ends_with(".png")
                && path.len() == "math/".len() + 16 + ".png".len()
        );
        assert!(
            path["math/".len()..path.len() - 4]
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        );
        let mut other = base.clone();
        other.latex.push('x');
        let mut coloured = base.clone();
        coloured.color = Some("accent1".into());
        let mut sized = base.clone();
        sized.font_size = Some(40.0);
        let mut inline = base.clone();
        inline.inline = true;
        let names: Vec<String> = [&base, &other, &coloured, &sized, &inline]
            .iter()
            .map(|m| math_image_path(m))
            .collect();
        let mut unique = names.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(unique.len(), 5, "{names:?}");
        // Position, id and steps are not in the picture.
        let mut moved = base.clone();
        moved.base = Base::new("e-other").place(0.0, 0.0, 1.0, 1.0);
        assert_eq!(math_image_path(&moved), path);
        // The size the formula is set at, written out, is the same as leaving it out.
        let mut explicit = base.clone();
        explicit.font_size = Some(32.0);
        assert_eq!(math_image_path(&explicit), path);
    }

    #[test]
    fn a_formula_is_one_picture_of_the_whole_box_with_the_latex_as_its_alt_text() {
        let theme = crate::themes::light();
        let parts = expand_element(&theme, "blank", &Element::Math(formula("x^2"))).expect("parts");
        assert_eq!(parts.len(), 1);
        let Element::Image(picture) = &parts[0] else {
            panic!("a picture")
        };
        assert_eq!(picture.base.id, "e-math.1");
        assert_eq!(picture.base.rect(), Some((100.0, 100.0, 400.0, 120.0)));
        assert_eq!(picture.base.alt.as_deref(), Some("x^2"));
        assert_eq!(picture.src, math_image_path(&formula("x^2")));
    }

    #[test]
    fn a_box_with_no_size_still_gets_its_picture() {
        let theme = crate::themes::light();
        let mut el = formula("x");
        el.base = Base::new("e-math").place(f64::NAN, 5.0, -3.0, 0.0);
        let parts = expand_element(&theme, "blank", &Element::Math(el)).expect("parts");
        let (x, y, w, h) = parts[0].base().rect().expect("a box");
        assert!([x, y, w, h].iter().all(|v| v.is_finite() && *v >= 0.0));
    }
}
