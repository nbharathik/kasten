//! The pictures a deck names. The renderer does not go looking for them: whoever asks for a render says where they
//! are, and the page is given only those (a path in the deck, never an address).

use std::fs;
use std::path::{Component, Path, PathBuf};

/// The largest picture read, in bytes: a bigger file is more likely a mistake than a slide's picture.
pub const MOST_BYTES: u64 = 64 * 1024 * 1024;

/// A source of the pictures a deck names by path, such as `assets/figure.png`.
pub trait Media: Send + Sync {
    /// The bytes of the picture at `path`, or `None` when there is none.
    fn read(&self, path: &str) -> Option<Vec<u8>>;
}

/// No pictures: every one the deck names is missing (and told of).
pub struct NoMedia;

impl Media for NoMedia {
    fn read(&self, _path: &str) -> Option<Vec<u8>> {
        None
    }
}

/// Pictures read from a folder, and never from outside it.
pub struct FolderMedia {
    /// The folder as the file system spells it, so that a link out of it can be seen.
    root: PathBuf,
}

/// The path a deck names a picture by, if it stays inside the folder it is relative to: no `..`, no root or drive,
/// no backslash to mean either on another system.
pub fn inside(path: &str) -> Option<PathBuf> {
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

impl FolderMedia {
    /// Pictures under `root`. Fails when there is no such folder.
    pub fn new(root: impl AsRef<Path>) -> std::io::Result<FolderMedia> {
        Ok(FolderMedia {
            root: root.as_ref().canonicalize()?,
        })
    }
}

impl Media for FolderMedia {
    fn read(&self, path: &str) -> Option<Vec<u8>> {
        let real = self.root.join(inside(path)?).canonicalize().ok()?;
        // A link inside the folder may point out of it; that is out of bounds too.
        if !real.starts_with(&self.root) {
            return None;
        }
        let meta = fs::metadata(&real).ok()?;
        (meta.is_file() && meta.len() <= MOST_BYTES)
            .then(|| fs::read(real).ok())
            .flatten()
    }
}

/// What kind of picture these bytes are, as a media type, for the browser to be told.
pub fn media_type(bytes: &[u8], path: &str) -> &'static str {
    if let Some(kind) = slides_core::agent::sniff(bytes) {
        return kind.mime();
    }
    match path
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("avif") => "image/avif",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests;
