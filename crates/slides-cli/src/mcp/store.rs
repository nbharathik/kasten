//! A folder of decks as the agent tools' store. Reading, saving, new decks and
//! the trash are the folder host's own (`slides dev` uses the same code), so a
//! save made against an old version is kept as a copy and never overwrites,
//! and nothing is ever unlinked.

use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

use slides_core::agent::{
    AssetInfo, DeckInfo, DeckText, Draw, Drawn, Imported, Saved, Store, StoreError, StoreResult,
    Written,
};
use slides_core::lint::{Measures, Refs};
use slides_core::{Deck, canonical};
use slides_pptx::import::{ImportOptions, import};
use slides_pptx::{Media, Options, export_with};

use crate::dev::files::{EXT, FolderError, create_new, deck_name, plain};
use crate::dev::folder::{DeckFile, Folder, Saved as Kept};
use crate::dev::stamp;

/// The largest file `read_file` reads: a PowerPoint file with pictures in it.
const MOST_BYTES: u64 = 64 * 1024 * 1024;

pub struct FolderStore {
    folder: Folder,
    calls: u64,
}

fn error(e: FolderError) -> StoreError {
    match e {
        FolderError::NotFound(m) => StoreError::NotFound(m),
        FolderError::Invalid(m) => StoreError::Invalid(m),
        FolderError::Io(m) => StoreError::Io(m),
    }
}

/// An error about a deck, in words that say what to do about a missing one.
fn about_deck(e: FolderError, name: &str) -> StoreError {
    match e {
        FolderError::NotFound(_) => StoreError::NotFound(format!(
            "There is no deck `{name}` in the folder. list_decks shows the decks there are."
        )),
        other => error(other),
    }
}

fn text(file: DeckFile) -> DeckText {
    DeckText {
        name: file.path,
        text: file.text,
        hash: file.hash,
    }
}

/// A path inside the folder, as a relative path of plain parts: no `..`, no
/// root or drive, no backslash to mean either on another system.
fn inside(path: &str) -> Option<PathBuf> {
    if path.is_empty() || path.contains(['\\', '\0']) {
        return None;
    }
    let mut clean = PathBuf::new();
    for part in Path::new(path).components() {
        match part {
            Component::Normal(name) => clean.push(name),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    (!clean.as_os_str().is_empty()).then_some(clean)
}

/// The pictures of a deck, read from the folder's `assets/`.
struct Pictures<'a>(&'a Folder);

impl Media for Pictures<'_> {
    fn read(&self, path: &str) -> Option<Vec<u8>> {
        self.0.asset(path).ok().map(|(bytes, _)| bytes)
    }
}

impl FolderStore {
    pub fn open(path: &Path) -> Result<FolderStore, String> {
        Ok(FolderStore {
            folder: Folder::open(path)?,
            calls: 0,
        })
    }

    pub fn root(&self) -> &Path {
        self.folder.root()
    }

    /// A file inside the folder that is there. A link that leads out of the folder is refused.
    fn file_inside(&self, path: &str) -> StoreResult<PathBuf> {
        let clean = inside(path).ok_or_else(|| {
            StoreError::Invalid(format!(
                "`{path}` is not a path inside the folder the decks are in."
            ))
        })?;
        let real = self.root().join(clean).canonicalize().map_err(|_| {
            StoreError::NotFound(format!("There is no file `{path}` in the folder."))
        })?;
        if !real.starts_with(self.root()) || !real.is_file() {
            return Err(StoreError::Invalid(format!(
                "`{path}` is not a file inside the folder the decks are in."
            )));
        }
        Ok(real)
    }

