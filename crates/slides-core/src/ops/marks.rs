//! Accepting an assistant's work: taking the marks off, changing nothing else.

use std::collections::HashSet;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::util::slide_mut;
use super::{Cx, Op, Scope, op_types};
use crate::error::{Error, Result};
use crate::marks::{batches, marked_ids, set_batches};
use crate::model::Deck;

op_types! {
    /// Accepts what an assistant made or changed: the mark that says so comes off.
    pub struct AcceptMarks {
        /// Only this slide's marks. Without it, every slide's.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub slide: Option<String>,
        /// Only these elements of `slide`. Without them, all its marked elements.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub ids: Option<Vec<String>>,
    }

    pub struct Accepted {
        /// How many elements were marked and no longer are.
        pub count: usize,
    }
}

impl Op for AcceptMarks {
    type Output = Accepted;
    const NAME: &'static str = "accept_marks";
    const ABOUT: &'static str = "The person accepts what an assistant made or changed: the marks that show it (a badge on the element) come off the elements of a slide, of the whole deck, or of the given `ids`. Nothing else changes. An assistant does not accept its own work: this is for the editor.";

    fn scope(&self, deck: &Deck) -> Scope {
        match &self.slide {
            Some(id) => Scope::slide(id),
            None => Scope::slides(
                deck.slides
                    .iter()
                    .filter(|s| !batches(s).is_empty())
                    .map(|s| &s.id),
            ),
        }
    }

    fn run(self, cx: &mut Cx) -> Result<Accepted> {
        let slides: Vec<String> = match &self.slide {
            Some(id) => vec![id.clone()],
            None if self.ids.is_some() => {
                return Err(Error::bad_input(
                    Self::NAME,
                    "`ids` name elements of one slide: give the `slide` they are on",
                ));
            }
            None => cx.deck.slides.iter().map(|s| s.id.clone()).collect(),
        };
        let only: Option<HashSet<&String>> = self.ids.as_ref().map(|ids| ids.iter().collect());
        let mut count = 0;
        for id in slides {
            let slide = slide_mut(cx.deck, &id)?;
            let before = marked_ids(slide).len();
            let kept = batches(slide)
                .into_iter()
                .map(|mut batch| {
                    if let Some(only) = &only {
                        batch.ids.retain(|id| !only.contains(id));
                    } else {
                        batch.ids.clear();
                    }
                    batch
                })
                .collect::<Vec<_>>();
            if before > 0 {
                set_batches(slide, kept);
            }
            count += before - marked_ids(slide).len();
        }
        Ok(Accepted { count })
    }
}
