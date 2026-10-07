//! The typefaces a deck can count on being drawn as written.

use crate::model::Theme;

/// The families the editor bundles, and the ones PowerPoint has that the
/// bundled open fonts stand in for at the same width: Carlito for Calibri,
/// Caladea for Cambria, and the Liberation faces (Arimo, Tinos and Cousine
/// under their other names) for Arial, Times New Roman and Courier New.
/// Georgia, Helvetica and the rest are not here: nothing draws them the same
/// on every machine.
pub const BUNDLED: &[&str] = &[
    "Inter",
    "Lato",
    "Roboto",
    "Roboto Mono",
    "Carlito",
    "Calibri",
    "Caladea",
    "Cambria",
    "Liberation Sans",
    "Arimo",
    "Arial",
    "Liberation Serif",
    "Tinos",
    "Times New Roman",
    "Liberation Mono",
    "Cousine",
    "Courier New",
];

/// The roles a run can name instead of a family.
const ROLES: &[&str] = &["heading", "body", "code"];

/// The generic families every system resolves.
const GENERIC: &[&str] = &["serif", "sans-serif", "monospace"];

/// Whether a font named by a run is drawn as written: a role of the theme,
/// one of the theme's own families, a bundled family, or a generic one.
pub fn is_known(theme: &Theme, name: &str) -> bool {
    let name = name.trim();
    let same = |other: &str| other.trim().eq_ignore_ascii_case(name);
    name.is_empty()
        || ROLES.iter().any(|r| same(r))
        || GENERIC.iter().any(|g| same(g))
        || BUNDLED.iter().any(|b| same(b))
        || [&theme.fonts.heading, &theme.fonts.body, &theme.fonts.code]
            .iter()
            .any(|slot| same(&slot.family))
}

/// The bundled families, for a hint.
pub fn list() -> String {
    [
        "Inter",
        "Lato",
        "Roboto",
        "Roboto Mono",
        "Calibri",
        "Cambria",
        "Arial",
        "Times New Roman",
        "Courier New",
    ]
    .join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roles_bundled_theme_and_generic_families_are_known() {
        let theme = crate::themes::light();
        for name in [
            "heading",
            "Body",
            "Inter",
            "arial",
            "Times New Roman",
            "monospace",
            " Lato ",
        ] {
            assert!(is_known(&theme, name), "{name}");
        }
        for name in ["Comic Sans MS", "Georgia", "Helvetica"] {
            assert!(!is_known(&theme, name), "{name}");
        }
        let serif = crate::themes::serif();
        assert!(is_known(&serif, "Cambria"));
    }
}
