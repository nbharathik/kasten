//! What the folder host needs of the file system: names checked before they
//! are used, files written in one step or not at all, names that are free,
//! and the envelope every deck has.

use std::collections::hash_map::RandomState;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::io::{self, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::UNIX_EPOCH;

use serde_json::Value;

pub const EXT: &str = ".deck";
const FORMAT: &str = "kasten-deck";
/// The largest deck a save may carry.
pub const MAX_DECK: usize = 32 * 1024 * 1024;

#[derive(Debug)]
pub enum FolderError {
    NotFound(String),
    Invalid(String),
    Io(String),
}

impl From<io::Error> for FolderError {
    fn from(e: io::Error) -> FolderError {
        match e.kind() {
            io::ErrorKind::NotFound => FolderError::NotFound(e.to_string()),
            _ => FolderError::Io(e.to_string()),
        }
    }
}

impl std::fmt::Display for FolderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FolderError::NotFound(m) | FolderError::Invalid(m) | FolderError::Io(m) => {
                f.write_str(m)
            }
        }
    }
}

pub type Result<T> = std::result::Result<T, FolderError>;

/// FNV-1a over the bytes, as 16 hex digits: the hash Kasten uses for a file's
/// version, so a page and an app agree on what "the same" means.
pub fn content_hash(text: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}")
}

/// A plain file name: something a person could type, that names one file in one folder.
pub fn plain(name: &str) -> Result<&str> {
    let bad = name.is_empty()
        || name.len() > 200
        || name.starts_with('.')
        || name.contains(['/', '\\', ':', '\0', '\n', '\r']);
    if bad {
        return Err(FolderError::Invalid(format!("`{name}` is not a file name")));
    }
    Ok(name)
}

pub fn deck_name(name: &str) -> Result<&str> {
    let name = plain(name)?;
    match name.strip_suffix(EXT) {
        Some(stem) if !stem.is_empty() => Ok(name),
        _ => Err(FolderError::Invalid(format!(
            "`{name}` is not a .deck file"
        ))),
    }
}

pub fn millis(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}

/// Checks the envelope every deck has and returns its title and slide count.
/// Nothing else is read, so a deck of a newer format still passes.
pub fn head_of(text: &str) -> Result<(String, usize)> {
    if text.len() > MAX_DECK {
        return Err(FolderError::Invalid("the deck is too large".to_owned()));
    }
    let value: Value =
        serde_json::from_str(text).map_err(|e| FolderError::Invalid(format!("not a deck: {e}")))?;
    if value.get("format").and_then(Value::as_str) != Some(FORMAT) {
        return Err(FolderError::Invalid(format!(
            "not a deck: its format is not \"{FORMAT}\""
        )));
    }
    let slides = value
        .get("slides")
        .and_then(Value::as_array)
        .ok_or_else(|| FolderError::Invalid("not a deck: it has no slides list".to_owned()))?;
    let title = value
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    Ok((title, slides.len()))
}

/// A hidden name for the temporary one write goes through, that no other write uses: the process,
/// how many writes it has made, and some randomness (the standard library's per-process keys).
/// Hex keeps it short, so a file named near the limit can still be written.
fn temporary_name(name: &str) -> String {
    static WRITES: AtomicU64 = AtomicU64::new(0);
    let count = WRITES.fetch_add(1, Ordering::Relaxed);
    let random = RandomState::new().build_hasher().finish() as u32;
    format!(
        ".{name}.{:x}-{count:x}-{random:08x}.tmp",
        std::process::id()
    )
}

/// Writes a file in one step: a crash never leaves half of it, and two writes at once (two pages
/// saving one deck) never share a temporary, so one cannot be moved into place while the other is
/// still writing it.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let name = path
        .file_name()
        .map_or_else(String::new, |n| n.to_string_lossy().into_owned());
    let mut tries = 0;
    let temporary = loop {
        let candidate = path.with_file_name(temporary_name(&name));
        // `create_new` never opens a file that is there, so no other write is disturbed.
        match create_new(&candidate, bytes) {
            Ok(()) => break candidate,
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists && tries < 16 => tries += 1,
            Err(e) => return Err(e),
        }
    };
    // Windows can briefly deny replacement while readers or another rename
    // hold the destination. Retry the atomic move, never delete the target.
    // Readers can retain their handles for over a second; allow up to two.
    // If it still fails the hidden temporary stays for recovery.
    let mut retries = 0;
    loop {
        match fs::rename(&temporary, path) {
            Err(error)
                if cfg!(windows)
                    && matches!(error.raw_os_error(), Some(5 | 32 | 33))
                    && retries < 80 =>
            {
                retries += 1;
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            result => return result,
        }
    }
}

/// Makes a file that must not exist yet.
pub fn create_new(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(bytes)?;
    file.flush()
}

/// The first name `<stem><suffix>`, `<stem> 2<suffix>` … that is free in `dir`.
pub fn free_name(dir: &Path, stem: &str, suffix: &str) -> String {
    let mut name = format!("{stem}{suffix}");
    let mut n = 2;
    while fs::symlink_metadata(dir.join(&name)).is_ok() {
        name = format!("{stem} {n}{suffix}");
        n += 1;
    }
    name
}

pub fn slug(title: &str) -> String {
    let mut out = String::new();
    for c in title.trim().chars() {
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-');
    if out.is_empty() {
        "deck".to_owned()
    } else {
        out.chars().take(60).collect()
    }
}

#[cfg(test)]
mod tests;
