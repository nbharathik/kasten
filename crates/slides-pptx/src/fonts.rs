//! Typefaces. The theme's heading and body fonts are written as references
//! (`+mj-lt`, `+mn-lt`) so changing the theme's fonts in PowerPoint changes the
//! deck; the code font and any family a run names are written by name.

use slides_core::{FontSpec, Theme};

use crate::xml::Xml;

/// What a family looks like, which PowerPoint uses to pick a stand-in when it
/// lacks the font: a swiss font is replaced by another sans, a mono by a mono.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    Sans,
    Serif,
    Mono,
}

impl Kind {
    /// The `pitchFamily` byte: family in the high bits, pitch in the low two.
    fn pitch_family(self) -> i64 {
        match self {
            Kind::Sans => 0x22,
            Kind::Serif => 0x12,
            Kind::Mono => 0x31,
        }
    }
}

/// A typeface as it is written.
#[derive(Clone, Debug, PartialEq)]
pub struct Face {
    pub typeface: String,
    /// Absent for a reference to the theme's fonts, which the theme describes.
    pub kind: Option<Kind>,
}

const MONOSPACE: &[&str] = &[
    "mono",
    "courier",
    "consolas",
    "menlo",
    "monaco",
    "typewriter",
];
const SERIF: &[&str] = &[
    "georgia",
    "times",
    "cambria",
    "caladea",
    "garamond",
    "palatino",
    "book antiqua",
    "baskerville",
    "bodoni",
    "didot",
    "charter",
    "playfair",
    "merriweather",
];

/// Whether `word` stands alone in `text` (not inside a longer word).
fn has_word(text: &str, word: &str) -> bool {
    text.match_indices(word).any(|(at, _)| {
        let before = text[..at].chars().next_back();
        let after = text[at + word.len()..].chars().next();
        !before.is_some_and(char::is_alphanumeric) && !after.is_some_and(char::is_alphanumeric)
    })
}

/// The kind of a set of families, judging by their names as the editor does.
pub fn kind_of(names: &[&str]) -> Kind {
    let all = names.join(" ").to_lowercase();
    if MONOSPACE.iter().any(|n| all.contains(n)) || has_word(&all, "code") {
        return Kind::Mono;
    }
    let serif = has_word(&all, "serif")
        || SERIF.iter().any(|n| all.contains(n))
        || all
            .match_indices("lora")
            .any(|(at, _)| !all[at + 4..].starts_with(char::is_alphanumeric));
    if serif && !all.contains("sans") {
        Kind::Serif
    } else {
        Kind::Sans
    }
}

fn kind_of_slot(slot: &FontSpec) -> Kind {
    let mut names = vec![slot.family.as_str()];
    names.extend(slot.fallback.iter().map(String::as_str));
    kind_of(&names)
}

/// The typeface for a role of the theme (`heading`, `body`, `code`) or a family name.
pub fn face(theme: &Theme, font: &str) -> Face {
    let fonts = &theme.fonts;
    match font.trim() {
        "" | "body" => Face {
            typeface: "+mn-lt".to_owned(),
            kind: None,
        },
        "heading" => Face {
            typeface: "+mj-lt".to_owned(),
            kind: None,
        },
        "code" => Face {
            typeface: fonts.code.family.clone(),
            kind: Some(kind_of_slot(&fonts.code)),
        },
        name => {
            let known = [&fonts.heading, &fonts.body, &fonts.code]
                .into_iter()
                .find(|slot| slot.family.eq_ignore_ascii_case(name));
            Face {
                typeface: name.to_owned(),
                kind: Some(known.map_or_else(|| kind_of(&[name]), kind_of_slot)),
            }
        }
    }
}

impl Face {
    /// `<a:latin typeface="..."/>`.
    pub fn write(&self, x: &mut Xml) {
        x.open("a:latin").attr("typeface", &self.typeface);
        if let Some(kind) = self.kind {
            x.int("pitchFamily", kind.pitch_family()).int("charset", 0);
        }
        x.close();
    }
}

/// One of the theme's font slots: the latin face, and the east asian and complex
/// script faces, which are left to the viewer.
pub fn write_theme_font(x: &mut Xml, tag: &str, slot: &FontSpec) {
    x.open(tag);
    Face {
        typeface: slot.family.clone(),
        kind: Some(kind_of_slot(slot)),
    }
    .write(x);
    x.leaf("a:ea", &[("typeface", "")]);
    x.leaf("a:cs", &[("typeface", "")]);
    x.close();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(face: &Face) -> String {
        let mut x = Xml::fragment();
        face.write(&mut x);
        x.into_string()
    }

    #[test]
    fn heading_and_body_are_theme_references() {
        let theme = slides_core::themes::light();
        assert_eq!(
            write(&face(&theme, "heading")),
            r#"<a:latin typeface="+mj-lt"/>"#
        );
        assert_eq!(
            write(&face(&theme, "body")),
            r#"<a:latin typeface="+mn-lt"/>"#
        );
        assert_eq!(write(&face(&theme, "")), r#"<a:latin typeface="+mn-lt"/>"#);
    }

    #[test]
    fn code_and_named_families_are_written_by_name_with_a_hint() {
        let theme = slides_core::themes::light();
        assert_eq!(
            write(&face(&theme, "code")),
            r#"<a:latin typeface="Roboto Mono" pitchFamily="49" charset="0"/>"#
        );
        assert_eq!(
            write(&face(&theme, "Georgia")),
            r#"<a:latin typeface="Georgia" pitchFamily="18" charset="0"/>"#
        );
        assert_eq!(
            write(&face(&theme, "Arial")),
            r#"<a:latin typeface="Arial" pitchFamily="34" charset="0"/>"#
        );
    }

    #[test]
    fn the_kind_follows_the_names_as_the_editor_judges_them() {
        assert_eq!(
            kind_of(&["Inter", "Helvetica Neue", "Arial", "sans-serif"]),
            Kind::Sans
        );
        assert_eq!(
            kind_of(&["Cambria", "Caladea", "Georgia", "serif"]),
            Kind::Serif
        );
        assert_eq!(
            kind_of(&["Courier New", "Liberation Mono", "monospace"]),
            Kind::Mono
        );
        assert_eq!(kind_of(&["Fira Code"]), Kind::Mono);
        assert_eq!(kind_of(&["Source Sans", "serif"]), Kind::Sans);
        assert_eq!(kind_of(&["Lora"]), Kind::Serif);
    }

    #[test]
    fn a_theme_font_slot_names_latin_and_leaves_the_rest_to_the_viewer() {
        let theme = slides_core::themes::serif();
        let mut x = Xml::fragment();
        write_theme_font(&mut x, "a:majorFont", &theme.fonts.heading);
        assert_eq!(
            x.into_string(),
            r#"<a:majorFont><a:latin typeface="Cambria" pitchFamily="18" charset="0"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>"#
        );
    }
}
