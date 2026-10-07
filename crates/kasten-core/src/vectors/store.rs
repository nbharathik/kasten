//! The vectors' file, `.kasten/cache/vectors.sqlite`: one row per model and
//! note. The vectors of the model last searched are kept in memory, in one
//! flat block, so a search is a pass of multiply-adds.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use rusqlite::{Connection, params};

use crate::error::{Error, Result};

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS vectors (
  model TEXT NOT NULL,
  path TEXT NOT NULL,
  stamp TEXT NOT NULL,
  hash TEXT NOT NULL,
  vec BLOB NOT NULL,
  PRIMARY KEY (model, path)
);";

/// One model's vectors, unit length, one after the other.
struct Loaded {
    model: String,
    dims: usize,
    paths: Vec<String>,
    data: Vec<f32>,
}

#[derive(Default)]
struct Inner {
    conn: Option<Connection>,
    loaded: Option<Loaded>,
}

pub(crate) struct Vectors {
    path: PathBuf,
    inner: Mutex<Inner>,
}

/// A vector made unit length; an error for one that is empty, all zeros or
/// not numbers.
pub(crate) fn unit(vector: &[f32]) -> Result<Vec<f32>> {
    if vector.is_empty() || vector.iter().any(|x| !x.is_finite()) {
        return Err(Error::Invalid(
            "Not a vector: it is empty or holds a value that is not a number".into(),
        ));
    }
    let length = vector.iter().map(|x| x * x).sum::<f32>().sqrt();
    if length == 0.0 {
        return Err(Error::Invalid(
            "Not a vector: all its values are zero".into(),
        ));
    }
    Ok(vector.iter().map(|x| x / length).collect())
}

/// The dot product, summed in eight lanes so the compiler can use the
/// processor's vector instructions (a single running sum cannot be
/// reordered, so it cannot).
pub(crate) fn dot(a: &[f32], b: &[f32]) -> f32 {
    let (chunks_a, tail_a) = a.as_chunks::<8>();
    let (chunks_b, tail_b) = b.as_chunks::<8>();
    let mut lanes = [0.0f32; 8];
    for (x, y) in chunks_a.iter().zip(chunks_b) {
        for ((lane, x), y) in lanes.iter_mut().zip(x).zip(y) {
            *lane += x * y;
        }
    }
    let tail: f32 = tail_a.iter().zip(tail_b).map(|(x, y)| x * y).sum();
    lanes.iter().sum::<f32>() + tail
}

fn bytes(vector: &[f32]) -> Vec<u8> {
    vector.iter().flat_map(|x| x.to_le_bytes()).collect()
}

fn floats(bytes: &[u8]) -> Vec<f32> {
    bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|b| f32::from_le_bytes(*b))
        .collect()
}

fn open(path: &Path) -> Result<Connection> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.busy_timeout(std::time::Duration::from_secs(10))?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}

impl Vectors {
    pub(crate) fn new(path: PathBuf) -> Vectors {
        Vectors {
            path,
            inner: Mutex::new(Inner::default()),
        }
    }

