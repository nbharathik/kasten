//! The typefaces of each theme, and what stands in for one that is missing.

use crate::model::{FontSpec, Fonts};

fn font(family: &str, fallback: &[&str]) -> FontSpec {
    FontSpec {
        family: family.to_owned(),
        fallback: fallback.iter().copied().map(str::to_owned).collect(),
        extra: crate::model::Extra::new(),
    }
}

/// Inter and Roboto Mono are open fonts the editor bundles, so a deck set in
/// them looks the same on every machine. Google Slides offers them too.
pub(super) fn sans() -> Fonts {
    let text = ["Helvetica Neue", "Arial", "sans-serif"];
    Fonts {
        heading: font("Inter", &text),
        body: font("Inter", &text),
        code: font("Roboto Mono", &["Consolas", "monospace"]),
        extra: crate::model::Extra::new(),
    }
}

/// Cambria, Calibri and Courier New are written to PPTX as they are, so
/// PowerPoint finds them. The open fonts that lead each fallback list measure
/// the same, so lines break in the same places when a deck is drawn without them.
pub(super) fn serif() -> Fonts {
    Fonts {
        heading: font("Cambria", &["Caladea", "Georgia", "serif"]),
        body: font("Calibri", &["Carlito", "Arial", "sans-serif"]),
        code: font("Courier New", &["Liberation Mono", "monospace"]),
        extra: crate::model::Extra::new(),
    }
}
