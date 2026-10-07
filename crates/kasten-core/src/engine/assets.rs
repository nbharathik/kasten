//! Files pasted or dropped into a page: they go to `assets/` and are
//! linked relatively. Each new file is one commit, with the sidecar that
//! remembers where it came from (asset_add.rs); the note's link to it
//! comes with the note's text.

use std::fs;

use super::Kasten;
use super::asset_files::existing_picture;
use crate::assets::NewAsset;
use crate::error::{Error, Result};
use crate::history::Actor;
use crate::slug::slugify;
use crate::time::Instant;

/// The largest file a page takes: bigger ones belong outside the vault's
/// history.
pub const MAX_ASSET_BYTES: usize = 50 * 1024 * 1024;

/// The kinds of file a page keeps: pictures, documents, sound, video,
/// data, drawings and archives. Nothing that runs when opened (a program,
/// script, shortcut or macro file) and nothing a browser opens as a page
/// (HTML or XML) is kept, whatever else it claims to be.
const KEPT: [&str; 68] = [
    // Pictures
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "avif",
    "bmp",
    "tif",
    "tiff",
    "heic",
    "heif",
    "ico",
    "svg",
    "psd",
    "ai",
    "sketch",
    "fig",
    "excalidraw",
    "drawio",
    // Documents
    "pdf",
    "txt",
    "md",
    "rtf",
    "doc",
    "docx",
    "odt",
    "pages",
    "epub",
    "tex",
    "bib",
    "xls",
    "xlsx",
    "ods",
    "numbers",
    "ppt",
    "pptx",
    "odp",
    "key",
    // Data
    "csv",
    "tsv",
    "json",
    "yaml",
    "yml",
    "ics",
    "vcf",
    "gpx",
    "kml",
    "srt",
    "vtt",
    // Sound
    "mp3",
    "m4a",
    "wav",
    "ogg",
    "oga",
    "opus",
    "flac",
    "aac",
    // Video
    "mp4",
    "m4v",
    "mov",
    "webm",
    "mkv",
    "avi",
    // Archives
    "zip",
    "gz",
    "tgz",
    "tar",
    "7z",
];

/// A safe name for `name`: its stem as a slug and its extension in lower
/// case. The folders a name came with are dropped.
pub(super) fn asset_name(name: &str) -> Result<(String, String)> {
    let bad = |why: &str| Error::Invalid(format!("Cannot keep “{}”: {why}", name.trim()));
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name).trim();
    let (stem, ext) = base
        .rsplit_once('.')
        .filter(|(stem, ext)| {
            !stem.trim().is_empty()
                && !ext.is_empty()
                && ext.len() <= 12
                && ext.chars().all(|c| c.is_ascii_alphanumeric())
        })
        .ok_or_else(|| bad("a file needs a name and an extension such as .png"))?;
    let ext = ext.to_ascii_lowercase();
    if !KEPT.contains(&ext.as_str()) {
        return Err(bad(
            "a page keeps pictures, documents, sound, video, data and archives, not files that run or open as web pages",
        ));
    }
    Ok((slugify(stem), ext))
}

/// The name a file came with, as its sidecar keeps it: the folders it was
/// given in are dropped.
pub(super) fn original_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name).trim();
    base.chars().take(255).collect()
}

impl Kasten {
    /// The bytes of a picture kept in `assets/`, by its vault path, which a
    /// slide shows and an export packs into its file. Only pictures directly
    /// or below `assets/` are read, never through a link. What counts as a
    /// picture is what the listing and the thumbnails say, extension in any
    /// case (`IMG_0001.JPG`), so a picture that is listed can be read.
    pub fn read_asset(&self, path: &str) -> Result<Vec<u8>> {
        let (file, meta) = existing_picture(&self.vault, path)?;
        if meta.len() > MAX_ASSET_BYTES as u64 {
            return Err(Error::Invalid(format!("{path} is too large to read")));
        }
        Ok(fs::read(&file)?)
    }

    /// Keeps `bytes` as `assets/<name>` and returns that vault path, with a
    /// sidecar in the same commit (see `add_asset`, which it is the short
    /// form of). The same bytes already anywhere in `assets/` are reused
    /// without a commit; other bytes under a taken name take `<name>-2`, and
    /// so on.
    pub fn save_asset(
        &self,
        actor: &Actor,
        name: &str,
        bytes: &[u8],
        now: Instant,
    ) -> Result<String> {
        Ok(self
            .add_asset(actor, name, bytes, &NewAsset::default(), now)?
            .path)
    }
}
