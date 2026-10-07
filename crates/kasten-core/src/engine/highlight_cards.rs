//! Highlight cards: a card in the inbox with a
//! highlight's quote, its comment and a link back to the spot, made
//! together with its sidecar entry in one commit.

use super::sources::{check_source, read_sidecar, stem, write_sidecar};
use super::{Change, Kasten};
use crate::atomic::write_atomic;
use crate::error::{Error, Result};
use crate::frontmatter::{join, set_key_raw, split, yaml_flow_scalar};
use crate::history::Actor;
use crate::import::link_path;
use crate::note::NoteFile;
use crate::ops::{self, Kind, NewNote, eol_of};
use crate::sources::{Highlight, one_line, shortened};
use crate::time::Instant;

/// A highlight card's title: the quote, shortened, without the characters
/// that would break a link to it.
fn card_title(text: &str) -> String {
    let title = shortened(&text.replace(['[', ']', '|', '#'], " "), 60, 50);
    if title.is_empty() {
        "Highlight".to_owned()
    } else {
        title
    }
}

/// The quote on one line, escaped so it stays plain text in a blockquote.
fn quoted(text: &str) -> String {
    let line = one_line(text).replace("[[", "\\[[");
    let starts_block = line.starts_with(['#', '>', '-', '+', '*', '='])
        || line.split_once(['.', ')']).is_some_and(|(n, _)| {
            !n.is_empty() && n.len() <= 9 && n.chars().all(|c| c.is_ascii_digit())
        });
    if starts_block {
        format!("\\{line}")
    } else {
        line
    }
}

/// The card's body: the quote, the comment, and a link back to the spot,
/// relative to the card's folder as links to files are.
fn card_body(h: &Highlight, title: &str, source: &str, card: &str, eol: &str) -> String {
    let mut parts = vec![format!("> {}", quoted(&h.text))];
    if let Some(comment) = h
        .comment
        .as_deref()
        .map(str::trim)
        .filter(|c| !c.is_empty())
    {
        parts.push(comment.replace("\r\n", "\n").replace('\n', eol));
    }
    let up = "../".repeat(card.matches('/').count());
    let target = format!("{up}{}", link_path(source));
    let label = title.replace('[', "\\[").replace(']', "\\]");
    parts.push(format!(
        "[{label}, page {}]({target}#page={}&highlight={})",
        h.page, h.page, h.id
    ));
    format!("{}{eol}", parts.join(&format!("{eol}{eol}")))
}

impl Kasten {
    /// The highlight card of highlight `id`: a card of `type: highlight` in
    /// the inbox with the quote, the comment and a link back, and
    /// `source: {file, page, highlight}` in its frontmatter, made with its
    /// sidecar entry in one commit. A card already made is returned as it is.
    pub fn highlight_card(
        &self,
        actor: &Actor,
        source: &str,
        id: &str,
        date: &str,
        now: Instant,
    ) -> Result<NoteFile> {
        self.apply(actor, "highlight_card", false, now.millis, |vault| {
            check_source(vault, source)?;
            let missing = || Error::Invalid(format!("No highlight {id} in this source"));
            let mut sidecar = read_sidecar(vault, source)?.ok_or_else(missing)?;
            let h = sidecar
                .highlights()
                .into_iter()
                .find(|h| h.id == id)
                .ok_or_else(missing)?;
            if let Some(card) = match &h.card_id {
                Some(card_id) => self.index().by_id(card_id)?,
                None => None,
            } {
                return Ok(Change {
                    message: String::new(),
                    paths: vec![],
                    value: vault.read(&card)?,
                });
            }
            let new = NewNote {
                kind: Kind::Highlight,
                title: card_title(&h.text),
                date: date.to_owned(),
                project: None,
                parent: None,
                template: None,
                icon: None,
            };
            let created = ops::create_note(vault, &new, now)?;
            let path = created.meta.path.clone();
            let parts = split(&created.text);
            let eol = eol_of(&created.text);
            let from = format!(
                "{{file: {}, page: {}, highlight: {id}}}",
                yaml_flow_scalar(source),
                h.page
            );
            let prefix = set_key_raw(parts.prefix, "source", Some(&from), eol);
            let title = sidecar.title().unwrap_or_else(|| stem(source)).to_owned();
            let body = card_body(&h, &title, source, &path, eol);
            write_atomic(&vault.path_of(&path)?, join(&prefix, &body, eol).as_bytes())?;
            let note = vault.read(&path)?;
            let card_id = note
                .meta
                .id
                .clone()
                .ok_or_else(|| Error::Invalid("The new card has no id".into()))?;
            sidecar.set_card(id, &card_id)?;
            let car = write_sidecar(vault, source, &sidecar)?;
            Ok(Change {
                message: format!("create: {}", note.meta.title),
                paths: vec![path, car],
                value: note,
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_stay_plain_text() {
        assert_eq!(quoted("# Results\nshow"), "\\# Results show");
        assert_eq!(quoted("1. First"), "\\1. First");
        assert_eq!(quoted("2026 was a year."), "2026 was a year.");
        assert_eq!(quoted("See [[Other]]"), "See \\[[Other]]");
    }

    #[test]
    fn titles_leave_out_link_characters() {
        assert_eq!(
            card_title("[1] Vaswani | et al. #ml"),
            "1 Vaswani et al. ml"
        );
        assert_eq!(card_title("[]|#"), "Highlight");
    }
}
