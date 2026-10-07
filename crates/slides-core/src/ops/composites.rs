//! Operations on composite elements (code, math, a chat, a grid of cards ...),
//! and the rule that a slide has the steps its composites ask for.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::geometry::refit;
use super::steps::MOST_STEPS;
use super::util::{assign_ids, ids_on, parent_list, path_of};
use super::{Cx, Op, Scope, op_types};
use crate::citations::{Cites, Numbering};
use crate::composites;
use crate::error::{Error, Result};
use crate::model::{Deck, Element, Slide};

/// Raises a slide's steps to what its composites ask for, and never lowers them: a code
/// block with three focus entries needs three steps, or its walkthrough has nowhere to go.
/// A slide has at most `MOST_STEPS`, so a longer walkthrough is raised only that far.
/// The operations that add, change, paste or copy elements call it once they are done.
pub fn follow_content(slide: &mut Slide) {
    let needed = composites::slide_steps_needed(slide).min(MOST_STEPS);
    slide.steps = slide.steps.max(needed);
}

op_types! {
    /// Turns a composite into the plain elements it is drawn with.
    pub struct ExpandComposite {
        pub slide: String,
        /// The composite: a code, chat, token-probs, card-grid, citation, step-label, embed or video element (not math).
        pub id: String,
    }

    pub struct ExpandedComposite {
        /// The group that took the composite's place; it has the composite's id.
        pub group: String,
        /// The ids of the text, shapes and pictures in it, bottom to top.
        pub parts: Vec<String>,
    }
}

impl Op for ExpandComposite {
    type Output = ExpandedComposite;
    const NAME: &'static str = "expand_composite";
    const ABOUT: &'static str = "Ungroup to shapes: replace a composite (code, chat, token-probs, card-grid, citation, step-label, embed or video) by a group of the text boxes, shapes, lines and pictures it is drawn with, at the same place in the stacking order. The group keeps the composite's id, name, alt text, steps and link. What made it a composite (the code and its language, the messages, the cards ...) is gone from the deck, so use it when the shapes need editing one by one; undo brings the composite back. Refused for anything that is not a composite, and for math: a formula is drawn as a picture, so there are no shapes to make.";

    fn scope(&self, _: &Deck) -> Scope {
        Scope::slide(&self.slide)
    }

    fn run(self, cx: &mut Cx) -> Result<ExpandedComposite> {
        // A citation is written with the numbers the whole deck gives its works.
        let numbering = Numbering::of(cx.deck);
        let cites = Cites {
            refs: cx.refs,
            numbering: Some(&numbering),
        };
        let Deck { theme, slides, .. } = &mut *cx.deck;
        let slide = slides
            .iter_mut()
            .find(|s| s.id == self.slide)
            .ok_or_else(|| Error::no_slide(&self.slide))?;
        let path = path_of(&slide.elements, &self.id)
            .ok_or_else(|| Error::no_element(&self.slide, &self.id))?;
        let composite = slide
            .element(&self.id)
            .cloned()
            .ok_or_else(|| Error::no_element(&self.slide, &self.id))?;
        if !composite.is_composite() {
            return Err(Error::refused(format!(
                "`{}` is a {}, not a composite. Only code, chat, token-probs, card-grid, citation, step-label, embed and video elements can be ungrouped to shapes; use ungroup_element for a group.",
                self.id,
                composite.kind()
            )));
        }
        if matches!(composite, Element::Math(_)) {
            return Err(Error::refused(format!(
                "`{}` is a formula, which is drawn as a picture made from its LaTeX, so there are no shapes to ungroup it to. To change it, patch its `latex` with patch_elements; to have plain text instead, remove it and add a text box.",
                self.id
            )));
        }
        let mut group = composites::expanded_group_with(theme, &slide.layout, &composite, &cites).ok_or_else(|| {
            Error::refused(format!(
                "`{}` has no box to draw its parts in: give it x, y, w and h, or a placeholder the layout has.",
                self.id
            ))
        })?;
        // The parts are named after the composite, so they are free unless something else took the name.
        let mut taken = ids_on(slide);
        if let Some(children) = group.children_mut() {
            assign_ids(children, &mut taken, cx.ids, true);
        }
        refit(&mut group);
        let parts = group.children().iter().map(|c| c.id().to_owned()).collect();

        let index = path[path.len() - 1];
        let list = parent_list(&mut slide.elements, &path)
            .ok_or_else(|| Error::no_element(&self.slide, &self.id))?;
        list[index] = group;
        Ok(ExpandedComposite {
            group: self.id,
            parts,
        })
    }
}
