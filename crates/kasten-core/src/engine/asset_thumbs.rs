//! Thumbnails of pictures: WebP at 256 or 1024 pixels, made when first asked
//! for and kept under `.kasten/cache/thumbs/` by the picture's hash and the
//! size. The hash is worked out from the bytes each time, never taken from
//! a sidecar, which can be stale or written by anyone. The cache belongs to
//! this computer (history leaves it out) and is only ever a copy: the
//! original is what an export uses.

use std::fs;

use slides_assets::{SIZES, sha256_hex, thumbnail};

use super::asset_files::existing_picture;
use super::{Kasten, MAX_ASSET_BYTES};
use crate::atomic::write_atomic;
use crate::error::{Error, Result};

impl Kasten {
    /// A WebP thumbnail of the picture at `path` that fits `size` pixels
    /// (256 or 1024; a smaller picture keeps its size). None when the
    /// picture has no raster form to shrink, such as a vector picture: the
    /// original is what to show then.
    pub fn asset_thumb(&self, path: &str, size: u32) -> Result<Option<Vec<u8>>> {
        if !SIZES.contains(&size) {
            return Err(Error::Invalid(format!(
                "Thumbnails come in {} or {} pixels",
                SIZES[0], SIZES[1]
            )));
        }
        let (file, meta) = existing_picture(&self.vault, path)?;
        if meta.len() > MAX_ASSET_BYTES as u64 {
            return Ok(None);
        }
        // The key is the hash of the bytes read now. A sidecar's hash could name another picture's
        // thumbnail, or be the place a wrong one is left for that picture to find.
        let bytes = fs::read(&file)?;
        let target = self
            .vault
            .tracked_file(&format!(
                ".kasten/cache/thumbs/{}-{size}.webp",
                sha256_hex(&bytes)
            ))
            .ok();
        if let Some(hit) = target.as_ref().and_then(|target| fs::read(target).ok()) {
            return Ok(Some(hit));
        }
        let Some(webp) = thumbnail(&bytes, size) else {
            return Ok(None);
        };
        // A cache that cannot be written is slower, not broken.
        if let Some(target) = &target {
            let _ = write_atomic(target, &webp);
        }
        Ok(Some(webp))
    }
}