    fn inner(&self) -> Result<MutexGuard<'_, Inner>> {
        let mut inner = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        if inner.conn.is_none() {
            let conn = match open(&self.path) {
                Ok(conn) => conn,
                Err(_) => {
                    // A broken cache is only a cache: start it again.
                    let _ = std::fs::remove_file(&self.path);
                    open(&self.path)?
                }
            };
            inner.conn = Some(conn);
        }
        Ok(inner)
    }

    /// Each note's stamp and words' hash for `model`, by path.
    pub(crate) fn stamps(&self, model: &str) -> Result<HashMap<String, (String, String)>> {
        let inner = self.inner()?;
        let conn = inner.conn.as_ref().expect("opened");
        let mut stmt =
            conn.prepare_cached("SELECT path, stamp, hash FROM vectors WHERE model = ?1")?;
        let rows = stmt.query_map([model], |r| Ok((r.get(0)?, (r.get(1)?, r.get(2)?))))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Notes whose words are unchanged since their vector: a new stamp only.
    pub(crate) fn restamp(&self, model: &str, stamps: &[(String, String)]) -> Result<()> {
        if stamps.is_empty() {
            return Ok(());
        }
        let mut inner = self.inner()?;
        let tx = inner.conn.as_mut().expect("opened").transaction()?;
        for (path, stamp) in stamps {
            tx.execute(
                "UPDATE vectors SET stamp = ?3 WHERE model = ?1 AND path = ?2",
                params![model, path, stamp],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Forgets the vectors of notes that are gone.
    pub(crate) fn forget(&self, model: &str, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }
        let mut inner = self.inner()?;
        let tx = inner.conn.as_mut().expect("opened").transaction()?;
        for path in paths {
            tx.execute(
                "DELETE FROM vectors WHERE model = ?1 AND path = ?2",
                params![model, path],
            )?;
        }
        tx.commit()?;
        if inner.loaded.as_ref().is_some_and(|l| l.model == model) {
            inner.loaded = None;
        }
        Ok(())
    }

    /// Keeps unit vectors: (path, stamp, hash, vector).
    pub(crate) fn keep(&self, model: &str, rows: &[(&str, &str, &str, Vec<f32>)]) -> Result<()> {
        let mut inner = self.inner()?;
        let tx = inner.conn.as_mut().expect("opened").transaction()?;
        for (path, stamp, hash, vector) in rows {
            tx.execute(
                "INSERT INTO vectors (model, path, stamp, hash, vec) VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(model, path) DO UPDATE SET stamp = ?3, hash = ?4, vec = ?5",
                params![model, path, stamp, hash, bytes(vector)],
            )?;
        }
        tx.commit()?;
        if inner.loaded.as_ref().is_some_and(|l| l.model == model) {
            inner.loaded = None;
        }
        Ok(())
    }

    /// The paths whose vectors are nearest the unit vector `query`, the
    /// nearest first, at most `limit`, with their cosine similarity.
    pub(crate) fn nearest(
        &self,
        model: &str,
        query: &[f32],
        limit: usize,
    ) -> Result<Vec<(String, f32)>> {
        let mut inner = self.inner()?;
        if inner.loaded.as_ref().is_none_or(|l| l.model != model) {
            let conn = inner.conn.as_ref().expect("opened");
            let mut stmt =
                conn.prepare("SELECT path, vec FROM vectors WHERE model = ?1 ORDER BY path")?;
            let mut loaded = Loaded {
                model: model.to_owned(),
                dims: 0,
                paths: Vec::new(),
                data: Vec::new(),
            };
            let mut rows = stmt.query([model])?;
            while let Some(row) = rows.next()? {
                let vector = floats(&row.get::<_, Vec<u8>>(1)?);
                if loaded.dims == 0 {
                    loaded.dims = vector.len();
                }
                // One model gives one size; anything else is left out.
                if vector.len() != loaded.dims {
                    continue;
                }
                loaded.paths.push(row.get(0)?);
                loaded.data.extend_from_slice(&vector);
            }
            drop(rows);
            drop(stmt);
            inner.loaded = Some(loaded);
        }
        let loaded = inner.loaded.as_ref().expect("loaded");
        if loaded.dims != query.len() || loaded.paths.is_empty() || limit == 0 {
            return Ok(Vec::new());
        }
        let mut scored: Vec<(usize, f32)> = loaded
            .data
            .chunks_exact(loaded.dims)
            .map(|v| dot(v, query))
            .enumerate()
            .collect();
        let keep = limit.min(scored.len());
        if keep < scored.len() {
            scored.select_nth_unstable_by(keep - 1, |a, b| b.1.total_cmp(&a.1));
            scored.truncate(keep);
        }
        scored.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
        Ok(scored
            .into_iter()
            .map(|(i, score)| (loaded.paths[i].clone(), score))
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dots_in_lanes_as_one_sum_would() {
        let a: Vec<f32> = (0..21).map(|i| i as f32 * 0.5 - 3.0).collect();
        let b: Vec<f32> = (0..21).map(|i| 1.0 - i as f32 * 0.25).collect();
        let plain: f32 = a.iter().zip(&b).map(|(x, y)| x * y).sum();
        assert!((dot(&a, &b) - plain).abs() < 1e-4);
        assert_eq!(dot(&[], &[]), 0.0);
        assert_eq!(dot(&[2.0, 3.0], &[4.0, 5.0]), 23.0);
    }
}
