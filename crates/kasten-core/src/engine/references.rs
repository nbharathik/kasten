//! The bibliography of the vault: what the citations of decks are looked up
//! in. It is the `.bib` files in the vault, read as they are; reading them
//! into works is the citation code's (slides-core), not the vault's.

use std::fs;

use super::Kasten;
use crate::error::Result;

/// The most bibliography files read, the most bytes of one, and of all of them.
/// A file over the limit is left out whole, not cut in the middle of an entry.
pub const MAX_BIB_FILES: usize = 64;
pub const MAX_BIB_BYTES: u64 = 4 * 1024 * 1024;
const MAX_BIB_TOTAL: usize = 8 * 1024 * 1024;

impl Kasten {
    /// The text of every `.bib` file in the vault, one after another in the
    /// order of their paths, a line between them. A key that is in two files is
    /// the first file's, since readers take the first. Files in private or hidden
    /// folders, hidden files and links are not read, and a file that is too big
    /// is left out. A vault with no `.bib` file has an empty bibliography.
    pub fn references(&self) -> Result<String> {
        let mut text = String::new();
        for file in self
            .vault
            .files(".bib")?
            .into_iter()
            .filter(|f| f.size <= MAX_BIB_BYTES)
            .take(MAX_BIB_FILES)
        {
            let Ok(path) = self.vault.file_of(&file.path, &[".bib"]) else {
                continue;
            };
            let Ok(bytes) = fs::read(path) else {
                continue;
            };
            if text.len() + bytes.len() > MAX_BIB_TOTAL {
                break;
            }
            text.push_str(&String::from_utf8_lossy(&bytes));
            text.push('\n');
        }
        Ok(text)
    }
}
