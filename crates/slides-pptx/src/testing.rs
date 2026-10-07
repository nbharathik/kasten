//! Helpers for the tests of the writers.

use std::collections::BTreeMap;

use slides_core::{Deck, Engine};

use crate::cx::{Cx, Shared};
use crate::media::Media;

/// Pictures held in memory by path.
#[derive(Default)]
pub struct MapMedia(pub BTreeMap<String, Vec<u8>>);

impl Media for MapMedia {
    fn read(&self, path: &str) -> Option<Vec<u8>> {
        self.0.get(path).cloned()
    }
}

/// A new deck in the Light theme, with its title slide.
pub fn deck() -> Deck {
    Engine::create("Test deck", "Light", 1)
        .map(Engine::into_deck)
        .unwrap_or_else(|e| panic!("a new deck: {e}"))
}

/// Runs `f` with a context for a deck of the Light theme and no pictures.
pub fn with_cx<R>(f: impl FnOnce(&mut Cx<'_, '_>) -> R) -> R {
    with_deck(&deck(), &MapMedia::default(), f)
}

/// Runs `f` with a context for `deck`, whose pictures are `media`.
pub fn with_deck<R>(deck: &Deck, media: &MapMedia, f: impl FnOnce(&mut Cx<'_, '_>) -> R) -> R {
    let mut shared = Shared::new(media);
    let mut cx = Cx::new(deck, &mut shared);
    cx.slide = Some("s-test".to_owned());
    f(&mut cx)
}