    /// Writes `bytes` as a new file named `<stem>.<extension>`; if that name is
    /// taken by other bytes the name gets a number. A file is never replaced.
    fn keep_export(&self, stem: &str, extension: &str, bytes: &[u8]) -> StoreResult<Written> {
        let mut name = format!("{stem}.{extension}");
        let mut n = 2;
        loop {
            let path = self.root().join(&name);
            match create_new(&path, bytes) {
                Ok(()) => break,
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
                    if fs::read(&path).is_ok_and(|held| held == bytes) {
                        break;
                    }
                    name = format!("{stem} {n}.{extension}");
                    n += 1;
                }
                Err(e) => return Err(StoreError::Io(format!("Cannot write {name}: {e}"))),
            }
        }
        Ok(Written {
            path: name,
            bytes: bytes.len() as u64,
        })
    }
}

/// `text` with each picture that was kept under another name pointing at that name.
fn renamed(text: String, moved: &[(String, String)]) -> String {
    moved.iter().fold(text, |text, (from, to)| {
        match (serde_json::to_string(from), serde_json::to_string(to)) {
            (Ok(from), Ok(to)) => text.replace(&from, &to),
            _ => text,
        }
    })
}

fn describe(slide: &Option<String>, element: &Option<String>, message: &str) -> String {
    let slide = slide
        .as_deref()
        .map(|s| format!("slide {s}: "))
        .unwrap_or_default();
    let element = element
        .as_deref()
        .map(|e| format!("element {e}: "))
        .unwrap_or_default();
    format!("{slide}{element}{message}")
}

impl Store for FolderStore {
    fn decks(&mut self) -> StoreResult<Vec<DeckInfo>> {
        Ok(self
            .folder
            .decks()
            .into_iter()
            .map(|d| DeckInfo {
                name: d.path,
                title: d.title,
                slides: d.slides,
                modified: d.modified,
                problem: d.problem,
            })
            .collect())
    }

    fn read(&mut self, name: &str) -> StoreResult<DeckText> {
        self.folder
            .read(name)
            .map(text)
            .map_err(|e| about_deck(e, name))
    }

    fn save(&mut self, name: &str, new: &str, base: &str) -> StoreResult<Saved> {
        Ok(
            match self
                .folder
                .save(name, new, base)
                .map_err(|e| about_deck(e, name))?
            {
                Kept::Written { deck } => Saved::Written(text(deck)),
                Kept::Unchanged { deck } => Saved::Unchanged(text(deck)),
                Kept::Conflict { copy, deck } => Saved::Conflict {
                    copy,
                    current: text(deck),
                },
            },
        )
    }

    fn create(&mut self, title: &str, new: &str) -> StoreResult<DeckText> {
        self.folder.create_text(title, new).map(text).map_err(error)
    }

    fn trash(&mut self, name: &str) -> StoreResult<String> {
        self.folder.trash(name).map_err(|e| about_deck(e, name))
    }

    fn assets(&mut self) -> StoreResult<Vec<AssetInfo>> {
        Ok(self
            .folder
            .assets()
            .into_iter()
            .map(|a| AssetInfo {
                path: a.path,
                bytes: a.bytes,
            })
            .collect())
    }

    fn add_asset(&mut self, name: &str, bytes: &[u8]) -> StoreResult<String> {
        self.folder.add_asset(name, bytes).map_err(error)
    }

    fn read_asset(&mut self, path: &str) -> StoreResult<Vec<u8>> {
        self.folder
            .asset(path)
            .map(|(bytes, _)| bytes)
            .map_err(|e| match e {
                FolderError::NotFound(_) => StoreError::NotFound(format!(
                    "There is no picture `{path}`. search_assets lists the pictures."
                )),
                other => error(other),
            })
    }

    fn entropy(&mut self) -> u64 {
        self.calls += 1;
        stamp::now()
            ^ (u64::from(std::process::id()) << 32)
            ^ self.calls.wrapping_mul(0x9E37_79B9_7F4A_7C15)
    }

    fn keep_copy(&mut self, name: &str, new: &str, why: &str) -> StoreResult<()> {
        self.folder
            .keep_copy(name, new, why)
            .map(|_| ())
            .map_err(error)
    }

    fn references(&mut self) -> Option<Refs> {
        crate::refs::in_folder(self.root())
    }

