//! Related notes: a note's most telling words, the ones it uses often and
//! few other notes use, looked up in the full-text index. It finds notes
//! about the same things, linked or not, with no model and no network.

use std::collections::{HashMap, HashSet};

use rusqlite::OptionalExtension;
use serde::Serialize;

use super::Index;
use crate::error::{Error, Result};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Related {
    pub path: String,
    pub title: String,
    pub icon: Option<String>,
    /// Up to three words both notes use, the most telling first.
    pub shared: Vec<String>,
    /// One links to the other already.
    pub linked: bool,
}

/// Words too common to tell notes apart, even where few notes use them.
const STOP: &[&str] = &[
    "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "had", "her", "was",
    "one", "our", "out", "get", "has", "him", "his", "how", "new", "now", "see", "two", "way",
    "who", "did", "its", "let", "put", "say", "she", "too", "use", "that", "with", "have", "this",
    "will", "your", "from", "they", "know", "want", "been", "good", "much", "some", "time", "very",
    "when", "come", "here", "just", "like", "make", "many", "more", "only", "over", "such", "take",
    "than", "them", "well", "were", "what", "then", "there", "their", "which", "would", "about",
    "could", "other", "these", "into", "also", "each", "does", "every", "where", "while", "after",
    "again", "being", "those", "should", "because", "before", "through", "still", "might", "must",
    "same", "most", "per", "back", "via", "etc", "yet", "may", "own", "off", "why", "yes", "even",
    "ever", "able", "though", "onto", "upon", "don", "doesn", "didn", "isn", "wasn", "aren", "won",
    "haven", "couldn", "wouldn", "shouldn",
];

/// Most words weighed: the note's most used, title words counting three times.
const CANDIDATES: usize = 32;
/// Notes looked at more closely, at least.
const SHORTLIST: usize = 40;
/// Notes longer than this share words by chance more than by subject.
const USUAL_WORDS: f64 = 300.0;
/// Telling words two notes must share to be similar.
const MIN_SHARED: usize = 2;

/// A word as the index keeps it: accents off the common Latin letters.
fn fold(word: &str) -> String {
    word.chars()
        .map(|c| match c {
            'à' | 'á' | 'â' | 'ä' | 'ã' | 'å' | 'ā' => 'a',
            'è' | 'é' | 'ê' | 'ë' | 'ē' => 'e',
            'ì' | 'í' | 'î' | 'ï' | 'ī' => 'i',
            'ò' | 'ó' | 'ô' | 'ö' | 'õ' | 'ø' | 'ō' => 'o',
            'ù' | 'ú' | 'û' | 'ü' | 'ū' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            'ý' | 'ÿ' => 'y',
            c => c,
        })
        .collect()
}

/// Each word of three letters or more, how often it comes.
fn words(text: &str, weight: usize, into: &mut HashMap<String, usize>) {
    for word in text.split(|c: char| !c.is_alphanumeric()) {
        let word = fold(&word.to_lowercase());
        if word.chars().count() < 3
            || word.chars().all(|c| c.is_ascii_digit())
            || STOP.contains(&word.as_str())
        {
            continue;
        }
        *into.entry(word).or_insert(0) += weight;
    }
}

/// A word the note uses, and the other notes that use it.
struct Term {
    word: String,
    weight: f64,
    /// In rowid order.
    notes: Vec<i64>,
}

