//! Keeping links where they went through the engine's ops: the
//! index says which notes may link to what an op changes, and only those
//! are read.

use std::collections::HashMap;

use super::Kasten;
use crate::error::Result;
use crate::links::keep::{keep_after_moves, keep_in_vault};
use crate::links::path_key;
use crate::note::NoteMeta;
use crate::vault::Vault;

impl Kasten {
    /// Notes that may link to `notes`, by title or by path, or to one of
    /// `titles`.
    pub(crate) fn linking_any(&self, notes: &[&NoteMeta], titles: &[&str]) -> Result<Vec<String>> {
        let index = self.index();
        let mut out = Vec::new();
        for note in notes {
            let key = path_key(&note.path);
            out.extend(index.linking(&note.title)?);
            out.extend(index.linking(&key)?);
            out.extend(index.linking(&format!("{key}.md"))?);
        }
        for title in titles {
            out.extend(index.linking(title)?);
        }
        out.sort();
        out.dedup();
        Ok(out)
    }

    /// After `moves`, keeps every link to the moved notes, and in them,
    /// going where it went. `notes` is every note before the moves.
    pub(crate) fn keep_after(
        &self,
        vault: &Vault,
        notes: &[NoteMeta],
        moves: &[(String, String)],
    ) -> Result<Vec<String>> {
        let moved: Vec<&NoteMeta> = moves
            .iter()
            .filter_map(|(from, _)| notes.iter().find(|n| &n.path == from))
            .collect();
        let candidates = self.linking_any(&moved, &[])?;
        keep_after_moves(vault, notes, moves, &candidates)
    }

    /// After making `note`, whose title other notes may have, keeps the
    /// links to those notes going where they went.
    pub(crate) fn keep_for_new(&self, vault: &Vault, note: &NoteMeta) -> Result<Vec<String>> {
        let namesakes = self
            .index()
            .by_title(&note.title)?
            .into_iter()
            .any(|p| p != note.path && !crate::vault::in_templates(&p));
        if !namesakes {
            return Ok(Vec::new());
        }
        let before = self.index().notes()?;
        let after: Vec<NoteMeta> = before
            .iter()
            .filter(|n| n.path != note.path)
            .cloned()
            .chain(std::iter::once(note.clone()))
            .collect();
        let candidates = self.index().linking(&note.title)?;
        keep_in_vault(vault, &before, &after, &HashMap::new(), &candidates)
    }
}
