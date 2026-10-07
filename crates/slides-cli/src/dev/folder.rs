//! The folder `slides dev` serves: decks side by side, with `assets/` beside
//! them. Every path here is one plain file name, checked before it touches
//! the disk, and nothing is ever deleted: a deck the person removes moves to
//! `.trash/`, a save that lost a race goes to a copy beside the deck.

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use slides_core::{Engine, canonical};

pub use super::files::content_hash;
use super::files::{
    EXT, FolderError, MAX_DECK, Result, create_new, deck_name, free_name, head_of, millis, plain,
    slug, write_atomic,
};
use super::mime;
use super::pictures::ASSETS;
use super::stamp;

const TRASH: &str = ".trash";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckEntry {
    pub path: String,
    pub title: String,
    pub slides: usize,
    pub modified: u64,
    pub size: u64,
    /// Why the file is not a deck, if it is not.
    pub problem: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckFile {
    pub path: String,
    pub text: String,
    pub hash: String,
    pub modified: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum Saved {
    Written {
        deck: DeckFile,
    },
    Unchanged {
        deck: DeckFile,
    },
    /// The file moved on since the editor read it: the editor's text is in
    /// `copy`, and `deck` is the file as it is.
    Conflict {
        copy: String,
        deck: DeckFile,
    },
}

/// What a file looked like when last seen: enough to tell that it changed.
pub type Prints = BTreeMap<String, (u64, u64)>;

pub struct Folder {
    root: PathBuf,
    /// Small copies of pictures made so far (pictures.rs).
    pub(super) thumbs: super::pictures::Thumbs,
    /// One lock for each deck, held from the moment a save looks at the file until it has written
    /// it, so the second of two saves from one version sees the first and takes the conflict path.
    locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

impl Folder {
    pub fn open(path: &Path) -> std::result::Result<Folder, String> {
        let root = path
            .canonicalize()
            .map_err(|e| format!("cannot open {}: {e}", path.display()))?;
        if !root.is_dir() {
            return Err(format!("{} is not a folder", root.display()));
        }
        Ok(Folder {
            root,
            thumbs: Default::default(),
            locks: Default::default(),
        })
    }

    /// The lock of the deck `name`. Case does not matter: some file systems do not tell
    /// `Talk.deck` from `talk.deck`.
    fn lock_of(&self, name: &str) -> Arc<Mutex<()>> {
        let mut all = self.locks.lock().unwrap_or_else(|p| p.into_inner());
        Arc::clone(all.entry(name.to_lowercase()).or_default())
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn name(&self) -> String {
        self.root
            .file_name()
            .map_or_else(|| "decks".to_owned(), |n| n.to_string_lossy().into_owned())
    }

    /// The decks in the folder, most recently changed first.
    pub fn decks(&self) -> Vec<DeckEntry> {
        let mut out = Vec::new();
        let Ok(entries) = fs::read_dir(&self.root) else {
            return out;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if deck_name(&name).is_err() {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            if !meta.is_file() {
                continue;
            }
            let stem = name.trim_end_matches(EXT).to_owned();
            let (title, slides, problem) = match fs::read_to_string(entry.path())
                .map_err(FolderError::from)
                .and_then(|text| head_of(&text))
            {
                Ok((title, slides)) => (
                    if title.trim().is_empty() { stem } else { title },
                    slides,
                    None,
                ),
                Err(e) => (stem, 0, Some(e.to_string())),
            };
            out.push(DeckEntry {
                path: name,
                title,
                slides,
                modified: millis(&meta),
                size: meta.len(),
                problem,
            });
        }
        out.sort_by(|a, b| {
            b.modified
                .cmp(&a.modified)
                .then_with(|| a.path.cmp(&b.path))
        });
        out
    }

    fn deck_path(&self, name: &str) -> Result<PathBuf> {
        Ok(self.root.join(deck_name(name)?))
    }

    pub fn read(&self, name: &str) -> Result<DeckFile> {
        let path = self.deck_path(name)?;
        let meta = fs::symlink_metadata(&path)?;
        if !meta.is_file() {
            return Err(FolderError::NotFound(format!("{name} is not a deck file")));
        }
        if meta.len() > MAX_DECK as u64 {
            return Err(FolderError::Invalid(format!(
                "{name} is too large for a deck"
            )));
        }
        let text = fs::read_to_string(&path).map_err(|e| match e.kind() {
            io::ErrorKind::InvalidData => FolderError::Invalid(format!("{name} is not UTF-8 text")),
            _ => e.into(),
        })?;
        Ok(DeckFile {
            path: name.to_owned(),
            hash: content_hash(&text),
            text,
            modified: millis(&meta),
        })
    }

    /// Makes a deck titled `title` in `theme` and returns it. A file that is
    /// there is never replaced: the name gets a number instead.
    pub fn create(&self, title: &str, theme: &str) -> Result<DeckFile> {
        let title = title.trim();
        let title = if title.is_empty() {
            "Untitled deck"
        } else {
            title
        };
        let seed = stamp::now() ^ (u64::from(std::process::id()) << 32);
        let engine =
            Engine::create(title, theme, seed).map_err(|e| FolderError::Invalid(e.to_string()))?;
        let text =
            canonical::write(engine.deck()).map_err(|e| FolderError::Invalid(e.to_string()))?;
        self.create_text(title, &text)
    }

    /// Makes a deck of the text of a deck file, named from `title`. A file that
    /// is there is never replaced: the name gets a number instead.
    pub fn create_text(&self, title: &str, text: &str) -> Result<DeckFile> {
        head_of(text)?;
        loop {
            let name = free_name(&self.root, &slug(title), EXT);
            match create_new(&self.root.join(&name), text.as_bytes()) {
                Ok(()) => return self.read(&name),
                // Someone made it between the look and the write: look again.
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {}
                Err(e) => return Err(e.into()),
            }
        }
    }

    /// Keeps a copy of a deck's text in `.trash/` before a change that removes
    /// something from it; returns where the copy is.
    pub fn keep_copy(&self, name: &str, text: &str, why: &str) -> Result<String> {
        let bin = self.root.join(TRASH);
        fs::create_dir_all(&bin)?;
        let stem = deck_name(name)?.trim_end_matches(EXT);
        let label = format!("{stem} {} ({why})", stamp::compact(stamp::now()));
        loop {
            let copy = free_name(&bin, &label, EXT);
            match create_new(&bin.join(&copy), text.as_bytes()) {
                Ok(()) => return Ok(format!("{TRASH}/{copy}")),
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {}
                Err(e) => return Err(e.into()),
            }
        }
    }

    /// Writes `text` over the deck if the file still has `base`, the hash it
    /// was read with. A file that moved on stays as it is, and the text goes
    /// to `<name> (conflict <time>).deck` beside it.
    pub fn save(&self, name: &str, text: &str, base: &str) -> Result<Saved> {
        head_of(text)?;
        let path = self.deck_path(name)?;
        let lock = self.lock_of(name);
        let _saving = lock.lock().unwrap_or_else(|p| p.into_inner());
        let current = self.read(name)?;
        if current.text == text {
            return Ok(Saved::Unchanged { deck: current });
        }
        if current.hash != base {
            let copy = self.conflict_copy(name, text)?;
            return Ok(Saved::Conflict {
                copy,
                deck: current,
            });
        }
        write_atomic(&path, text.as_bytes())?;
        Ok(Saved::Written {
            deck: self.read(name)?,
        })
    }

    fn conflict_copy(&self, name: &str, text: &str) -> Result<String> {
        let stem = name.trim_end_matches(EXT);
        let label = format!("conflict {}", stamp::readable(stamp::now()));
        loop {
            let copy = free_name(&self.root, &format!("{stem} ({label}"), &format!("){EXT}"));
            match create_new(&self.root.join(&copy), text.as_bytes()) {
                Ok(()) => return Ok(copy),
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {}
                Err(e) => return Err(e.into()),
            }
        }
    }

    /// Moves a deck into `.trash/`, under a name that keeps when it went.
    pub fn trash(&self, name: &str) -> Result<String> {
        let path = self.deck_path(name)?;
        // A save that has looked at the deck finishes before it goes, and one that comes after finds nothing to write over.
        let lock = self.lock_of(name);
        let _removing = lock.lock().unwrap_or_else(|p| p.into_inner());
        fs::symlink_metadata(&path)?;
        let bin = self.root.join(TRASH);
        fs::create_dir_all(&bin)?;
        let stem = name.trim_end_matches(EXT);
        let moved = free_name(
            &bin,
            &format!("{stem} {}", stamp::compact(stamp::now())),
            EXT,
        );
        fs::rename(&path, bin.join(&moved))?;
        Ok(format!("{TRASH}/{moved}"))
    }

    /// When each deck, picture and bibliography file last changed, and how big it was, for a
    /// watcher to compare from one look to the next.
    pub fn prints(&self) -> Prints {
        let mut out = Prints::new();
        let mut note = |prefix: &str, dir: &Path, wanted: &dyn Fn(&str) -> bool| {
            let Ok(entries) = fs::read_dir(dir) else {
                return;
            };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if !wanted(&name) {
                    continue;
                }
                if let Ok(meta) = entry
                    .metadata()
                    .and_then(|m| m.is_file().then_some(m).ok_or(io::ErrorKind::Other.into()))
                {
                    out.insert(format!("{prefix}{name}"), (millis(&meta), meta.len()));
                }
            }
        };
        note("", &self.root, &|n| deck_name(n).is_ok());
        note("assets/", &self.root.join(ASSETS), &|n| {
            plain(n).is_ok() && mime::is_picture(n)
        });
        // The bibliography beside the decks, which the page reads again when one changes.
        note("", &self.root, &crate::refs::is_bib);
        out
    }
}

#[cfg(test)]
mod tests;
