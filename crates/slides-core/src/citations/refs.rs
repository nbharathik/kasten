//! A bibliography: the works a citation key can name, in the order they were
//! written, each with the fields its BibTeX entry gave.

use std::collections::{BTreeMap, HashMap};

use super::bibtex::{self, Raw};
use super::latex::plain;
use super::names::{Authors, parse_list};
use super::summary::Reference;

/// One work: its key, the type of entry it was, and its fields.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    key: String,
    kind: String,
    fields: BTreeMap<String, String>,
}

impl From<Raw> for Entry {
    fn from(raw: Raw) -> Entry {
        Entry {
            key: raw.key,
            kind: raw.kind,
            fields: raw.fields,
        }
    }
}

impl Entry {
    pub fn key(&self) -> &str {
        &self.key
    }

    /// `article`, `inproceedings`, `book`: the entry's type in lower case.
    pub fn kind(&self) -> &str {
        &self.kind
    }

    /// A field as it was written (its outer braces off, its LaTeX in), by lower-case name.
    pub fn field(&self, name: &str) -> Option<&str> {
        self.fields.get(name).map(String::as_str)
    }

    /// A field as it reads, if it says anything.
    pub(super) fn text(&self, name: &str) -> Option<String> {
        let text = plain(self.field(name)?);
        (!text.is_empty()).then_some(text)
    }

    pub fn title(&self) -> Option<String> {
        self.text("title")
    }

    /// The `author` names, or the `editor`s when there are none.
    pub fn authors(&self) -> Authors {
        let named = |name: &str| {
            self.field(name)
                .map(parse_list)
                .filter(|a| !a.is_empty() || a.et_al)
        };
        named("author")
            .or_else(|| named("editor"))
            .unwrap_or_default()
    }

    /// The year: from `year`, else from `date`. `2017a` is 2017; words such as `in press` stand.
    pub fn year(&self) -> Option<String> {
        let from = |name: &str| self.text(name);
        let year = from("year").or_else(|| from("date"))?;
        let mut digits = String::new();
        for c in year.chars() {
            if c.is_ascii_digit() {
                digits.push(c);
                if digits.len() == 4 {
                    return Some(digits);
                }
            } else {
                digits.clear();
            }
        }
        (year.chars().count() <= 12).then_some(year)
    }

    /// The arXiv identifier, when the entry says it is a preprint.
    pub fn arxiv(&self) -> Option<String> {
        let id = self.text("eprint")?;
        let prefix = self
            .text("archiveprefix")
            .or_else(|| self.text("eprinttype"))
            .unwrap_or_default();
        let looks_like_one = id.split_once('.').is_some_and(|(a, b)| {
            a.len() == 4
                && a.bytes().all(|c| c.is_ascii_digit())
                && b.bytes().next().is_some_and(|c| c.is_ascii_digit())
        });
        (prefix.eq_ignore_ascii_case("arxiv") || looks_like_one).then_some(id)
    }

    /// The identifier of the work on the arXiv, whatever it is called there.
    pub fn eprint(&self) -> Option<String> {
        self.text("eprint")
    }

    pub fn doi(&self) -> Option<String> {
        self.text("doi")
    }

    pub fn url(&self) -> Option<String> {
        self.text("url")
    }

    /// The journal or conference, else the arXiv, else the publisher or institution: where it appeared.
    pub fn venue(&self) -> Option<String> {
        ["journal", "journaltitle", "booktitle"]
            .into_iter()
            .find_map(|name| self.text(name))
            .or_else(|| self.arxiv().map(|id| format!("arXiv:{id}")))
            .or_else(|| {
                [
                    "publisher",
                    "school",
                    "institution",
                    "organization",
                    "howpublished",
                ]
                .into_iter()
                .find_map(|name| self.text(name))
            })
    }
}

/// The works a citation can name: a bibliography, or just the keys of one.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Refs {
    entries: Vec<Entry>,
    index: HashMap<String, usize>,
}

impl Refs {
    /// A bibliography that knows only these keys, in this order.
    pub fn new<S: Into<String>>(keys: impl IntoIterator<Item = S>) -> Refs {
        let mut refs = Refs::default();
        for key in keys {
            refs.push(Entry {
                key: key.into(),
                kind: "misc".to_owned(),
                fields: BTreeMap::new(),
            });
        }
        refs
    }

    /// The entries of BibTeX text (see [`bibtex`]). `@string`, `@comment` and `@preamble`
    /// are not entries. A key that is in two entries is the first one's.
    pub fn from_bibtex(text: &str) -> Refs {
        let mut refs = Refs::default();
        for raw in bibtex::read(text) {
            refs.push(raw.into());
        }
        refs
    }

    fn push(&mut self, entry: Entry) {
        if entry.key.is_empty() || self.index.contains_key(&entry.key) {
            return;
        }
        self.index.insert(entry.key.clone(), self.entries.len());
        self.entries.push(entry);
    }

    pub fn get(&self, key: &str) -> Option<&Entry> {
        self.entries.get(*self.index.get(key)?)
    }

    pub fn contains(&self, key: &str) -> bool {
        self.index.contains_key(key)
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// The works, in the order they were written.
    pub fn iter(&self) -> impl Iterator<Item = &Entry> {
        self.entries.iter()
    }

    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.entries.iter().map(Entry::key)
    }

    /// The key that looks most like `key`, if one is near enough to be a typo.
    pub fn closest(&self, key: &str) -> Option<&str> {
        let wanted = key.to_lowercase();
        self.keys()
            .map(|known| (distance(&known.to_lowercase(), &wanted), known))
            .filter(|(d, known)| {
                let lower = known.to_lowercase();
                *d <= 2 || lower.starts_with(&wanted) || wanted.starts_with(&lower)
            })
            .min_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(b.1)))
            .map(|(_, known)| known)
    }

    /// Every work with what an editor shows of it, in the order written.
    pub fn references(&self) -> Vec<Reference> {
        self.entries.iter().map(Reference::of).collect()
    }
}

/// The number of single-character edits between two strings.
fn distance(a: &str, b: &str) -> usize {
    let b: Vec<char> = b.chars().collect();
    let mut row: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.chars().enumerate() {
        let mut diagonal = row[0];
        row[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let above = row[j + 1];
            row[j + 1] = if ca == *cb {
                diagonal
            } else {
                1 + diagonal.min(above).min(row[j])
            };
            diagonal = above;
        }
    }
    row[b.len()]
}
