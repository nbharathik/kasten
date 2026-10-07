//! What lint reports and what it is given: issues, the report they are
//! collected in, the sizes of laid-out text that only a browser can know,
//! and the list of references a citation key is looked up in.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

model! {
    /// How much a problem matters. Errors are wrong; warnings are probably
    /// wrong; info is worth a look.
    #[derive(Copy, Eq, PartialOrd, Ord, Hash)]
    #[serde(rename_all = "camelCase")]
    pub enum Severity {
        Error,
        Warning,
        Info,
    }

    /// One problem on a slide.
    #[serde(rename_all = "camelCase")]
    pub struct Issue {
        /// The rule that found it, such as `text-overflow`.
        pub rule: String,
        pub severity: Severity,
        /// The id of the slide.
        pub slide: String,
        /// The id of the element on that slide (the composite's own id for a
        /// part of a composite); absent when the problem is the slide's.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub element: Option<String>,
        /// What is wrong, in plain words.
        pub message: String,
        /// How to put it right.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub hint: Option<String>,
    }

    /// A rule that could not be checked, and why. Lint never leaves a rule
    /// out without saying so.
    #[serde(rename_all = "camelCase")]
    pub struct SkippedRule {
        pub rule: String,
        pub reason: String,
    }

    /// What lint found, in a fixed order: slides as they are in the deck, then
    /// errors before warnings before info, then rules in the order of the
    /// table, then elements from the bottom of the stack up.
    #[serde(rename_all = "camelCase")]
    pub struct Report {
        pub issues: Vec<Issue>,
        pub skipped: Vec<SkippedRule>,
    }

    /// How big one element's text turned out when it was laid out.
    #[serde(rename_all = "camelCase")]
    pub struct Measure {
        /// The width the text needs so that no word is broken, in slide
        /// units, insets included (the widest unbreakable word: an address
        /// or a word in the code font may be broken anywhere and does not count).
        pub text_width: f64,
        /// The height the text needs when it is wrapped to the area's width,
        /// in slide units, insets included.
        pub text_height: f64,
        /// The size of the area the text was laid out in when it is not the
        /// element's whole box: the text area of an ellipse, a table cell.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub area_width: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub area_height: Option<f64>,
    }

    /// The sizes of laid-out text, which only something that draws the words
    /// can know. A browser measures them with the real renderer; a host
    /// without one may estimate them and say so.
    #[derive(Default)]
    #[serde(rename_all = "camelCase")]
    pub struct Measures {
        /// By slide id, then element id (the id in the deck with its
        /// composites expanded, so the parts of a composite are `<id>.<n>`).
        #[serde(default)]
        pub slides: BTreeMap<String, BTreeMap<String, Measure>>,
        /// Worked out from the words, not measured: lint allows more slack.
        #[serde(default, skip_serializing_if = "crate::model::is_false")]
        pub estimated: bool,
    }
}

impl Severity {
    pub fn as_str(self) -> &'static str {
        match self {
            Severity::Error => "error",
            Severity::Warning => "warning",
            Severity::Info => "info",
        }
    }
}

impl Report {
    /// How many issues have this severity.
    pub fn count(&self, severity: Severity) -> usize {
        self.issues
            .iter()
            .filter(|i| i.severity == severity)
            .count()
    }

    /// Whether any issue is an error.
    pub fn has_errors(&self) -> bool {
        self.issues.iter().any(|i| i.severity == Severity::Error)
    }

    /// The issues of one slide.
    pub fn of_slide<'a>(&'a self, slide: &'a str) -> impl Iterator<Item = &'a Issue> {
        self.issues.iter().filter(move |i| i.slide == slide)
    }
}

impl Measures {
    /// What was measured for an element of a slide.
    pub fn of(&self, slide: &str, element: &str) -> Option<&Measure> {
        self.slides.get(slide)?.get(element)
    }
}

/// The references a citation key can name. They are read from BibTeX (see
/// [`crate::citations`]), which is also what draws the citations.
pub use crate::citations::Refs;

/// What a lint run is given besides the deck.
#[derive(Clone, Copy, Debug, Default)]
pub struct Options<'a> {
    /// The sizes of laid-out text. Without them `text-overflow` is skipped.
    pub measures: Option<&'a Measures>,
    /// The known citation keys. Without them `unresolved-citation` is skipped.
    pub refs: Option<&'a Refs>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn severities_sort_errors_first() {
        let mut all = vec![Severity::Info, Severity::Error, Severity::Warning];
        all.sort();
        assert_eq!(all, [Severity::Error, Severity::Warning, Severity::Info]);
    }
}
