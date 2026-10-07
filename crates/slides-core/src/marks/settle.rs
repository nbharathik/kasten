//! Taking a mark off an element a change has touched.

use super::{batches, same_work, set_batches};
use crate::model::{Deck, Slide};
use crate::ops::Snapshot;

/// After an operation: on each slide it could change, the marks of elements
/// that are gone, or are not what they were, are taken off. `before` is the
/// part of the deck the operation may change, as it was.
pub(crate) fn settle(before: &Snapshot, deck: &mut Deck) {
    for (id, old) in before.slides_before() {
        let (Some(old), Some(slide)) = (old, deck.slide_mut(id)) else {
            continue;
        };
        let marks = batches(slide);
        if marks.is_empty() {
            continue;
        }
        let left = still_marked(old, slide, &marks);
        if left != marks {
            set_batches(slide, left);
        }
    }
}

fn still_marked(old: &Slide, slide: &Slide, marks: &[super::AgentBatch]) -> Vec<super::AgentBatch> {
    marks
        .iter()
        .map(|batch| {
            let mut kept = batch.clone();
            kept.ids.retain(|id| {
                matches!((old.element(id), slide.element(id)), (Some(a), Some(b)) if same_work(a, b))
            });
            kept
        })
        .collect()
}