    fn read_file(&mut self, path: &str) -> StoreResult<Vec<u8>> {
        let real = self.file_inside(path)?;
        let size = fs::metadata(&real)
            .map_err(|e| StoreError::Io(e.to_string()))?
            .len();
        if size > MOST_BYTES {
            return Err(StoreError::Invalid(format!(
                "`{path}` is larger than {} MB.",
                MOST_BYTES / 1024 / 1024
            )));
        }
        fs::read(real).map_err(|e| StoreError::Io(e.to_string()))
    }

    fn make_pptx(&mut self, deck: &Deck) -> StoreResult<(Vec<u8>, Vec<String>)> {
        // A citation is written as the editor draws it, from the `.bib` files in the folder.
        let refs = crate::refs::in_folder(self.root());
        let made = export_with(
            deck,
            &Pictures(&self.folder),
            &Options::default(),
            refs.as_ref(),
        )
        .map_err(|e| StoreError::Invalid(e.to_string()))?;
        let warnings = made
            .warnings
            .iter()
            .map(|w| describe(&w.slide, &w.element, &w.message))
            .collect();
        Ok((made.bytes, warnings))
    }

    fn draw(&mut self, deck: &Deck, what: Draw) -> StoreResult<Drawn> {
        let what = match what {
            Draw::Slide { slide, step, scale } => slides_render::Draw::Slide { slide, step, scale },
            Draw::Grid => slides_render::Draw::Grid { columns: None },
        };
        // The render host says in a sentence what to do when it cannot draw (no browser, no such slide).
        let png = slides_render::draw(deck, self.folder.root(), what)
            .map_err(|e| StoreError::Unavailable(e.to_string()))?;
        Ok(Drawn {
            png: png.bytes,
            width: png.width,
            height: png.height,
            warnings: png.warnings,
        })
    }

    fn measure(&mut self, deck: &Deck) -> Option<Measures> {
        // With the folder's pictures and bibliography, so a citation is as long as it will be drawn.
        slides_render::measure(deck, self.folder.root()).ok()
    }

    fn write_export(&mut self, deck: &str, extension: &str, bytes: &[u8]) -> StoreResult<Written> {
        let stem = deck_name(deck)
            .map_err(error)?
            .trim_end_matches(EXT)
            .to_owned();
        self.keep_export(&stem, extension, bytes)
    }

    fn import_pptx(&mut self, path: &str, title: Option<&str>) -> StoreResult<Imported> {
        let bytes = self.read_file(path)?;
        let stem = Path::new(path)
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned());
        // A title that is asked for wins; otherwise the file's name makes one. The title inside the
        // file is often a template's, so it is not used.
        let options = ImportOptions {
            seed: self.entropy(),
            title: title.map(str::to_owned).or(stem),
            ..ImportOptions::default()
        };
        let made = import(&bytes, &options).map_err(|e| {
            StoreError::Invalid(format!(
                "`{path}` is not a PowerPoint file this can read: {e}"
            ))
        })?;
        // The pictures go in first, so the deck never names one that is not there.
        let mut moved = Vec::new();
        for file in &made.media {
            let name = file.path.strip_prefix("assets/").unwrap_or(&file.path);
            let kept = self
                .folder
                .add_asset(plain(name).map_err(error)?, &file.bytes)
                .map_err(error)?;
            if kept != file.path {
                moved.push((file.path.clone(), kept));
            }
        }
        let title = made.deck.title.clone();
        let written =
            canonical::write(&made.deck).map_err(|e| StoreError::Invalid(e.to_string()))?;
        let deck = self
            .folder
            .create_text(&title, &renamed(written, &moved))
            .map(text)
            .map_err(error)?;
        let warnings = made
            .report
            .warnings
            .iter()
            .map(|w| describe(&w.slide, &w.element, &w.message))
            .collect();
        Ok(Imported {
            deck,
            pictures: made.media.len(),
            warnings,
        })
    }
}

#[cfg(test)]
mod tests;
