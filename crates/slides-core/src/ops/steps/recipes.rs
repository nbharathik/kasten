//! What each build sets on the elements it is given.

use std::collections::BTreeMap;

use super::order::{texts, texts_mut};
use crate::model::{Element, ListKind, StepState, Text};

/// The entries that make an element be in `state_at(step)` at every step from 0 to
/// `steps`: one wherever the state changes. An element that says nothing is normal, so
/// the first entry is measured from that.
fn entries(steps: u32, state_at: impl Fn(u32) -> StepState) -> BTreeMap<u32, StepState> {
    let mut out = BTreeMap::new();
    let mut before = StepState::Normal;
    for step in 0..=steps {
        let now = state_at(step);
        if now != before {
            out.insert(step, now.clone());
        }
        before = now;
    }
    out
}

/// Not there until step `position`, then there.
pub(super) fn reveal(position: u32, total: u32) -> BTreeMap<u32, StepState> {
    entries(total, |step| {
        if step < position {
            StepState::Hidden
        } else {
            StepState::Normal
        }
    })
}

/// The slide arrives as it is; from the first click the element at `position` is in
/// `current` and every other one in the set is dimmed.
pub(super) fn in_turn(position: u32, total: u32, current: StepState) -> BTreeMap<u32, StepState> {
    entries(total, |step| match step {
        0 => StepState::Normal,
        s if s == position => current.clone(),
        _ => StepState::Dimmed,
    })
}

/// Takes every state and every paragraph step from an element (not from what a group holds).
pub(super) fn reset(element: &mut Element) {
    element.base_mut().step_states.clear();
    for text in texts_mut(element) {
        for paragraph in &mut text.paragraphs {
            paragraph.step = None;
        }
    }
}

fn is_item(paragraph: &crate::model::Paragraph) -> bool {
    matches!(paragraph.list, Some(ListKind::Bullet | ListKind::Number))
}

/// The words of a box that can be shown a line at a time: a text box or a shape.
pub(super) fn body(element: &Element) -> Option<&Text> {
    match element {
        Element::Text(_) | Element::Shape(_) => texts(element).into_iter().next(),
        _ => None,
    }
}

/// How many list items a box holds.
pub(super) fn items_in(element: &Element) -> usize {
    body(element).map_or(0, |text| {
        text.paragraphs.iter().filter(|p| is_item(p)).count()
    })
}

/// Makes the list items of a box appear one at a time, from step 1. The paragraphs that
/// are not list items are always there. Returns how many steps that is.
pub(super) fn reveal_items(element: &mut Element) -> u32 {
    reset(element);
    let mut step = 0;
    if let Some(text) = texts_mut(element).into_iter().next() {
        for paragraph in text.paragraphs.iter_mut().filter(|p| is_item(p)) {
            step += 1;
            paragraph.step = Some(step);
        }
    }
    step
}
