//! The pictures of the folder `slides dev` serves, in `assets/` beside the
//! decks. They are kept as Kasten keeps them (both use slides-assets): once, a
//! picture with the same bytes under any name in `assets/` being that
//! picture, each with a sidecar in a hidden `.meta` folder that remembers its
//! hash, size, how it came in, tags, a caption and a citation key. Where a
//! picture is used is worked out by looking at the folder's decks. Nothing is
//! ever deleted or replaced.

use std::collections::HashMap;
use std::collections::hash_map::RandomState;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::io::Read;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use slides_assets::sidecar::FOLDER;
use slides_assets::{Clip, SIZES, Sidecar, clean, id, probe, sha256_hex, thumbnail, time};

use super::files::{FolderError, Result, create_new, millis, plain, write_atomic};
use super::folder::Folder;
use super::{mime, stamp};

pub(super) const ASSETS: &str = "assets";

/// A picture as the page lists it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetEntry {
    pub path: String,
    /// The name it came with.
    pub name: String,
    pub bytes: u64,
    /// When it came in, in milliseconds.
    pub added: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub citation_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clip: Option<Clip>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deck: Option<String>,
}

/// What keeping a picture did.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Kept {
    pub path: String,
    /// False when the same bytes were kept before.
    pub created: bool,
}

/// A change to what a picture remembers; an empty caption or key clears it.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AssetEdit {
    pub tags: Option<Vec<String>>,
    pub caption: Option<String>,
    pub citation_key: Option<String>,
}

/// Small copies made so far, by picture, size and the file's time and size.
pub type Thumbs = std::sync::Mutex<HashMap<(String, u32, u64, u64), Arc<Vec<u8>>>>;

/// Eighty bits of randomness for an id, from the standard library's per-process keys.
fn entropy() -> u128 {
    let state = RandomState::new();
    let (mut a, mut b) = (state.build_hasher(), state.build_hasher());
    a.write_u64(0x736c_6964_6573);
    b.write_u64(a.finish());
    (u128::from(a.finish()) << 64) | u128::from(b.finish())
}

fn invalid(why: impl std::fmt::Display) -> FolderError {
    FolderError::Invalid(why.to_string())
}

impl Folder {
    fn pictures(&self) -> PathBuf {
        self.root().join(ASSETS)
    }

    fn card_file(&self, name: &str) -> PathBuf {
        self.pictures().join(FOLDER).join(format!("{name}.json"))
    }

