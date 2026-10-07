//! What a host that draws text is asked to measure: for each element of a
//! slide that carries words, the pieces of text and the room they are set in.
//! The host lays them out and answers with [`Measures`](super::Measures). The
//! list is made from the same reading of the slide as the rules, so a host
//! cannot measure something the rules do not ask about, nor leave out what
//! they do.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::citations::Refs;
use crate::error::{Error, Result};
use crate::model::{Deck, Text};

use super::estimate::area_of;
use super::scene::{Leaf, Scene, expanded_with, is_blank};
use super::texts::{parts, with_breaks};

model! {
    /// A piece of text to lay out.
    #[serde(rename_all = "camelCase")]
    pub struct ProbePart {
        pub text: Text,
        /// The theme text style the box is set in (`body`, `title` ...).
        pub base: String,
        /// The same words with a break allowed between the characters of each word that may be broken anywhere
        /// (an address, a word in the code font). It is laid out as narrow as it will go to find the widest word
        /// that cannot be broken; `text` is laid out in the room to find how tall it comes out. Absent when
        /// no word is such.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub narrow: Option<Text>,
    }

    /// The words of one element, to be laid out in the room the element gives them.
    #[serde(rename_all = "camelCase")]
    pub struct Probe {
        /// The element's id in the deck with its composites expanded: the key its measure is given under.
        pub id: String,
        /// The room, in slide units: the whole box, or the part of it a shape sets its text in.
        pub area_width: f64,
        pub area_height: f64,
        /// The pieces (a text box has one; a table, one for each cell).
        pub parts: Vec<ProbePart>,
    }
}

/// The probe of a leaf, if it carries words that are drawn.
fn probe_of(scene: &Scene, leaf: &Leaf) -> Option<Probe> {
    if leaf.undrawn {
        return None;
    }
    let rect = leaf.rect?;
    let (area_width, area_height) = area_of(leaf.el, rect.w, rect.h);
    let parts: Vec<ProbePart> = parts(scene, leaf)
        .into_iter()
        .filter(|p| !is_blank(p.text))
        .map(|p| ProbePart {
            narrow: with_breaks(&scene.deck.theme, &p.base, p.text),
            text: p.text.clone(),
            base: p.base,
        })
        .collect();
    (!parts.is_empty()).then(|| Probe {
        id: leaf.el.id().to_owned(),
        area_width,
        area_height,
        parts,
    })
}

/// The texts of a slide to measure, in the order the rules meet them.
pub fn probes(deck: &Deck, slide: &str) -> Result<Vec<Probe>> {
    probes_with(deck, slide, None)
}

/// The same, for a page that draws the citations of the deck from a bibliography: the words to measure
/// are the works as they are drawn (`Vaswani et al., 2017 (NeurIPS)`), not their keys.
pub fn probes_with(deck: &Deck, slide: &str, refs: Option<&Refs>) -> Result<Vec<Probe>> {
    let slide = deck.slide(slide).ok_or_else(|| Error::no_slide(slide))?;
    let expanded = expanded_with(deck, slide, refs);
    let scene = Scene::new(deck, slide, &expanded);
    Ok(scene
        .leaves
        .iter()
        .filter_map(|leaf| probe_of(&scene, leaf))
        .collect())
}
