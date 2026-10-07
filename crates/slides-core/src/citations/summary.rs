//! What an editor shows of a work when a person chooses one to cite.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::format::{full_label, short_label};
use super::refs::Entry;

model! {
    /// One work of a bibliography, as it is listed for a person to choose from.
    #[serde(rename_all = "camelCase")]
    pub struct Reference {
        /// What a citation names it by.
        pub key: String,
        /// The entry's type in lower case: `article`, `inproceedings`, `book` ...
        pub kind: String,
        /// Empty when the entry has none.
        pub title: String,
        /// Each author as the name is said: `Ashish Vaswani`. The editors, when there are no authors.
        pub authors: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub year: Option<String>,
        /// The journal or conference, or where else it appeared.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub venue: Option<String>,
        /// The arXiv identifier, if it has one.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub eprint: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub doi: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub url: Option<String>,
        /// How the `short` format writes it: `Vaswani et al., 2017 (NeurIPS)`.
        pub short: String,
        /// How the `full` format writes it, on one line.
        pub full: String,
    }
}

impl Reference {
    pub(super) fn of(entry: &Entry) -> Reference {
        Reference {
            key: entry.key().to_owned(),
            kind: entry.kind().to_owned(),
            title: entry.title().unwrap_or_default(),
            authors: entry.authors().named(),
            year: entry.year(),
            venue: entry.venue(),
            eprint: entry.eprint(),
            doi: entry.doi(),
            url: entry.url(),
            short: short_label(entry),
            full: full_label(entry),
        }
    }
}
