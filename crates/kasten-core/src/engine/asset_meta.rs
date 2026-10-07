//! The gallery's view of `assets/`: the pictures with what their sidecars
//! say, one picture in full, and changes to its tags, caption and citation
//! key. Looking writes nothing: an old picture without a sidecar gets one
//! with its first change.

use slides_assets::{Sidecar, clean, probe, sidecar_path};

use super::asset_files::{Card, Papers, existing_picture, facts, info_of, read_card, walk};
use super::{Change, Kasten, MAX_ASSET_BYTES};
use crate::assets::{AssetEdit, AssetInfo};
use crate::atomic::write_atomic;
use crate::error::{Error, Result};
use crate::history::Actor;
use crate::id::ulid_at;
use crate::time::Instant;

fn invalid(why: impl Into<String>) -> Error {
    Error::Invalid(why.into())
}

impl Kasten {
    /// Every picture kept in `assets/` (pictures only), newest first. A
    /// picture without a sidecar is listed from what its file says.
    pub fn assets(&self) -> Result<Vec<AssetInfo>> {
        let mut papers = Papers::default();
        let mut out = Vec::new();
        for found in walk(&self.vault) {
            let name = found.rel.rsplit('/').next().unwrap_or(&found.rel);
            if !probe::is_picture_name(name) {
                continue;
            }
            // A sidecar that cannot be read leaves its picture listed, undescribed.
            let card = read_card(&self.vault, &found.rel).unwrap_or(Card::Missing);
            out.push(info_of(
                &self.vault,
                &found.rel,
                &found.meta,
                &card,
                false,
                &mut papers,
            ));
        }
        out.sort_by(|a, b| b.added.cmp(&a.added).then_with(|| a.path.cmp(&b.path)));
        Ok(out)
    }

    /// One picture in full: its hash is read from the file when the sidecar
    /// does not have it.
    pub fn asset(&self, path: &str) -> Result<AssetInfo> {
        let (_, meta) = existing_picture(&self.vault, path)?;
        let card = read_card(&self.vault, path).unwrap_or(Card::Missing);
        Ok(info_of(
            &self.vault,
            path,
            &meta,
            &card,
            true,
            &mut Papers::default(),
        ))
    }

    /// Changes what the sidecar of the picture at `path` says, in one
    /// commit: tags replaced, a caption or citation key set or (empty)
    /// cleared. A sidecar this version cannot read is not written over.
    pub fn set_asset_meta(
        &self,
        actor: &Actor,
        path: &str,
        edit: &AssetEdit,
        now: Instant,
    ) -> Result<AssetInfo> {
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
        self.apply(actor, "set_asset_meta", false, now.millis, |vault| {
            let (file, meta) = existing_picture(vault, path)?;
            let card_rel = sidecar_path(path).ok_or_else(|| Error::InvalidPath(path.to_owned()))?;
            let file_name = path.rsplit('/').next().unwrap_or(path).to_owned();
            let (mut card, existed) = match read_card(vault, path)? {
                Card::Fine(card) => (card, true),
                Card::Missing => (Sidecar::new(&ulid_at(now.millis)), false),
                Card::Broken(why) => {
                    return Err(invalid(format!(
                        "The sidecar of {file_name} ({card_rel}) cannot be read: {why}. Fix or move that file first"
                    )));
                }
            };
            let before = card.clone();
            let mut papers = Papers::default();
            let nothing = tags.is_none() && caption.is_none() && key.is_none();
            if nothing && !existed {
                // No sidecar and nothing to say: none is made.
                let info = info_of(vault, path, &meta, &Card::Missing, true, &mut papers);
                return Ok(Change { message: String::new(), paths: vec![], value: info });
            }
            // A new sidecar, or one written for another file than this, learns what the file is.
            if !existed || card.bytes() != Some(meta.len()) || card.sha256().is_none() {
                if meta.len() > MAX_ASSET_BYTES as u64 {
                    return Err(invalid(format!("{file_name} is too large to describe")));
                }
                let (size, hash) = facts(&file, &meta);
                let hash = hash.ok_or_else(|| invalid(format!("{file_name} cannot be read")))?;
                let name = card.name().map_or_else(|| file_name.clone(), str::to_owned);
                card.set_file(&name, &hash, meta.len(), size);
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
            if existed && card == before {
                let info = info_of(vault, path, &meta, &Card::Fine(card), true, &mut papers);
                return Ok(Change { message: String::new(), paths: vec![], value: info });
            }
            write_atomic(&vault.file_of(&card_rel, &[".json"])?, card.to_text().as_bytes())?;
            let info = info_of(vault, path, &meta, &Card::Fine(card), true, &mut papers);
            Ok(Change {
                message: format!("asset: edit {file_name}"),
                paths: vec![card_rel],
                value: info,
            })
        })
    }
}
