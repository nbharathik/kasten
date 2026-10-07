//! Pictures kept in `assets/`: what the gallery lists, what a new picture
//! remembers about where it came from, and where each one is used.
//!
//! A picture is one file, `assets/<name>.<ext>`, kept once: notes, boards
//! and decks refer to it by that path, and nothing rewrites those paths.
//! What is remembered about it is a small sidecar in a hidden `.meta`
//! folder beside it (see `slides_assets::sidecar`), written in the same
//! commit. Where a picture is used is worked out by looking, never stored.

pub(crate) mod refs;

use serde::{Deserialize, Serialize};

pub use slides_assets::Clip as PdfClip;

/// How a picture came into the vault.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AssetSource {
    /// Pasted from the clipboard.
    Pasted,
    /// A file chosen or dropped.
    File,
    /// A figure clipped from a paper in `sources/`.
    PdfClip,
    /// Made or fetched by an agent.
    Agent,
    /// A picture of an imported PowerPoint deck.
    PptxImport,
}

impl AssetSource {
    /// The name a sidecar keeps it under.
    pub fn name(self) -> &'static str {
        match self {
            AssetSource::Pasted => "pasted",
            AssetSource::File => "file",
            AssetSource::PdfClip => "pdf-clip",
            AssetSource::Agent => "agent",
            AssetSource::PptxImport => "pptx-import",
        }
    }
}

/// What a new picture remembers besides its bytes.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NewAsset {
    /// How it came in; left out, a person's is a file and an agent's is an agent's.
    pub source: Option<AssetSource>,
    pub caption: Option<String>,
    pub tags: Vec<String>,
    pub citation_key: Option<String>,
    /// Where on which paper a figure was clipped: needed for `pdf-clip`.
    pub clip: Option<PdfClip>,
    /// The deck a `pptx-import` picture came from.
    pub deck: Option<String>,
}

/// A change to what a picture remembers: each field given replaces the old
/// value, an empty caption or key clears it, and tags not mentioned stay.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AssetEdit {
    pub tags: Option<Vec<String>>,
    pub caption: Option<String>,
    pub citation_key: Option<String>,
}

/// A picture as the gallery lists it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    /// Where notes, boards and decks find it: `assets/figure.png`.
    pub path: String,
    /// The name it came with, or its file's name for an old file.
    pub name: String,
    /// None for an old file until it has a sidecar.
    pub id: Option<String>,
    pub bytes: u64,
    /// None in a list for a file without a sidecar (reading it all to hash
    /// it is left for when one picture is asked for).
    pub sha256: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// `pasted`, `file`, `pdf-clip`, `agent` or `pptx-import`; None when not known.
    pub source: Option<String>,
    /// `person` or `agent:<session>`; None when not known.
    pub created_by: Option<String>,
    pub created: Option<String>,
    /// When it came in, milliseconds: `created`, or the file's time.
    pub added: u64,
    pub tags: Vec<String>,
    pub caption: Option<String>,
    pub citation_key: Option<String>,
    pub clip: Option<PdfClip>,
    /// The deck a PowerPoint import brought it from.
    pub deck: Option<String>,
    /// The title of the paper a clipped figure came from.
    pub paper: Option<String>,
    /// Whether it has a sidecar.
    pub described: bool,
}

/// What `add_asset` did.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddedAsset {
    /// Where the picture is: a new file, or the one already holding these bytes.
    pub path: String,
    /// False when the same bytes were already kept, so nothing was written.
    pub created: bool,
    pub asset: AssetInfo,
}

/// A note or a board.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub path: String,
    pub title: String,
}

/// A slide that shows a picture.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideUse {
    /// The slide's place in the deck, from 1.
    pub number: usize,
    pub id: String,
}

/// A deck that shows a picture.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckUse {
    pub path: String,
    pub title: String,
    pub slides: Vec<SlideUse>,
    /// The deck's theme shows it too (on every slide of a layout).
    pub theme: bool,
}

/// Where a picture is used.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetUsage {
    pub notes: Vec<Place>,
    pub boards: Vec<Place>,
    pub decks: Vec<DeckUse>,
}

impl AssetUsage {
    pub fn is_empty(&self) -> bool {
        self.count() == 0
    }

    /// How many notes, boards and decks use it.
    pub fn count(&self) -> usize {
        self.notes.len() + self.boards.len() + self.decks.len()
    }
}
