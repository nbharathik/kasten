//! Where each picture of the folder is used, worked out by looking at its
//! decks each time it is asked; nothing about it is stored.

use std::collections::BTreeMap;
use std::fs;

use serde::Serialize;
use slides_assets::deck;

use crate::dev::files::{EXT, deck_name, head_of};
use crate::dev::folder::Folder;

#[derive(Debug, Clone, Serialize)]
pub struct SlideUse {
    pub number: usize,
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeckUse {
    pub path: String,
    pub title: String,
    pub slides: Vec<SlideUse>,
    pub theme: bool,
}

/// A note or a board; a folder of decks has none, but the page reads the same account as Kasten's.
#[derive(Debug, Clone, Serialize)]
pub struct Place {
    pub path: String,
    pub title: String,
}

/// Where a picture is used: the folder has decks only.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Usage {
    pub notes: Vec<Place>,
    pub boards: Vec<Place>,
    pub decks: Vec<DeckUse>,
}

impl Folder {
    /// Where each picture is used: on which slides of which decks of the folder.
    pub fn usage(&self) -> BTreeMap<String, Usage> {
        let mut out: BTreeMap<String, Usage> = BTreeMap::new();
        let Ok(entries) = fs::read_dir(self.root()) else {
            return out;
        };
        let mut names: Vec<String> = entries
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| deck_name(n).is_ok())
            .collect();
        names.sort();
        for name in names {
            let Ok(text) = fs::read_to_string(self.root().join(&name)) else {
                continue;
            };
            let (Some(images), Ok((title, _))) = (deck::images_by_slide(&text), head_of(&text))
            else {
                continue;
            };
            let title = if title.trim().is_empty() {
                name.trim_end_matches(EXT).to_owned()
            } else {
                title
            };
            let mut used: BTreeMap<&str, DeckUse> = BTreeMap::new();
            let fresh = || DeckUse {
                path: name.clone(),
                title: title.clone(),
                slides: Vec::new(),
                theme: false,
            };
            for (at, (slide, paths)) in images.slides.iter().enumerate() {
                for path in paths.iter().filter(|p| p.starts_with("assets/")) {
                    used.entry(path)
                        .or_insert_with(fresh)
                        .slides
                        .push(SlideUse {
                            number: at + 1,
                            id: slide.clone(),
                        });
                }
            }
            for path in images.theme.iter().filter(|p| p.starts_with("assets/")) {
                used.entry(path).or_insert_with(fresh).theme = true;
            }
            for (path, deck_use) in used {
                out.entry(path.to_owned()).or_default().decks.push(deck_use);
            }
        }
        out
    }
}
