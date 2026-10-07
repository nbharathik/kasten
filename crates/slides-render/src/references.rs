//! The bibliography beside a deck: the text of the `.bib` files in its folder, which the render page writes citations
//! from ("Vaswani et al., 2017 (NeurIPS)") instead of drawing their keys.

use std::fs;
use std::path::Path;

/// The most bibliography files read, and the most bytes of each.
pub const MOST_FILES: usize = 8;
pub const MOST_BYTES: u64 = 4 * 1024 * 1024;

/// The text of the `.bib` files in `dir`, one after another in the order of their names (a key in two entries is
/// the first one's), or `None` when there are none, so that a citation is not called unknown when there is
/// nothing to look it up in.
pub fn in_folder(dir: &Path) -> Option<String> {
    let mut files: Vec<_> = fs::read_dir(dir).ok()?.flatten().collect();
    files.sort_by_key(std::fs::DirEntry::file_name);
    let mut all = String::new();
    let mut found = false;
    for entry in files
        .into_iter()
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .to_lowercase()
                .ends_with(".bib")
        })
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

#[cfg(test)]
mod tests;