    /// The file name of a picture path such as `assets/logo.png`.
    fn picture_name<'a>(&self, path: &'a str) -> Result<&'a str> {
        let name = path
            .strip_prefix("assets/")
            .ok_or_else(|| invalid("pictures live in assets/"))?;
        let name = plain(name)?;
        if !mime::is_picture(name) {
            return Err(invalid(format!("`{name}` is not a picture")));
        }
        Ok(name)
    }

    fn picture_file(&self, path: &str) -> Result<PathBuf> {
        Ok(self.pictures().join(self.picture_name(path)?))
    }

    /// A picture of the deck, with the type to send it as.
    pub fn asset(&self, path: &str) -> Result<(Vec<u8>, &'static str)> {
        let file = self.picture_file(path)?;
        let meta = fs::symlink_metadata(&file)?;
        if !meta.is_file() {
            return Err(FolderError::NotFound(format!("{path} is not a file")));
        }
        Ok((fs::read(&file)?, mime::content_type(path)))
    }

    /// Keeps a picture under `assets/` and says where. The same bytes under
    /// any name are the same picture; different bytes never replace a file.
    pub fn add_asset(&self, name: &str, bytes: &[u8]) -> Result<String> {
        Ok(self.keep_picture(name, bytes, "file")?.path)
    }

    /// `add_asset`, saying whether the picture is new and how it came in
    /// (`pasted` or `file`).
    pub fn keep_picture(&self, name: &str, bytes: &[u8], source: &str) -> Result<Kept> {
        let name = plain(name)?;
        if !mime::is_picture(name) {
            return Err(invalid(format!("`{name}` is not a picture")));
        }
        if bytes.is_empty() {
            return Err(invalid(format!("`{name}` is empty")));
        }
        if !matches!(source, "pasted" | "file") {
            return Err(invalid("a picture comes in pasted or as a file"));
        }
        let dir = self.pictures();
        fs::create_dir_all(&dir)?;
        if let Some(path) = self.same_bytes(name, bytes) {
            return Ok(Kept {
                path,
                created: false,
            });
        }
        let (stem, extension) = name.rsplit_once('.').unwrap_or((name, ""));
        let suffix = format!(".{extension}");
        let mut candidate = name.to_owned();
        let mut n = 2;
        loop {
            // A name is free when neither the picture nor a sidecar left behind has it.
            if fs::symlink_metadata(self.card_file(&candidate)).is_err() {
                match create_new(&dir.join(&candidate), bytes) {
                    Ok(()) => {
                        let now = stamp::now();
                        let mut card = Sidecar::new(&id::ulid(now, entropy()));
                        card.set_file(
                            name,
                            &sha256_hex(bytes),
                            bytes.len() as u64,
                            probe::dimensions(bytes),
                        );
                        card.set_origin(source, "person", &time::rfc3339(now));
                        // A picture without its sidecar is an old picture: still kept.
                        let _ = fs::create_dir_all(dir.join(FOLDER)).and_then(|()| {
                            create_new(&self.card_file(&candidate), card.to_text().as_bytes())
                        });
                        return Ok(Kept {
                            path: format!("{ASSETS}/{candidate}"),
                            created: true,
                        });
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
                    Err(e) => return Err(e.into()),
                }
            }
            candidate = format!("{stem} {n}{suffix}");
            n += 1;
        }
    }

    /// The picture in `assets/` with this extension and exactly these bytes, the first by name.
    fn same_bytes(&self, name: &str, bytes: &[u8]) -> Option<String> {
        let extension = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase())?;
        let mut names: Vec<String> = fs::read_dir(self.pictures())
            .ok()?
            .flatten()
            .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| {
                plain(n).is_ok() && n.to_ascii_lowercase().ends_with(&format!(".{extension}"))
            })
            .collect();
        names.sort();
        names.into_iter().find_map(|n| {
            let file = self.pictures().join(&n);
            let same = fs::metadata(&file).is_ok_and(|m| m.len() == bytes.len() as u64)
                && fs::read(&file).is_ok_and(|held| held == bytes);
            same.then(|| format!("{ASSETS}/{n}"))
        })
    }

    fn card_of(&self, name: &str) -> Option<Sidecar> {
        Sidecar::parse(&fs::read_to_string(self.card_file(name)).ok()?).ok()
    }

    fn entry(&self, name: &str, meta: &fs::Metadata) -> AssetEntry {
        let card = self.card_of(name);
        // A sidecar written for other bytes than these says nothing of the file.
        let fresh = card.as_ref().filter(|c| c.bytes() == Some(meta.len()));
        let size = fresh.and_then(Sidecar::size).or_else(|| {
            let mut head = Vec::new();
            fs::File::open(self.pictures().join(name))
                .ok()?
                .take(probe::HEAD_BYTES as u64)
                .read_to_end(&mut head)
                .ok()?;
            probe::dimensions(&head)
        });
        let card = card.as_ref();
        AssetEntry {
            path: format!("{ASSETS}/{name}"),
            name: card.and_then(Sidecar::name).unwrap_or(name).to_owned(),
            bytes: meta.len(),
            added: card
                .and_then(Sidecar::created)
                .and_then(time::rfc3339_millis)
                .unwrap_or_else(|| millis(meta)),
            width: size.map(|s| s.0),
            height: size.map(|s| s.1),
            id: card.and_then(Sidecar::id).map(str::to_owned),
            sha256: fresh.and_then(Sidecar::sha256).map(str::to_owned),
            source: card.and_then(Sidecar::source).map(str::to_owned),
            created_by: card.and_then(Sidecar::created_by).map(str::to_owned),
            tags: card.map(Sidecar::tags).unwrap_or_default(),
            caption: card.and_then(Sidecar::caption).map(str::to_owned),
            citation_key: card.and_then(Sidecar::citation_key).map(str::to_owned),
            clip: card.and_then(Sidecar::clip),
            deck: card.and_then(Sidecar::deck).map(str::to_owned),
        }
    }

    /// The pictures in `assets/`, newest first.
    pub fn assets(&self) -> Vec<AssetEntry> {
        let Ok(entries) = fs::read_dir(self.pictures()) else {
            return Vec::new();
        };
        let mut out: Vec<AssetEntry> = entries
            .flatten()
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().into_owned();
                let meta = entry.metadata().ok()?;
                (plain(&name).is_ok() && meta.is_file() && mime::is_picture(&name))
                    .then(|| self.entry(&name, &meta))
            })
            .collect();
        out.sort_by(|a, b| b.added.cmp(&a.added).then_with(|| a.path.cmp(&b.path)));
        out
    }

    /// Changes a picture's tags, caption or citation key. A sidecar that cannot be read is not written over.
    pub fn set_asset_meta(&self, path: &str, edit: &AssetEdit) -> Result<AssetEntry> {
        let name = self.picture_name(path)?.to_owned();
        let file = self.picture_file(path)?;
        let meta = fs::metadata(&file)?;
        if !meta.is_file() {
            return Err(FolderError::NotFound(format!("{path} is not a file")));
        }
        let tags = edit
            .tags
            .as_deref()
            .map(clean::tags)
            .transpose()
            .map_err(invalid)?;
        let caption = edit
            .caption
            .as_deref()
            .map(clean::caption)
            .transpose()
            .map_err(invalid)?;
        let key = edit
            .citation_key
            .as_deref()
            .map(clean::citation_key)
            .transpose()
            .map_err(invalid)?;
        let mut card = match fs::read_to_string(self.card_file(&name)) {
            Ok(text) => Sidecar::parse(&text)
                .map_err(|why| invalid(format!("the sidecar of {name} cannot be read: {why}")))?,
            Err(_) => Sidecar::new(&id::ulid(stamp::now(), entropy())),
        };
        let before = card.clone();
        if card.bytes() != Some(meta.len()) || card.sha256().is_none() {
            let bytes = fs::read(&file)?;
            let held = card.name().unwrap_or(&name).to_owned();
            card.set_file(
                &held,
                &sha256_hex(&bytes),
                bytes.len() as u64,
                probe::dimensions(&bytes),
            );
        }
        if let Some(tags) = &tags {
            card.set_tags(tags);
        }
        if let Some(caption) = &caption {
            card.set_caption(caption.as_deref());
        }
        if let Some(key) = &key {
            card.set_citation_key(key.as_deref());
        }
        if card != before {
            fs::create_dir_all(self.pictures().join(FOLDER))?;
            write_atomic(&self.card_file(&name), card.to_text().as_bytes())?;
        }
        Ok(self.entry(&name, &fs::metadata(&file)?))
    }

    /// A WebP copy of the picture that fits `size` pixels; None for a picture with no raster form.
    pub fn thumb(&self, path: &str, size: u32) -> Result<Option<Arc<Vec<u8>>>> {
        if !SIZES.contains(&size) {
            return Err(invalid(format!(
                "thumbnails come in {} or {} pixels",
                SIZES[0], SIZES[1]
            )));
        }
        let file = self.picture_file(path)?;
        let meta = fs::metadata(&file)?;
        let key = (path.to_owned(), size, millis(&meta), meta.len());
        if let Some(held) = self
            .thumbs
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(&key)
        {
            return Ok(Some(Arc::clone(held)));
        }
        let Some(webp) = thumbnail(&fs::read(&file)?, size) else {
            return Ok(None);
        };
        let webp = Arc::new(webp);
        self.thumbs
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(key, Arc::clone(&webp));
        Ok(Some(webp))
    }
}

mod usage;

#[cfg(test)]
mod tests;
