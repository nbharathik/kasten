//! Where a picture is used, worked out by looking at every note, whiteboard
//! and deck, so it can never be out of date. One scan answers for all the
//! pictures at once; asking about one takes that scan too.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;

use serde_json::Value;

use super::Kasten;
use super::asset_files::walk;
use crate::assets::refs::{Ref, image_refs};
use crate::assets::{AssetUsage, DeckUse, Place, SlideUse};
use crate::board;
use crate::deck;
use crate::error::{Error, Result};
use crate::note::meta_for;

fn stem_of(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rsplit_once('.')
        .map_or(name, |(stem, _)| stem)
        .to_owned()
}

impl Kasten {
    /// Where the picture at `path` is used: the notes that show it, the
    /// boards with a card for it, and the slides of decks that place it.
    /// A picture that is not there (a broken link) is still reported where
    /// it is named.
    pub fn asset_usage(&self, path: &str) -> Result<AssetUsage> {
        if !path.starts_with("assets/") || path.ends_with('/') {
            return Err(Error::InvalidPath(path.to_owned()));
        }
        self.vault.file_of(path, &[""])?;
        Ok(self.assets_usage()?.remove(path).unwrap_or_default())
    }

    /// The use of every picture that is used, by path, from one look at the
    /// vault. A picture not in the map is not used anywhere.
    pub fn assets_usage(&self) -> Result<BTreeMap<String, AssetUsage>> {
        let mut out: BTreeMap<String, AssetUsage> = BTreeMap::new();
        let in_assets = |path: &str| path.starts_with("assets/");

        // Files in assets/ by name, for `![[name.png]]`.
        let mut by_name: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for found in walk(&self.vault) {
            let name = found
                .rel
                .rsplit('/')
                .next()
                .unwrap_or(&found.rel)
                .to_lowercase();
            by_name.entry(name).or_default().push(found.rel);
        }

        for file in self.vault.files(".md")? {
            let Ok(text) = fs::read_to_string(self.vault.root().join(&file.path)) else {
                continue;
            };
            let refs = image_refs(&file.path, &text);
            if refs.is_empty() {
                continue;
            }
            let title = meta_for(&file.path, &text, file.modified).title;
            // A note that names a picture twice, or by its name and its path, uses it once.
            let mut shown = BTreeSet::new();
            for found in refs {
                shown.extend(match found {
                    Ref::Path(path) => vec![path],
                    Ref::Name(name) => by_name
                        .get(&name.to_lowercase())
                        .cloned()
                        .unwrap_or_default(),
                });
            }
            for path in shown.into_iter().filter(|p| in_assets(p)) {
                out.entry(path).or_default().notes.push(Place {
                    path: file.path.clone(),
                    title: title.clone(),
                });
            }
        }

        for file in self.vault.files(".canvas")? {
            let Ok(canvas) = board::read_board(&self.vault, &file.path) else {
                continue;
            };
            let title = canvas
                .title()
                .map_or_else(|| stem_of(&file.path), str::to_owned);
            let mut shown: Vec<&str> = canvas
                .nodes()
                .iter()
                .filter(|node| node.get("type").and_then(Value::as_str) == Some("file"))
                .filter_map(|node| node.get("file").and_then(Value::as_str))
                .filter(|path| in_assets(path))
                .collect();
            shown.sort_unstable();
            shown.dedup();
            for path in shown {
                out.entry(path.to_owned()).or_default().boards.push(Place {
                    path: file.path.clone(),
                    title: title.clone(),
                });
            }
        }

        for file in self.vault.files(".deck")? {
            let Ok(read) = deck::read_deck(&self.vault, &file.path) else {
                continue;
            };
            let Some(images) = deck::images_by_slide(&read.text) else {
                continue;
            };
            let title = deck::head_of(&read.text)
                .ok()
                .and_then(|head| head.title)
                .filter(|title| !title.trim().is_empty())
                .unwrap_or_else(|| stem_of(&file.path));
            let mut used: BTreeMap<&str, DeckUse> = BTreeMap::new();
            let fresh = || DeckUse {
                path: file.path.clone(),
                title: title.clone(),
                slides: Vec::new(),
                theme: false,
            };
            for (at, (id, paths)) in images.slides.iter().enumerate() {
                for path in paths.iter().filter(|p| in_assets(p)) {
                    used.entry(path.as_str())
                        .or_insert_with(&fresh)
                        .slides
                        .push(SlideUse {
                            number: at + 1,
                            id: id.clone(),
                        });
                }
            }
            for path in images.theme.iter().filter(|p| in_assets(p)) {
                used.entry(path.as_str()).or_insert_with(&fresh).theme = true;
            }
            for (path, deck_use) in used {
                out.entry(path.to_owned()).or_default().decks.push(deck_use);
            }
        }

        for usage in out.values_mut() {
            usage.notes.sort_by(|a, b| a.path.cmp(&b.path));
            usage.boards.sort_by(|a, b| {
                a.title
                    .to_lowercase()
                    .cmp(&b.title.to_lowercase())
                    .then_with(|| a.path.cmp(&b.path))
            });
            usage.decks.sort_by(|a, b| {
                a.title
                    .to_lowercase()
                    .cmp(&b.title.to_lowercase())
                    .then_with(|| a.path.cmp(&b.path))
            });
        }
        Ok(out)
    }
}
