//! The bibliography beside a deck: the `.bib` files in its folder, whose keys
//! a citation can name.

use std::fs;
use std::path::Path;

use slides_core::lint::Refs;

/// The most bibliography files read, and the most bytes of each.
const MOST_FILES: usize = 8;
const MOST_BYTES: u64 = 4 * 1024 * 1024;

/// Whether a file of a folder is part of its bibliography: the folder host serves these, and
/// watches them for changes.
pub fn is_bib(name: &str) -> bool {
    name.to_lowercase().ends_with(".bib")
}

/// The text of the `.bib` files in `dir`, one after another, or `None` when there are none, so
/// that a citation is not called unresolved when there is nothing to resolve it against.
pub fn text_in(dir: &Path) -> Option<String> {
    let mut files: Vec<_> = fs::read_dir(dir).ok()?.flatten().collect();
    files.sort_by_key(|e| e.file_name());
    let mut all = String::new();
    let mut found = false;
    for entry in files
        .into_iter()
        .filter(|e| is_bib(&e.file_name().to_string_lossy()))
        .take(MOST_FILES)
    {
        let small = entry
            .metadata()
            .is_ok_and(|m| m.is_file() && m.len() <= MOST_BYTES);
        if let (true, Ok(text)) = (small, fs::read_to_string(entry.path())) {
            found = true;
            all.push_str(&text);
            all.push('\n');
        }
    }
    found.then_some(all)
}

/// The bibliography of the `.bib` files in `dir`, or `None` when there are none.
pub fn in_folder(dir: &Path) -> Option<Refs> {
    text_in(dir).map(|text| Refs::from_bibtex(&text))
}

/// The bibliography beside a deck file: the `.bib` files in the folder the file sits in.
pub fn beside(deck: &Path) -> Option<Refs> {
    let folder = deck
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    in_folder(folder)
}
