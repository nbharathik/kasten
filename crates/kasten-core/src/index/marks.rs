//! The agent marks cache: each note's marks as committed, with the commit
//! they hold for and the note's blob there. A newer HEAD does not make a
//! row wrong; the engine walks back to the row's commit and carries it on.

use std::collections::{HashMap, HashSet};

use rusqlite::params;

use super::Index;
use crate::error::Result;
use crate::marks::AgentMark;

/// One note's cached marks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MarksRow {
    /// The commit the marks hold for.
    pub head: String,
    /// The note's blob at that commit.
    pub blob: String,
    pub marks: Vec<AgentMark>,
}

/// Past this many paths, reading every row beats one query per path.
const ONE_BY_ONE: usize = 64;

impl Index {
    /// The cached rows for `paths`, by path.
    pub(crate) fn marks_rows(&self, paths: &[String]) -> Result<HashMap<String, MarksRow>> {
        let row = |r: &rusqlite::Row| -> rusqlite::Result<(String, MarksRow)> {
            let marks: String = r.get(3)?;
            Ok((
                r.get(0)?,
                MarksRow {
                    head: r.get(1)?,
                    blob: r.get(2)?,
                    marks: serde_json::from_str(&marks).unwrap_or_default(),
                },
            ))
        };
        let mut out = HashMap::new();
        if paths.len() > ONE_BY_ONE {
            let wanted: HashSet<&str> = paths.iter().map(String::as_str).collect();
            let mut stmt = self
                .conn
                .prepare_cached("SELECT path, head, blob, marks FROM agent_marks")?;
            for found in stmt.query_map([], row)? {
                let (path, cached) = found?;
                if wanted.contains(path.as_str()) {
                    out.insert(path, cached);
                }
            }
            return Ok(out);
        }
        let mut stmt = self
            .conn
            .prepare_cached("SELECT path, head, blob, marks FROM agent_marks WHERE path = ?1")?;
        for path in paths {
            if let Some(found) = stmt.query_map([path], row)?.next() {
                let (path, cached) = found?;
                out.insert(path, cached);
            }
        }
        Ok(out)
    }

    /// Keeps these rows, replacing any for the same paths.
    pub(crate) fn store_marks(&mut self, rows: &[(String, MarksRow)]) -> Result<()> {
        if rows.is_empty() {
            return Ok(());
        }
        let tx = self.conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR REPLACE INTO agent_marks (path, head, blob, marks) VALUES (?1, ?2, ?3, ?4)",
            )?;
            for (path, row) in rows {
                let marks = serde_json::to_string(&row.marks).unwrap_or_else(|_| "[]".into());
                stmt.execute(params![path, row.head, row.blob, marks])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Forgets one note's row, or with None every row.
    pub(crate) fn forget_marks(&self, path: Option<&str>) -> Result<()> {
        match path {
            Some(path) => self
                .conn
                .execute("DELETE FROM agent_marks WHERE path = ?1", [path])?,
            None => self.conn.execute("DELETE FROM agent_marks", [])?,
        };
        Ok(())
    }
}
