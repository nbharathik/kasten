//! Search by meaning: a vector per note
//! from an embedding model, kept in `.kasten/cache/vectors.sqlite` beside
//! the index. Like the index they are derived: deleting the file loses only
//! the time to make them again. The app asks the model, since it holds the
//! keys and the network; the core says which notes need a vector, keeps
//! them, and finds the notes nearest a question's vector.

mod store;

use std::collections::HashSet;

use serde::Serialize;

pub(crate) use store::Vectors;
use store::unit;

use crate::engine::Kasten;
use crate::error::Result;
use crate::note::content_hash;

pub const VECTORS_PATH: &str = ".kasten/cache/vectors.sqlite";
/// A note's text for the model, cut to what embedding models take.
const MAX_TEXT: usize = 8_000;
/// Nearest notes looked at, to fill a page after gone ones drop out.
const EXTRA: usize = 8;

/// A note waiting for its vector.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToEmbed {
    pub path: String,
    /// The note's time and size when read, handed back with its vector.
    pub stamp: String,
    /// Its words' hash, handed back too.
    pub hash: String,
    /// What the model reads: the title, a blank line and the body.
    pub text: String,
}

/// A vector the model made for a note waiting.
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Embedded {
    pub path: String,
    pub stamp: String,
    pub hash: String,
    pub vector: Vec<f32>,
}

/// How far a model's vectors cover the vault.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbedStatus {
    pub model: String,
    pub done: usize,
    pub total: usize,
}

/// A note near a question.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Nearest {
    pub path: String,
    pub title: String,
    pub icon: Option<String>,
    pub excerpt: String,
    /// Cosine similarity, 1 the nearest.
    pub score: f32,
}

fn text_for(title: &str, body: &str) -> String {
    let mut text = format!("{}\n\n{}", title.trim(), body.trim());
    if text.len() > MAX_TEXT {
        let mut end = MAX_TEXT;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        text.truncate(end);
    }
    text
}

impl Kasten {
    /// How many notes have a current vector from `model`, of how many.
    pub fn embed_status(&self, model: &str) -> Result<EmbedStatus> {
        let notes = self.index().embed_stamps()?;
        let stored = self.vectors.stamps(model)?;
        let done = notes
            .iter()
            .filter(|n| {
                stored
                    .get(&n.path)
                    .is_some_and(|(stamp, _)| *stamp == n.stamp)
            })
            .count();
        Ok(EmbedStatus {
            model: model.to_owned(),
            done,
            total: notes.len(),
        })
    }

    /// Up to `limit` notes that need a vector from `model`: new ones, and
    /// ones whose words changed, the latest changed first. A note touched
    /// without a change to its words keeps its vector. Vectors of notes
    /// that are gone are forgotten.
    pub fn to_embed(&self, model: &str, limit: usize) -> Result<Vec<ToEmbed>> {
        let notes = self.index().embed_stamps()?;
        let mut stored = self.vectors.stamps(model)?;
        let present: HashSet<&str> = notes.iter().map(|n| n.path.as_str()).collect();
        let gone: Vec<String> = stored
            .keys()
            .filter(|p| !present.contains(p.as_str()))
            .cloned()
            .collect();
        self.vectors.forget(model, &gone)?;
        let mut todo = Vec::new();
        let mut same = Vec::new();
        for note in notes {
            if todo.len() >= limit {
                break;
            }
            let known = stored.remove(&note.path);
            if known
                .as_ref()
                .is_some_and(|(stamp, _)| *stamp == note.stamp)
            {
                continue;
            }
            let (title, body) = self.index().embed_text(note.num)?;
            let text = text_for(&title, &body);
            let hash = content_hash(&text);
            if known.is_some_and(|(_, known)| known == hash) {
                same.push((note.path, note.stamp));
                continue;
            }
            todo.push(ToEmbed {
                path: note.path,
                stamp: note.stamp,
                hash,
                text,
            });
        }
        self.vectors.restamp(model, &same)?;
        Ok(todo)
    }

    /// Keeps vectors `model` made for notes waiting; how many. All are
    /// checked before any is kept.
    pub fn keep_vectors(&self, model: &str, made: &[Embedded]) -> Result<usize> {
        let rows = made
            .iter()
            .map(|m| {
                Ok((
                    m.path.as_str(),
                    m.stamp.as_str(),
                    m.hash.as_str(),
                    unit(&m.vector)?,
                ))
            })
            .collect::<Result<Vec<_>>>()?;
        self.vectors.keep(model, &rows)?;
        Ok(rows.len())
    }

    /// Up to `limit` notes nearest the question's vector `query` from
    /// `model`, the nearest first. Nothing when the model has no vectors or
    /// they are another size.
    pub fn nearest(&self, model: &str, query: &[f32], limit: usize) -> Result<Vec<Nearest>> {
        let query = unit(query)?;
        let found = self
            .vectors
            .nearest(model, &query, limit.saturating_add(EXTRA))?;
        let index = self.index();
        let mut out = Vec::new();
        for (path, score) in found {
            if out.len() >= limit {
                break;
            }
            // Trashed or moved since its vector was made.
            let Some(shown) = index.shown(&path)? else {
                continue;
            };
            out.push(Nearest {
                path,
                title: shown.title,
                icon: shown.icon,
                excerpt: shown.excerpt,
                score,
            });
        }
        Ok(out)
    }
}
