//! Full-text search: BM25 with
//! titles boosted, prefix matches, and filters such as
//! `tag:paper project:photo-organiser type:card before:2026-10-01 after:2026-09-01`.

use rusqlite::ToSql;

use super::Index;
use super::query::{META_COLUMNS, meta_of};
use crate::error::Result;
use crate::search::Hit;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Filters {
    pub tags: Vec<String>,
    pub project: Option<String>,
    pub kind: Option<String>,
    /// Days, YYYY-MM-DD, compared with the note's own date.
    pub before: Option<String>,
    pub after: Option<String>,
}

/// Splits a query into search words (and "quoted phrases") and filters.
pub fn parse_query(query: &str) -> (Vec<String>, Filters) {
    let mut words = Vec::new();
    let mut filters = Filters::default();
    let mut rest = query.trim();
    while !rest.is_empty() {
        if let Some(after) = rest.strip_prefix('"') {
            let (phrase, tail) = after.split_once('"').unwrap_or((after, ""));
            words.push(phrase.to_owned());
            rest = tail.trim_start();
            continue;
        }
        let (token, tail) = rest.split_once(char::is_whitespace).unwrap_or((rest, ""));
        rest = tail.trim_start();
        let value = |prefix: &str| {
            token
                .strip_prefix(prefix)
                .filter(|v| !v.is_empty())
                .map(str::to_owned)
        };
        if let Some(tag) = value("tag:") {
            filters
                .tags
                .push(tag.trim_start_matches('#').to_lowercase());
        } else if let Some(project) = value("project:") {
            filters.project = Some(project.to_lowercase());
        } else if let Some(kind) = value("type:") {
            filters.kind = Some(kind.to_lowercase());
        } else if let Some(day) = value("before:") {
            filters.before = Some(day);
        } else if let Some(day) = value("after:") {
            filters.after = Some(day);
        } else if let Some(tag) = token.strip_prefix('#').filter(|t| !t.is_empty()) {
            filters.tags.push(tag.to_lowercase());
        } else {
            words.push(token.to_owned());
        }
    }
    (words, filters)
}