impl Index {
    /// Up to `limit` notes about what the note at `path` is about, the most
    /// alike first.
    ///
    /// Each of the note's most used words is looked up once, and a word in
    /// more than one note in twenty is let go: it tells little and costs the
    /// most to follow. A note scores the words it shares, each weighed by how
    /// much the first note uses it and how few notes do; notes much longer
    /// than usual score a little less, as they share words by chance.
    pub fn related(&self, path: &str, limit: usize) -> Result<Vec<Related>> {
        let (num, key): (i64, String) = self
            .conn
            .query_row(
                "SELECT num, title_key FROM notes WHERE path = ?1",
                [path],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?
            .ok_or_else(|| Error::NotFound(path.to_owned()))?;
        if limit == 0 {
            return Ok(Vec::new());
        }
        let (title, body): (String, String) =
            self.conn
                .query_row("SELECT title, body FROM fts WHERE rowid = ?1", [num], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })?;
        let mut counts = HashMap::new();
        words(&body, 1, &mut counts);
        words(&title, 3, &mut counts);
        let mut candidates: Vec<(String, usize)> = counts.into_iter().collect();
        // Among words used as often, longer ones tend to be rarer.
        candidates.sort_by(|a, b| {
            b.1.cmp(&a.1)
                .then_with(|| b.0.len().cmp(&a.0.len()))
                .then_with(|| a.0.cmp(&b.0))
        });
        candidates.truncate(CANDIDATES);

        let total = self
            .conn
            .query_row("SELECT count(*) FROM notes", [], |r| r.get::<_, i64>(0))?;
        let common = (total / 20).max(25);
        let mut using = self
            .conn
            .prepare_cached("SELECT rowid FROM fts WHERE fts MATCH ?1 LIMIT ?2")?;
        let mut terms = Vec::new();
        let mut scores: HashMap<i64, f64> = HashMap::new();
        for (word, uses) in candidates {
            let notes: Vec<i64> = using
                .query_map(rusqlite::params![format!("\"{word}\""), common + 1], |r| {
                    r.get(0)
                })?
                .collect::<std::result::Result<_, _>>()?;
            // Only this note, or too many to tell apart.
            if notes.len() < 2 || notes.len() as i64 > common {
                continue;
            }
            let rarity = (total as f64 / notes.len() as f64).ln();
            let weight = (1.0 + (uses as f64).ln()) * rarity;
            if weight <= 0.0 {
                continue;
            }
            for &other in &notes {
                if other != num {
                    *scores.entry(other).or_insert(0.0) += weight;
                }
            }
            terms.push(Term {
                word,
                weight,
                notes,
            });
        }
        let mut ranked: Vec<(i64, f64)> = scores.into_iter().collect();
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        ranked.truncate(SHORTLIST.max(limit.saturating_mul(4)));
        terms.sort_by(|a, b| b.weight.total_cmp(&a.weight));

        let links_to: HashSet<String> = self
            .conn
            .prepare_cached("SELECT target FROM links WHERE num = ?1")?
            .query_map([num], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?;
        let linked_from: HashSet<i64> = self
            .conn
            .prepare_cached("SELECT num FROM links WHERE target = ?1")?
            .query_map([&key], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?;
        let mut note = self.conn.prepare_cached(
            "SELECT path, title, icon, title_key, words FROM notes
             WHERE num = ?1 AND kind != 'template'",
        )?;
        let mut found = Vec::new();
        for (other, score) in ranked {
            let row = note
                .query_row([other], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, i64>(4)?,
                    ))
                })
                .optional()?;
            let Some((path, title, icon, title_key, length)) = row else {
                continue;
            };
            let shared: Vec<String> = terms
                .iter()
                .filter(|t| t.notes.binary_search(&other).is_ok())
                .map(|t| t.word.clone())
                .collect();
            // One word in common is chance, not a subject.
            if shared.len() < MIN_SHARED {
                continue;
            }
            let shared = shared.into_iter().take(3).collect();
            let long = (length as f64 / USUAL_WORDS).max(1.0).sqrt();
            let related = Related {
                path,
                title,
                icon,
                shared,
                linked: links_to.contains(&title_key) || linked_from.contains(&other),
            };
            found.push((score / long, related));
        }
        found.sort_by(|a, b| b.0.total_cmp(&a.0).then_with(|| a.1.title.cmp(&b.1.title)));
        Ok(found.into_iter().take(limit).map(|(_, r)| r).collect())
    }
}
