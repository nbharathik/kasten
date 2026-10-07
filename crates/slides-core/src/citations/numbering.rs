//! The numbers of a deck's citations. A work is numbered when it is first
//! cited, counting through the slides in their order and, on a slide, through
//! the citations in reading order, so `[3]` on one slide is `[3]` on every
//! slide, and moving a slide renumbers the works.

use std::collections::HashMap;

use crate::model::{Deck, Element};
use crate::ops::order_of;
use crate::resolve::Rect;

/// The works a deck cites, in the order of their numbers.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Numbering {
    keys: Vec<String>,
    index: HashMap<String, usize>,
}

fn holds_citation(element: &Element) -> bool {
    matches!(element, Element::Citation(_)) || element.children().iter().any(holds_citation)
}

impl Numbering {
    /// These keys, in this order, each numbered once.
    pub fn new<S: Into<String>>(keys: impl IntoIterator<Item = S>) -> Numbering {
        let mut numbering = Numbering::default();
        for key in keys {
            numbering.push(key.into());
        }
        numbering
    }

    fn push(&mut self, key: String) {
        if key.is_empty() || self.index.contains_key(&key) {
            return;
        }
        self.index.insert(key.clone(), self.keys.len() + 1);
        self.keys.push(key);
    }

    /// The works every citation in the deck names. Every slide counts, a hidden one too,
    /// and so do the keys of a `list`, where the list stands.
    pub fn of(deck: &Deck) -> Numbering {
        let mut numbering = Numbering::default();
        for slide in &deck.slides {
            numbering.read(&slide.elements);
        }
        numbering
    }

    /// The citations among these elements, in reading order, groups included.
    fn read(&mut self, elements: &[Element]) {
        if !elements.iter().any(holds_citation) {
            return;
        }
        let boxes: Vec<Option<Rect>> = elements
            .iter()
            .map(|e| e.base().rect().map(|(x, y, w, h)| Rect { x, y, w, h }))
            .collect();
        for at in order_of(&boxes) {
            match &elements[at] {
                Element::Citation(citation) => {
                    for key in &citation.keys {
                        self.push(key.clone());
                    }
                }
                Element::Group(group) => self.read(&group.children),
                _ => {}
            }
        }
    }

    /// The number of a work, counting from 1.
    pub fn number(&self, key: &str) -> Option<usize> {
        self.index.get(key).copied()
    }

    /// The works in the order of their numbers.
    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.keys.iter().map(String::as_str)
    }

    pub fn len(&self) -> usize {
        self.keys.len()
    }

    pub fn is_empty(&self) -> bool {
        self.keys.is_empty()
    }
}
