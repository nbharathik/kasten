//! A store that keeps its decks in memory: for tests, and for a host that
//! holds decks somewhere the tools should not know about.

use std::collections::BTreeMap;

use super::store::{
    AssetInfo, DeckInfo, DeckText, Draw, Drawn, Saved, Store, StoreError, StoreResult, Written,
};
use crate::lint::{Measures, Refs};
use crate::model::Deck;

/// The version of a text: FNV-1a as sixteen hex digits.
pub fn hash_of(text: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}")
}

#[derive(Default)]
pub struct MemoryStore {
    pub decks: BTreeMap<String, String>,
    pub assets: BTreeMap<String, Vec<u8>>,
    pub files: BTreeMap<String, Vec<u8>>,
    pub exports: BTreeMap<String, Vec<u8>>,
    pub trashed: Vec<(String, String)>,
    /// The picture `draw` answers with; without one, drawing is not available.
    pub picture: Option<Drawn>,
    /// What was asked to be drawn, in order.
    pub drawn: Vec<Draw>,
    /// The sizes `measure` answers with; without them lint estimates.
    pub measures: Option<Measures>,
    /// The bibliography `references` answers with; without one citation keys are not checked.
    pub refs: Option<Refs>,
    counter: u64,
}

impl MemoryStore {
    pub fn new() -> MemoryStore {
        MemoryStore::default()
    }

    /// Puts a deck's text in, as another program would.
    pub fn put(&mut self, name: &str, text: &str) {
        self.decks.insert(name.to_owned(), text.to_owned());
    }

    fn text_of(&self, name: &str) -> StoreResult<DeckText> {
        let text = self
            .decks
            .get(name)
            .ok_or_else(|| StoreError::NotFound(format!("There is no deck `{name}`.")))?;
        Ok(DeckText {
            name: name.to_owned(),
            hash: hash_of(text),
            text: text.clone(),
        })
    }

    fn free(&self, stem: &str, suffix: &str) -> String {
        let mut name = format!("{stem}{suffix}");
        let mut n = 2;
        while self.decks.contains_key(&name) {
            name = format!("{stem} {n}{suffix}");
            n += 1;
        }
        name
    }
}

impl Store for MemoryStore {
    fn decks(&mut self) -> StoreResult<Vec<DeckInfo>> {
        Ok(self
            .decks
            .iter()
            .map(|(name, text)| {
                let parsed = crate::canonical::parse(text);
                DeckInfo {
                    name: name.clone(),
                    title: parsed.as_ref().map(|d| d.title.clone()).unwrap_or_default(),
                    slides: parsed.as_ref().map_or(0, |d| d.slides.len()),
                    modified: 0,
                    problem: parsed.err().map(|e| e.to_string()),
                }
            })
            .collect())
    }

    fn read(&mut self, name: &str) -> StoreResult<DeckText> {
        self.text_of(name)
    }

    fn save(&mut self, name: &str, text: &str, base: &str) -> StoreResult<Saved> {
        let current = self.text_of(name)?;
        if current.text == text {
            return Ok(Saved::Unchanged(current));
        }
        if current.hash != base {
            let stem = name.trim_end_matches(".deck");
            let copy = self.free(&format!("{stem} (conflict"), ").deck");
            self.decks.insert(copy.clone(), text.to_owned());
            return Ok(Saved::Conflict { copy, current });
        }
        self.decks.insert(name.to_owned(), text.to_owned());
        Ok(Saved::Written(self.text_of(name)?))
    }

    fn create(&mut self, title: &str, text: &str) -> StoreResult<DeckText> {
        let stem: String = title
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .to_owned();
        let name = self.free(if stem.is_empty() { "deck" } else { &stem }, ".deck");
        self.decks.insert(name.clone(), text.to_owned());
        self.text_of(&name)
    }

    fn trash(&mut self, name: &str) -> StoreResult<String> {
        let text = self
            .decks
            .remove(name)
            .ok_or_else(|| StoreError::NotFound(format!("There is no deck `{name}`.")))?;
        let place = format!(".trash/{name}");
        self.trashed.push((place.clone(), text));
        Ok(place)
    }

    fn assets(&mut self) -> StoreResult<Vec<AssetInfo>> {
        Ok(self
            .assets
            .iter()
            .map(|(path, bytes)| AssetInfo {
                path: path.clone(),
                bytes: bytes.len() as u64,
            })
            .collect())
    }

    fn add_asset(&mut self, name: &str, bytes: &[u8]) -> StoreResult<String> {
        let path = format!("assets/{name}");
        match self.assets.get(&path) {
            Some(held) if held != bytes => {
                let (stem, ext) = name.rsplit_once('.').unwrap_or((name, ""));
                let mut n = 2;
                loop {
                    let next = format!("assets/{stem} {n}.{ext}");
                    if !self.assets.contains_key(&next) {
                        self.assets.insert(next.clone(), bytes.to_vec());
                        return Ok(next);
                    }
                    n += 1;
                }
            }
            _ => {
                self.assets.insert(path.clone(), bytes.to_vec());
                Ok(path)
            }
        }
    }

    fn read_asset(&mut self, path: &str) -> StoreResult<Vec<u8>> {
        self.assets
            .get(path)
            .cloned()
            .ok_or_else(|| StoreError::NotFound(format!("There is no picture `{path}`.")))
    }

    fn entropy(&mut self) -> u64 {
        self.counter += 1;
        self.counter.wrapping_mul(0x9E37_79B9_7F4A_7C15)
    }

    fn keep_copy(&mut self, name: &str, text: &str, why: &str) -> StoreResult<()> {
        self.trashed
            .push((format!(".trash/{name} ({why})"), text.to_owned()));
        Ok(())
    }

    fn read_file(&mut self, path: &str) -> StoreResult<Vec<u8>> {
        self.files
            .get(path)
            .cloned()
            .ok_or_else(|| StoreError::NotFound(format!("There is no file `{path}`.")))
    }

    fn draw(&mut self, _deck: &Deck, what: Draw) -> StoreResult<Drawn> {
        self.drawn.push(what);
        self.picture.clone().ok_or_else(|| {
            StoreError::Unavailable("Drawing a slide is not available in this build.".to_owned())
        })
    }

    fn measure(&mut self, _deck: &Deck) -> Option<Measures> {
        self.measures.clone()
    }

    fn references(&mut self) -> Option<Refs> {
        self.refs.clone()
    }

    fn write_export(&mut self, deck: &str, extension: &str, bytes: &[u8]) -> StoreResult<Written> {
        let stem = deck.trim_end_matches(".deck");
        let path = format!("{stem}.{extension}");
        self.exports.insert(path.clone(), bytes.to_vec());
        Ok(Written {
            path,
            bytes: bytes.len() as u64,
        })
    }
}
