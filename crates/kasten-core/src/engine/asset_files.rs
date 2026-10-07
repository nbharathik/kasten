//! Pictures in `assets/` as files: which there are, their sidecars, and what
//! is known of each from the sidecar and the file together. The sidecar is
//! believed while it fits the file (same size); a file changed outside
//! Kasten is read again.

use std::collections::HashMap;
use std::fs;
use std::io::{ErrorKind, Read};
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use slides_assets::{Sidecar, probe, sha256_hex, sidecar_path};

use super::MAX_ASSET_BYTES;
use crate::assets::AssetInfo;
use crate::error::{Error, Result};
use crate::vault::Vault;

pub(super) const ASSETS: &str = "assets";

/// How deep below `assets/` pictures are looked for.
const DEPTH: usize = 12;

/// A file under `assets/`.
pub(super) struct Found {
    pub rel: String,
    pub meta: fs::Metadata,
}

fn walk_into(dir: &std::path::Path, prefix: &str, depth: usize, out: &mut Vec<Found>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        // Hidden entries (the `.meta` folders among them) and links are not pictures.
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        let rel = format!("{prefix}/{name}");
        if kind.is_dir() && depth < DEPTH {
            walk_into(&entry.path(), &rel, depth + 1, out);
        } else if kind.is_file()
            && let Ok(meta) = entry.metadata()
        {
            out.push(Found { rel, meta });
        }
    }
}

/// Every file under `assets/`, in path order.
pub(super) fn walk(vault: &Vault) -> Vec<Found> {
    let mut out = Vec::new();
    walk_into(&vault.root().join(ASSETS), ASSETS, 0, &mut out);
    out.sort_by(|a, b| a.rel.cmp(&b.rel));
    out
}

/// The file at the vault path of a picture in `assets/`, checked by its
/// form: under `assets/`, a plain path with a picture's extension, in any
/// case, not reached through a link.
pub(super) fn picture(vault: &Vault, path: &str) -> Result<PathBuf> {
    let name = path.rsplit('/').next().unwrap_or(path);
    if !path.starts_with("assets/") || !probe::is_picture_name(name) {
        return Err(Error::InvalidPath(path.to_owned()));
    }
    vault.file_of(path, &[""])
}

/// The file of a picture that is there.
pub(super) fn existing_picture(vault: &Vault, path: &str) -> Result<(PathBuf, fs::Metadata)> {
    let file = picture(vault, path)?;
    match fs::metadata(&file) {
        Ok(meta) if meta.is_file() => Ok((file, meta)),
        Ok(_) => Err(Error::NotFound(path.to_owned())),
        Err(err) if err.kind() == ErrorKind::NotFound => Err(Error::NotFound(path.to_owned())),
        Err(err) => Err(err.into()),
    }
}

/// A picture's sidecar as found.
pub(super) enum Card {
    Missing,
    Fine(Sidecar),
    /// There is a file that is not a sidecar; why.
    Broken(String),
}

impl Card {
    pub fn fine(&self) -> Option<&Sidecar> {
        match self {
            Card::Fine(card) => Some(card),
            _ => None,
        }
    }
}

pub(super) fn read_card(vault: &Vault, picture: &str) -> Result<Card> {
    let Some(rel) = sidecar_path(picture) else {
        return Ok(Card::Missing);
    };
    let file = vault.file_of(&rel, &[".json"])?;
    match fs::read_to_string(&file) {
        Ok(text) => Ok(match Sidecar::parse(&text) {
            Ok(card) => Card::Fine(card),
            Err(why) => Card::Broken(why),
        }),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(Card::Missing),
        // Not UTF-8 text, or unreadable: not one of ours.
        Err(err) if err.kind() == ErrorKind::InvalidData => {
            Ok(Card::Broken("it is not text".to_owned()))
        }
        Err(err) => Err(err.into()),
    }
}

/// The first bytes of a file, enough to read a picture's size.
fn head(file: &std::path::Path) -> Option<Vec<u8>> {
    let mut bytes = Vec::new();
    fs::File::open(file)
        .ok()?
        .take(probe::HEAD_BYTES as u64)
        .read_to_end(&mut bytes)
        .ok()?;
    Some(bytes)
}

fn millis(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}

/// The size in pixels and hash of the picture as it is on disk.
pub(super) fn facts(
    file: &std::path::Path,
    meta: &fs::Metadata,
) -> (Option<(u32, u32)>, Option<String>) {
    if meta.len() > MAX_ASSET_BYTES as u64 {
        return (head(file).and_then(|h| probe::dimensions(&h)), None);
    }
    match fs::read(file) {
        Ok(bytes) => (probe::dimensions(&bytes), Some(sha256_hex(&bytes))),
        Err(_) => (None, None),
    }
}

/// Titles of the papers figures were clipped from, looked up once each.
#[derive(Default)]
pub(super) struct Papers(HashMap<String, Option<String>>);

impl Papers {
    pub fn title(&mut self, vault: &Vault, pdf: &str) -> Option<String> {
        self.0
            .entry(pdf.to_owned())
            .or_insert_with(|| {
                let named = super::sources::read_sidecar(vault, pdf)
                    .ok()
                    .flatten()
                    .and_then(|card| card.title().map(str::to_owned));
                named.or_else(|| Some(super::sources::stem(pdf).to_owned()))
            })
            .clone()
    }
}

/// What is known of the picture at `rel`. With `full`, a file without a
/// hash on record is read and hashed; without it, that hash is left out.
pub(super) fn info_of(
    vault: &Vault,
    rel: &str,
    meta: &fs::Metadata,
    card: &Card,
    full: bool,
    papers: &mut Papers,
) -> AssetInfo {
    let file = vault.root().join(rel);
    let sidecar = card.fine();
    // A sidecar written for other bytes than these says nothing of the file.
    let current = sidecar.filter(|s| s.bytes() == Some(meta.len()));
    let mut sha256 = current.and_then(|s| s.sha256()).map(str::to_owned);
    let mut size = current.and_then(Sidecar::size);
    if sha256.is_none() && full {
        let (read_size, read_hash) = facts(&file, meta);
        size = size.or(read_size);
        sha256 = read_hash;
    }
    if size.is_none() {
        size = head(&file).and_then(|h| probe::dimensions(&h));
    }
    let created = sidecar.and_then(Sidecar::created).map(str::to_owned);
    let clip = sidecar.and_then(Sidecar::clip);
    let paper = clip.as_ref().and_then(|c| papers.title(vault, &c.pdf));
    AssetInfo {
        path: rel.to_owned(),
        name: sidecar.and_then(Sidecar::name).map_or_else(
            || rel.rsplit('/').next().unwrap_or(rel).to_owned(),
            str::to_owned,
        ),
        id: sidecar.and_then(Sidecar::id).map(str::to_owned),
        bytes: meta.len(),
        sha256,
        width: size.map(|s| s.0),
        height: size.map(|s| s.1),
        source: sidecar.and_then(Sidecar::source).map(str::to_owned),
        created_by: sidecar.and_then(Sidecar::created_by).map(str::to_owned),
        added: created
            .as_deref()
            .and_then(slides_assets::time::rfc3339_millis)
            .unwrap_or_else(|| millis(meta)),
        created,
        tags: sidecar.map(Sidecar::tags).unwrap_or_default(),
        caption: sidecar.and_then(Sidecar::caption).map(str::to_owned),
        citation_key: sidecar.and_then(Sidecar::citation_key).map(str::to_owned),
        clip,
        deck: sidecar.and_then(Sidecar::deck).map(str::to_owned),
        paper,
        described: sidecar.is_some(),
    }
}