/// The words as an FTS5 query: each a quoted prefix match, all required.
fn match_expression(words: &[String]) -> Option<String> {
    let parts: Vec<String> = words
        .iter()
        .map(|w| {
            w.split(|c: char| !c.is_alphanumeric())
                .filter(|t| !t.is_empty())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .filter(|w| !w.is_empty())
        .map(|w| format!("\"{w}\"*"))
        .collect();
    (!parts.is_empty()).then(|| parts.join(" "))
}

fn filter_sql(filters: &Filters, params: &mut Vec<Box<dyn ToSql>>) -> String {
    let mut sql = String::new();
    for tag in &filters.tags {
        params.push(Box::new(tag.clone()));
        sql.push_str(&format!(
            " AND n.num IN (SELECT num FROM tags WHERE tag = ?{})",
            params.len()
        ));
    }
    if let Some(project) = &filters.project {
        params.push(Box::new(project.clone()));
        sql.push_str(&format!(" AND lower(n.project) = ?{}", params.len()));
    }
    match &filters.kind {
        Some(kind) => {
            params.push(Box::new(kind.clone()));
            sql.push_str(&format!(" AND n.kind = ?{}", params.len()));
        }
        None => sql.push_str(" AND n.kind != 'template'"),
    }
    if let Some(day) = &filters.before {
        params.push(Box::new(day.clone()));
        sql.push_str(&format!(" AND n.day < ?{}", params.len()));
    }
    if let Some(day) = &filters.after {
        params.push(Box::new(day.clone()));
        sql.push_str(&format!(" AND n.day > ?{}", params.len()));
    }
    sql
}

/// The upper bound of a prefix range: `abc` → `abd`, so `title_key >= q
/// AND title_key < upper` finds every title starting with `q` by index.
fn prefix_upper(prefix: &str) -> Option<String> {
    let mut chars: Vec<char> = prefix.chars().collect();
    while let Some(last) = chars.pop() {
        if let Some(next) = char::from_u32(last as u32 + 1) {
            chars.push(next);
            return Some(chars.into_iter().collect());
        }
    }
    None
}

impl Index {
    /// The best matches for `query`, most relevant first: titles equal to
    /// the query, then titles starting with it, then full-text matches by
    /// BM25 with titles weighted ten times the body.
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<Hit>> {
        let (words, filters) = parse_query(query);
        let expression = match_expression(&words);
        if expression.is_none() && filters == Filters::default() {
            return Ok(Vec::new());
        }
        let Some(expression) = expression else {
            return self.filtered(&filters, limit);
        };
        let typed = words.join(" ").trim().to_lowercase();
        let mut hits = self.title_hits(&typed, &filters, limit)?;
        let seen: std::collections::HashSet<String> = hits.iter().map(|h| h.path.clone()).collect();

        let want = limit.saturating_sub(hits.len());
        let found = if filters == Filters::default() {
            self.ranked_fast(&expression, want.saturating_add(seen.len() + 8))?
        } else {
            self.ranked_filtered(&expression, &filters, want.saturating_add(seen.len()))?
        };
        hits.extend(
            found
                .into_iter()
                .filter(|h| !seen.contains(&h.path))
                .take(want),
        );
        let total = hits.len();
        for (i, hit) in hits.iter_mut().enumerate() {
            hit.score = (total - i) as u32;
        }
        Ok(hits)
    }

    /// Notes whose title is, or starts with, what was typed.
    fn title_hits(&self, typed: &str, filters: &Filters, limit: usize) -> Result<Vec<Hit>> {
        let Some(upper) = prefix_upper(typed) else {
            return Ok(Vec::new());
        };
        let mut params: Vec<Box<dyn ToSql>> = vec![Box::new(typed.to_owned()), Box::new(upper)];
        let filter = filter_sql(filters, &mut params);
        params.push(Box::new(limit as i64));
        let sql = format!(
            "SELECT n.path, n.title, n.icon, n.excerpt FROM notes n WHERE n.title_key >= ?1 AND n.title_key < ?2{filter}
             ORDER BY n.title_key = ?1 DESC, length(n.title_key), n.modified DESC LIMIT ?{}",
            params.len()
        );
        let mut stmt = self.conn.prepare_cached(&sql)?;
        let refs: Vec<&dyn ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(refs.as_slice(), |r| {
            Ok(Hit {
                path: r.get(0)?,
                title: r.get(1)?,
                icon: r.get(2)?,
                snippet: r.get(3)?,
                score: 0,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Full-text matches ranked inside FTS5 (`ORDER BY rank` stops after
    /// `limit` rows, so only those get snippets); templates dropped after.
    fn ranked_fast(&self, expression: &str, limit: usize) -> Result<Vec<Hit>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT n.path, n.title, n.icon, f.snip, n.kind FROM
               (SELECT rowid AS num, snippet(fts, 1, '', '', '…', 14) AS snip, rank FROM fts WHERE fts MATCH ?1 ORDER BY rank LIMIT ?2) f
             JOIN notes n ON n.num = f.num ORDER BY f.rank",
        )?;
        let rows = stmt.query_map(rusqlite::params![expression, limit as i64], |r| {
            Ok((
                Hit {
                    path: r.get(0)?,
                    title: r.get(1)?,
                    icon: r.get(2)?,
                    snippet: r.get(3)?,
                    score: 0,
                },
                r.get::<_, String>(4)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (hit, kind) = row?;
            if kind != "template" {
                out.push(hit);
            }
        }
        Ok(out)
    }

    /// Full-text matches that pass filters, ranked by BM25.
    fn ranked_filtered(
        &self,
        expression: &str,
        filters: &Filters,
        limit: usize,
    ) -> Result<Vec<Hit>> {
        let mut params: Vec<Box<dyn ToSql>> = vec![Box::new(expression.to_owned())];
        let filter = filter_sql(filters, &mut params);
        params.push(Box::new(limit as i64));
        let sql = format!(
            "SELECT n.path, n.title, n.icon, snippet(fts, 1, '', '', '…', 14) FROM fts JOIN notes n ON n.num = fts.rowid
             WHERE fts MATCH ?1{filter} ORDER BY bm25(fts, 10.0, 1.0) LIMIT ?{}",
            params.len()
        );
        let mut stmt = self.conn.prepare_cached(&sql)?;
        let refs: Vec<&dyn ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(refs.as_slice(), |r| {
            Ok(Hit {
                path: r.get(0)?,
                title: r.get(1)?,
                icon: r.get(2)?,
                snippet: r.get(3)?,
                score: 0,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Only filters, no words: the newest matching notes.
    fn filtered(&self, filters: &Filters, limit: usize) -> Result<Vec<Hit>> {
        let mut params: Vec<Box<dyn ToSql>> = Vec::new();
        let filter = filter_sql(filters, &mut params);
        params.push(Box::new(limit as i64));
        let sql = format!(
            "SELECT {META_COLUMNS} FROM notes n WHERE 1 = 1{filter} ORDER BY n.modified DESC LIMIT ?{}",
            params.len()
        );
        let mut stmt = self.conn.prepare_cached(&sql)?;
        let refs: Vec<&dyn ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(refs.as_slice(), meta_of)?;
        let metas: Vec<_> = rows.collect::<std::result::Result<_, _>>()?;
        let total = metas.len();
        Ok(metas
            .into_iter()
            .enumerate()
            .map(|(i, m)| Hit {
                path: m.path,
                title: m.title,
                icon: m.icon,
                snippet: m.excerpt,
                score: (total - i) as u32,
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_filters_and_phrases() {
        let (words, filters) = parse_query(
            "tag:Paper #idea project:Photo-Organiser type:card before:2026-10-01 \"old notes\" diff",
        );
        assert_eq!(words, ["old notes", "diff"]);
        assert_eq!(filters.tags, ["paper", "idea"]);
        assert_eq!(filters.project.as_deref(), Some("photo-organiser"));
        assert_eq!(filters.kind.as_deref(), Some("card"));
        assert_eq!(filters.before.as_deref(), Some("2026-10-01"));
        assert_eq!(
            match_expression(&words).as_deref(),
            Some("\"old notes\"* \"diff\"*")
        );
        assert_eq!(match_expression(&["(\"*)".into()]), None);
    }
}
