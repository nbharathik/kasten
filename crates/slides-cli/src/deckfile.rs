//! Reading and writing a deck file. The file is replaced in one step, so a
//! crash never leaves half a deck.

use std::fs;
use std::path::Path;

use slides_core::{Deck, canonical};

pub fn read(path: &Path) -> Result<Deck, String> {
    let text =
        fs::read_to_string(path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    canonical::parse(&text).map_err(|e| format!("{}: {e}", path.display()))
}

pub fn write(path: &Path, deck: &Deck) -> Result<(), String> {
    let text = canonical::write(deck).map_err(|e| e.to_string())?;
    let mut temporary = path.as_os_str().to_owned();
    temporary.push(".tmp");
    let temporary = Path::new(&temporary);
    fs::write(temporary, text).map_err(|e| format!("cannot write {}: {e}", temporary.display()))?;
    fs::rename(temporary, path).map_err(|e| format!("cannot replace {}: {e}", path.display()))
}

/// Something to start the ids from, different for every run.
pub fn seed() -> u64 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos() as u64);
    nanos ^ (u64::from(std::process::id()) << 32)
}
