//! What a folder holds, read before anyone opens it (the app's vault
//! chooser): a Kasten vault, with its name and format; another app's vault
//! (Obsidian keeps `.obsidian/`); or Markdown notes in folders. It reads
//! names and the config only, and writes nothing.

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::config::{CONFIG_PATH, Config, FORMAT};
use crate::error::{Error, Result};

/// Notes counted before the count stops (`more` says there were more).
const MAX_NOTES: usize = 20_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Survey {
    /// Kasten's own vault: its name and format.
    pub kasten: Option<SurveyedVault>,
    /// An Obsidian vault.
    pub obsidian: bool,
    /// Markdown files, up to `MAX_NOTES`, hidden folders aside.
    pub notes: usize,
    pub more: bool,
    /// The top-level folders that hold notes, by name.
    pub folders: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SurveyedVault {
    pub name: String,
    pub format: u32,
    /// This Kasten reads the format (it is not from a newer one).
    pub readable: bool,
}

/// Surveys `root`; an error when it is not a folder.
pub fn survey(root: impl AsRef<Path>) -> Result<Survey> {
    let root = root.as_ref();
    if !root.is_dir() {
        return Err(Error::Invalid(format!("No folder at {}", root.display())));
    }
    let kasten = root.join(CONFIG_PATH).is_file().then(|| {
        let config = Config::load(root).unwrap_or_default();
        SurveyedVault {
            name: config.name,
            readable: config.format <= FORMAT,
            format: config.format,
        }
    });
    let mut found = Survey {
        kasten,
        obsidian: root.join(".obsidian").is_dir(),
        notes: 0,
        more: false,
        folders: Vec::new(),
    };
    let mut entries: Vec<_> = fs::read_dir(root)?.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            let before = found.notes;
            count(&path, &mut found);
            if found.notes > before {
                found.folders.push(name);
            }
        } else if is_note(&path) {
            add(&mut found);
        }
    }
    Ok(found)
}

fn is_note(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
}

fn add(found: &mut Survey) {
    if found.notes < MAX_NOTES {
        found.notes += 1;
    } else {
        found.more = true;
    }
}

/// Counts the notes under `dir`, hidden folders aside.
fn count(dir: &Path, found: &mut Survey) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if found.more {
            return;
        }
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let path = entry.path();
        match entry.file_type() {
            Ok(kind) if kind.is_dir() => count(&path, found),
            Ok(kind) if kind.is_file() && is_note(&path) => add(found),
            _ => {}
        }
    }
}
