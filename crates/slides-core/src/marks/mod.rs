//! Marks on an assistant's work: which elements of a slide an agent made or
//! changed, and has not yet been looked at by a person.
//!
//! The marks are part of the deck, in a field the model does not list, on the
//! slide that holds the elements: `x-agent`, a list of batches. A batch is the
//! elements one agent (a client, in one session) made or changed at one time,
//! with the time, so a host can say "made by claude-code, 3 minutes ago" and
//! undo the session. Builds that do not know the field keep it, as they keep
//! every field they do not know, and the format's version does not change.
//!
//! * The tools an agent works through write the marks ([`stamp`]): after a
//!   change they mark what differs, and they keep the marks the deck already
//!   had on what the change left alone. The agent cannot write or remove
//!   them itself.
//! * The engine takes a mark off an element when an operation changes the
//!   element or deletes it ([`settle`]), in the same step of undo as the change.
//!   Whoever the operation is by, that is an edit; an agent's tools mark again.
//! * `accept_marks` takes marks off without changing anything else.
//!
//! A mark says nothing about an element that is not on the slide, nor about
//! one a person has since changed: such ids are dropped whenever the marks are
//! next written.

use std::collections::HashSet;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::model::{Element, Slide};

mod settle;
mod stamp;
#[cfg(test)]
mod tests;

pub(crate) use settle::settle;
pub use stamp::{Author, stamp, stamp_new};

/// The field of a slide that holds its marks.
pub const KEY: &str = "x-agent";

model! {
    /// The elements one agent made or changed at one time, on one slide.
    #[serde(rename_all = "camelCase")]
    pub struct AgentBatch {
        /// When, in milliseconds since 1970: the latest work of the batch.
        pub at: u64,
        /// Who: the agent's client, such as `claude-code`.
        pub by: String,
        /// The elements, by id, wherever they are on the slide.
        pub ids: Vec<String>,
        /// The agent's session, for a host that can undo everything a session did.
        #[serde(default, skip_serializing_if = "String::is_empty")]
        pub session: String,
    }
}

/// The batches on a slide. A field that is not a list of batches (written by
/// hand, or by something else) counts as none, and is left as it is.
pub fn batches(slide: &Slide) -> Vec<AgentBatch> {
    slide
        .extra
        .get(KEY)
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .unwrap_or_default()
}

/// Writes the batches on a slide, leaving out empty ones; no batches, no field.
pub(crate) fn set_batches(slide: &mut Slide, batches: Vec<AgentBatch>) {
    let kept: Vec<AgentBatch> = batches.into_iter().filter(|b| !b.ids.is_empty()).collect();
    if kept.is_empty() {
        slide.extra.remove(KEY);
    } else if let Ok(value) = serde_json::to_value(kept) {
        slide.extra.insert(KEY.to_owned(), value);
    }
}

/// The ids of the marked elements that are on the slide.
pub fn marked_ids(slide: &Slide) -> HashSet<String> {
    let present = ids_in_order(&slide.elements);
    batches(slide)
        .into_iter()
        .flat_map(|b| b.ids)
        .filter(|id| present.contains(id))
        .collect()
}

/// The ids on a slide in the order they are drawn from the bottom of the
/// stack up, a group's children after the group.
pub(crate) fn ordered_ids(list: &[Element], out: &mut Vec<String>) {
    for element in list {
        out.push(element.id().to_owned());
        ordered_ids(element.children(), out);
    }
}

fn ids_in_order(list: &[Element]) -> HashSet<String> {
    let mut all = Vec::new();
    ordered_ids(list, &mut all);
    all.into_iter().collect()
}

/// Whether two versions of an element are the same work. A group is compared
/// without its children, which have marks of their own.
pub(crate) fn same_work(a: &Element, b: &Element) -> bool {
    match (a, b) {
        (Element::Group(x), Element::Group(y)) => x.base == y.base && x.extra == y.extra,
        _ => a == b,
    }
}
