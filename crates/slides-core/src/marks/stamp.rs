//! Writing the marks of an agent's work: what differs between the deck the
//! agent read and the deck its tool made is what it made or changed.

use std::collections::HashSet;

use super::{AgentBatch, batches, ordered_ids, same_work, set_batches};
use crate::model::{Deck, Slide};

/// Who did the work and when.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Author {
    /// The agent's client, such as `claude-code`.
    pub by: String,
    /// Its session, or empty when a host has none.
    pub session: String,
    /// Milliseconds since 1970.
    pub at: u64,
}

/// Marks in `after` what `author` made or changed since `before`. The marks
/// come out as `before` had them, for the elements the work left alone (and
/// still on their slide), and as `author`'s for the elements it made or
/// changed; whatever marks `after` came with are set aside, since they are
/// not the tool's to say. A deck with nothing to mark is written as it is.
pub fn stamp(before: &Deck, after: &mut Deck, author: &Author) {
    for slide in &mut after.slides {
        mark_slide(before.slide(&slide.id), slide, author);
    }
}

/// Marks everything in a deck an agent made whole, such as a deck made from an outline.
pub fn stamp_new(deck: &mut Deck, author: &Author) {
    for slide in &mut deck.slides {
        mark_slide(None, slide, author);
    }
}

fn mark_slide(before: Option<&Slide>, slide: &mut Slide, author: &Author) {
    let mut present = Vec::new();
    ordered_ids(&slide.elements, &mut present);
    let here: HashSet<&str> = present.iter().map(String::as_str).collect();
    let changed: HashSet<String> = present
        .iter()
        .filter(|id| {
            let then = before.and_then(|s| s.element(id));
            let now = slide.element(id);
            !matches!((then, now), (Some(a), Some(b)) if same_work(a, b))
        })
        .cloned()
        .collect();

    // What the deck already said, less what this work changed and what is gone.
    let mut kept = before.map(batches).unwrap_or_default();
    for batch in &mut kept {
        batch
            .ids
            .retain(|id| here.contains(id.as_str()) && !changed.contains(id));
    }
    if !changed.is_empty() {
        match kept
            .iter_mut()
            .find(|b| b.by == author.by && b.session == author.session)
        {
            Some(batch) => {
                batch.at = author.at;
                batch.ids.extend(changed.iter().cloned());
                let both: HashSet<String> = batch.ids.iter().cloned().collect();
                batch.ids = present
                    .iter()
                    .filter(|id| both.contains(*id))
                    .cloned()
                    .collect();
            }
            None => kept.push(AgentBatch {
                at: author.at,
                by: author.by.clone(),
                ids: present
                    .iter()
                    .filter(|id| changed.contains(*id))
                    .cloned()
                    .collect(),
                session: author.session.clone(),
            }),
        }
    }
    kept.retain(|b| !b.ids.is_empty());
    // What the field held when the work came is not the work's to say. It is written from the batches above, unless
    // there are none and the work left the field as the deck had it (a value a person put there by hand stays).
    let was = before.and_then(|s| s.extra.get(super::KEY));
    if kept.is_empty() && slide.extra.get(super::KEY) == was {
        return;
    }
    set_batches(slide, kept);
}
