//! What the agent tools need of the place decks are kept. A folder of files
//! (`slides mcp`), a vault (Kasten) and a test's memory each implement it, and
//! the tools never touch a disk themselves.

use std::fmt;

use crate::lint::{Measures, Refs};
use crate::model::Deck;

/// A deck in the store, in brief.
#[derive(Clone, Debug, PartialEq)]
pub struct DeckInfo {
    /// What the tools call it: a file name such as `talk.deck`.
    pub name: String,
    pub title: String,
    pub slides: usize,
    /// When it last changed, in milliseconds since 1970; 0 when unknown.
    pub modified: u64,
    /// Why the file is not a readable deck, when it is not.
    pub problem: Option<String>,
}

/// The text of a deck and its version.
#[derive(Clone, Debug, PartialEq)]
pub struct DeckText {
    pub name: String,
    pub text: String,
    /// Names the version of the text: the same text always has the same hash.
    pub hash: String,
}

/// What became of a save.
#[derive(Clone, Debug, PartialEq)]
pub enum Saved {
    /// The text is now the deck.
    Written(DeckText),
    /// The deck already held exactly this text.
    Unchanged(DeckText),
    /// The deck had moved on from the version the text was made from. It was
    /// left as it is, the text was kept as a copy named `copy`, and `current`
    /// is the deck as it is.
    Conflict { copy: String, current: DeckText },
}

/// A picture in the store.
#[derive(Clone, Debug, PartialEq)]
pub struct AssetInfo {
    /// What a deck calls it: `assets/figure.png`.
    pub path: String,
    pub bytes: u64,
}

/// Why a store could not do what it was asked. The message says what to do about it.
#[derive(Clone, Debug, PartialEq)]
pub enum StoreError {
    NotFound(String),
    Invalid(String),
    Io(String),
    /// This store cannot do it.
    Unavailable(String),
}

impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StoreError::NotFound(m)
            | StoreError::Invalid(m)
            | StoreError::Io(m)
            | StoreError::Unavailable(m) => f.write_str(m),
        }
    }
}

impl std::error::Error for StoreError {}

pub type StoreResult<T> = Result<T, StoreError>;

/// A file the store wrote, for a tool to report.
#[derive(Clone, Debug, PartialEq)]
pub struct Written {
    pub path: String,
    pub bytes: u64,
}

/// A deck made from a PowerPoint file.
#[derive(Clone, Debug, PartialEq)]
pub struct Imported {
    pub deck: DeckText,
    /// How many pictures of the file were kept.
    pub pictures: usize,
    /// What the file held that a deck cannot, and what was done with it.
    pub warnings: Vec<String>,
}

/// What a store is asked to draw.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Draw {
    /// A slide (from 0) at a step (its last state when absent), at `scale` pixels to the slide unit.
    Slide {
        slide: usize,
        step: Option<u32>,
        scale: f32,
    },
    /// Every slide, as a labelled thumbnail, in one picture.
    Grid,
}

/// A picture a store drew.
#[derive(Clone, Debug, PartialEq)]
pub struct Drawn {
    pub png: Vec<u8>,
    pub width: u32,
    pub height: u32,
    /// What could not be drawn exactly.
    pub warnings: Vec<String>,
}

fn unavailable<T>(what: &str) -> StoreResult<T> {
    Err(StoreError::Unavailable(format!(
        "{what} is not available in this build."
    )))
}

pub trait Store {
    /// The decks, most recently changed first.
    fn decks(&mut self) -> StoreResult<Vec<DeckInfo>>;

    fn read(&mut self, name: &str) -> StoreResult<DeckText>;

    /// Writes `text` as the deck `name` if the deck is still at the version
    /// `base` names. If it is not, nothing is overwritten: the text is kept
    /// as a copy and the answer is `Saved::Conflict`.
    fn save(&mut self, name: &str, text: &str, base: &str) -> StoreResult<Saved>;

    /// Makes a new deck from `text`, named as the store sees fit from `title`.
    /// A deck that is there is never replaced.
    fn create(&mut self, title: &str, text: &str) -> StoreResult<DeckText>;

    /// Puts a deck aside where a person can restore it; returns where it went.
    fn trash(&mut self, name: &str) -> StoreResult<String>;

    /// The pictures, newest first.
    fn assets(&mut self) -> StoreResult<Vec<AssetInfo>>;

    /// Keeps a picture; returns its path. A store may know the same bytes by a name it already has (the folder host does, whatever name they come with); other bytes never replace a file.
    fn add_asset(&mut self, name: &str, bytes: &[u8]) -> StoreResult<String>;

    fn read_asset(&mut self, path: &str) -> StoreResult<Vec<u8>>;

    /// Something different on every call, to start the ids of what a tool makes.
    fn entropy(&mut self) -> u64;

    /// Keeps a copy of a deck before a change that removes something, for a
    /// store whose history does not already keep it.
    fn keep_copy(&mut self, _name: &str, _text: &str, _why: &str) -> StoreResult<()> {
        Ok(())
    }

    /// The keys of the bibliography, when the store has one.
    fn references(&mut self) -> Option<Refs> {
        None
    }

    /// A file a person put beside the decks, by a path inside the store.
    fn read_file(&mut self, _path: &str) -> StoreResult<Vec<u8>> {
        unavailable("Reading a file")
    }

    /// The deck as a PowerPoint file, and what could not be written exactly.
    fn make_pptx(&mut self, _deck: &Deck) -> StoreResult<(Vec<u8>, Vec<String>)> {
        unavailable("PowerPoint export")
    }

    /// Keeps an exported file beside the deck `deck`, with `extension`; returns where.
    fn write_export(
        &mut self,
        _deck: &str,
        _extension: &str,
        _bytes: &[u8],
    ) -> StoreResult<Written> {
        unavailable("Saving an export")
    }

    /// Draws a slide, or all of them, as a PNG for the agent to look at. Only a store that has something to draw with can.
    fn draw(&mut self, _deck: &Deck, _what: Draw) -> StoreResult<Drawn> {
        unavailable("Drawing a slide")
    }

    /// How big the words of the deck come out when something that draws them lays them out (a browser), if the store has one.
    /// Lint estimates the sizes when it has not.
    fn measure(&mut self, _deck: &Deck) -> Option<Measures> {
        None
    }

    /// Makes a deck from a PowerPoint file in the store.
    fn import_pptx(&mut self, _path: &str, _title: Option<&str>) -> StoreResult<Imported> {
        unavailable("PowerPoint import")
    }
}
