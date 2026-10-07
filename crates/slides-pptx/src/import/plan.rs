//! How an imported deck goes into a deck that is being edited: as slides added to it (in the
//! look of the deck), in its place, or as a new version of it. The plan is a list of operations
//! for the editor to apply together, so the whole import is one step to undo.

use std::collections::HashSet;

use serde_json::{Value, json};
use slides_core::ids::{IdGen, SLIDE};
use slides_core::{Deck, Slide};

use super::adapt::{Frame, adapt_slide};
use super::merge::merge_with_report;

/// Where the imported slides go.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Mode {
    /// After a slide of the deck (the end if none is named), in the deck's theme.
    Add { after: Option<String> },
    /// In place of everything in the deck.
    Replace,
    /// As a new version of the deck: what is still there keeps its identity.
    Merge,
}

/// What to do, and what it will make.
#[derive(Clone, Debug, PartialEq)]
pub struct Plan {
    /// Operations, `(name, input)`, to apply as one step.
    pub operations: Vec<(String, Value)>,
    /// The slides of the import once the operations are applied, by id, in deck order.
    pub slides: Vec<String>,
    /// What a person may want to know about how the import was put in.
    pub notes: Vec<String>,
}

fn seed_of(a: &str, b: &str) -> u64 {
    a.bytes()
        .chain(b.bytes())
        .fold(0xcbf2_9ce4_8422_2325, |h, byte| {
            (h ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
        })
}

fn without_marker(mut slide: Slide) -> Slide {
    slide.extra.remove("pptxMarker");
    slide
}

/// Plans putting `imported` into `existing`.
pub fn plan_import(existing: &Deck, imported: Deck, mode: &Mode) -> Plan {
    match mode {
        Mode::Add { after } => {
            let mut notes = Vec::new();
            if !imported.sections.is_empty() {
                notes.push(format!(
                    "The file's {} sections were not added.",
                    imported.sections.len()
                ));
            }
            let mut ids = IdGen::new(seed_of(&existing.id, &imported.id));
            let mut taken: HashSet<String> = existing.slides.iter().map(|s| s.id.clone()).collect();
            let (theme, size) = (imported.theme.clone(), imported.size.clone());
            let from = Frame {
                theme: &theme,
                size: &size,
            };
            let to = Frame {
                theme: &existing.theme,
                size: &existing.size,
            };
            let mut slides = Vec::with_capacity(imported.slides.len());
            for slide in imported.slides {
                let mut slide = without_marker(adapt_slide(slide, from, to));
                if slide.id.is_empty() || taken.contains(&slide.id) {
                    slide.id = ids.fresh(SLIDE, |c| taken.contains(c));
                }
                taken.insert(slide.id.clone());
                slides.push(slide);
            }
            let named: Vec<String> = slides.iter().map(|s| s.id.clone()).collect();
            let input = match after {
                Some(id) => json!({ "slides": slides, "after": id }),
                None => json!({ "slides": slides }),
            };
            Plan {
                operations: vec![("add_slides".to_owned(), input)],
                slides: named,
                notes,
            }
        }
        Mode::Replace => {
            let mut deck = imported;
            deck.slides = deck.slides.into_iter().map(without_marker).collect();
            let slides = deck.slides.iter().map(|s| s.id.clone()).collect();
            Plan {
                operations: vec![("replace_deck".to_owned(), json!({ "deck": deck }))],
                slides,
                notes: Vec::new(),
            }
        }
        Mode::Merge => {
            let merged = merge_with_report(existing, imported);
            let slides = merged.deck.slides.iter().map(|s| s.id.clone()).collect();
            Plan {
                operations: vec![("replace_deck".to_owned(), json!({ "deck": merged.deck }))],
                slides,
                notes: merged.notes,
            }
        }
    }
}

#[cfg(test)]
mod tests;
