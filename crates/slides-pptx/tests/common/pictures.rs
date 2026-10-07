//! Pictures for decks that name some: one made from each path a deck (or its composites) uses.
#![allow(dead_code)]

use slides_core::{Deck, Element};

use super::{Files, samples};

fn paths(list: &[Element], out: &mut Vec<String>) {
    for e in list {
        match e {
            Element::Image(i) => out.push(i.src.clone()),
            Element::Raw(r) => out.extend(r.preview.clone()),
            _ => {}
        }
        paths(e.children(), out);
    }
}

/// A picture for every path the deck names that the shared set does not have, made from the path.
pub fn pictures_for(deck: &Deck, mut files: Files) -> Files {
    let mut named = Vec::new();
    let deck = &slides_core::composites::expand_deck(deck);
    for slide in &deck.slides {
        paths(&slide.elements, &mut named);
        named.extend(slide.background.iter().filter_map(|b| b.image.clone()));
    }
    paths(&deck.theme.master, &mut named);
    for path in named.into_iter().filter(|p| !p.trim().is_empty()) {
        let seed = path
            .bytes()
            .fold(7u32, |h, b| h.wrapping_mul(31).wrapping_add(u32::from(b)));
        files.0.entry(path).or_insert_with(|| {
            samples::png(48, 32, |x, y| {
                [
                    (x * 5 + seed) as u8,
                    (y * 7 + seed) as u8,
                    (seed >> 3) as u8,
                ]
            })
        });
    }
    files
}
