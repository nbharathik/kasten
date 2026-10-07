//! Find and replace across a whole deck.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{Cx, Op, Scope, op_types};
use crate::error::{Error, Result};
use crate::model::{Deck, Element, Text};

fn yes() -> bool {
    true
}

fn is_true(b: &bool) -> bool {
    *b
}

op_types! {
    pub struct ReplaceAll {
        pub find: String,
        pub replace: String,
        /// Off by default. Letters beyond ASCII match only in the same case.
        #[serde(default, skip_serializing_if = "crate::model::is_false")]
        pub case_sensitive: bool,
        /// Match only whole words.
        #[serde(default, skip_serializing_if = "crate::model::is_false")]
        pub whole_word: bool,
        /// Also replace in speaker notes; on by default.
        #[serde(default = "yes", skip_serializing_if = "is_true")]
        pub include_notes: bool,
    }

    pub struct Replaced {
        pub count: usize,
    }
}

fn matches_at(hay: &[u8], needle: &[u8], at: usize, exact: bool) -> bool {
    let Some(window) = hay.get(at..at + needle.len()) else {
        return false;
    };
    if exact {
        window == needle
    } else {
        window.eq_ignore_ascii_case(needle)
    }
}

fn word_edge(text: &str, start: usize, end: usize) -> bool {
    let before = text[..start]
        .chars()
        .next_back()
        .is_none_or(|c| !c.is_alphanumeric());
    let after = text[end..]
        .chars()
        .next()
        .is_none_or(|c| !c.is_alphanumeric());
    before && after
}

/// `text` with each match replaced, and how many there were.
fn replace_in(text: &str, op: &ReplaceAll) -> (String, usize) {
    let find = op.find.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut count = 0;
    let mut i = 0;
    while i < text.len() {
        if matches_at(text.as_bytes(), find, i, op.case_sensitive)
            && (!op.whole_word || word_edge(text, i, i + find.len()))
        {
            out.push_str(&op.replace);
            i += find.len();
            count += 1;
        } else {
            let len = text[i..].chars().next().map_or(1, char::len_utf8);
            out.push_str(&text[i..i + len]);
            i += len;
        }
    }
    (out, count)
}

fn in_text(text: &mut Text, op: &ReplaceAll, count: &mut usize) {
    for run in text.paragraphs.iter_mut().flat_map(|p| p.runs.iter_mut()) {
        let (replaced, n) = replace_in(&run.t, op);
        if n > 0 {
            run.t = replaced;
            *count += n;
        }
    }
}

fn in_element(e: &mut Element, op: &ReplaceAll, count: &mut usize) {
    match e {
        Element::Text(t) => in_text(&mut t.text, op, count),
        Element::Shape(s) => s.text.iter_mut().for_each(|t| in_text(t, op, count)),
        Element::Connector(c) => c.label.iter_mut().for_each(|t| in_text(t, op, count)),
        Element::Table(t) => t
            .rows
            .iter_mut()
            .flat_map(|r| r.cells.iter_mut())
            .for_each(|c| in_text(&mut c.text, op, count)),
        _ => {}
    }
    if let Some(children) = e.children_mut() {
        for child in children {
            in_element(child, op, count);
        }
    }
}

impl Op for ReplaceAll {
    type Output = Replaced;
    const NAME: &'static str = "replace_all";
    const ABOUT: &'static str = "Find and replace text in every slide, and in the speaker notes unless told not to. A phrase split across differently formatted words is not found. Returns how many were replaced.";

    fn scope(&self, _: &Deck) -> Scope {
        Scope {
            every_slide: true,
            order: true,
            ..Scope::default()
        }
    }

    fn run(self, cx: &mut Cx) -> Result<Replaced> {
        if self.find.is_empty() {
            return Err(Error::bad_input(Self::NAME, "`find` is empty"));
        }
        let mut count = 0;
        for slide in &mut cx.deck.slides {
            for e in &mut slide.elements {
                in_element(e, &self, &mut count);
            }
            if self.include_notes {
                let (notes, n) = replace_in(&slide.notes, &self);
                if n > 0 {
                    slide.notes = notes;
                    count += n;
                }
            }
        }
        Ok(Replaced { count })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn op(find: &str, with: &str, case: bool, whole: bool) -> ReplaceAll {
        ReplaceAll {
            find: find.into(),
            replace: with.into(),
            case_sensitive: case,
            whole_word: whole,
            include_notes: true,
        }
    }

    #[test]
    fn replaces_every_match_and_counts_them() {
        assert_eq!(
            replace_in("cat concat Cat", &op("cat", "dog", false, false),),
            ("dog condog dog".to_owned(), 3)
        );
    }

    #[test]
    fn case_and_word_options_narrow_the_matches() {
        assert_eq!(
            replace_in("cat concat Cat", &op("cat", "dog", true, false)),
            ("dog condog Cat".to_owned(), 2)
        );
        assert_eq!(
            replace_in("cat concat Cat", &op("cat", "dog", false, true)),
            ("dog concat dog".to_owned(), 2)
        );
    }

    #[test]
    fn multibyte_text_around_a_match_is_left_alone() {
        assert_eq!(
            replace_in("héllo wörld, héllo", &op("héllo", "hi", false, false)),
            ("hi wörld, hi".to_owned(), 2)
        );
    }
}
