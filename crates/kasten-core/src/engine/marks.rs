//! Agent marks through the engine: a note's
//! history is blamed from HEAD back, and its marks as committed are cached
//! in the index with the commit they hold for. The next walk stops at that
//! commit, so marks carry on however far back they were written. Typing not
//! yet committed is laid over them on every read.

use std::collections::HashSet;
use std::fs;

use git2::{ObjectType, Oid};

use super::Kasten;
use crate::error::{Error, Result};
use crate::frontmatter::split;
use crate::history::{Actor, End, History, Want};
use crate::index::MarksRow;
use crate::marks::{AgentMark, Blame, Stamp, carry};
use crate::time::Instant;

/// How many commits back a note is blamed when nothing is cached for it.
const LOOK_BACK: usize = 20_000;
/// How many changes to one note are blamed; lines older than that are
/// unmarked.
const MAX_CHANGES: usize = 300;

/// A note's marks as committed, and its blob they are for.
struct Committed {
    marks: Vec<AgentMark>,
    blob: Option<Oid>,
}

const NONE: Committed = Committed {
    marks: Vec::new(),
    blob: None,
};

impl Kasten {
    /// The lines of a note an agent wrote and no person has edited or
    /// accepted since, in runs of one commit. Lines count from 0 in the
    /// body. Nothing is written anywhere but the index's cache.
    pub fn agent_marks(&self, path: &str) -> Result<Vec<AgentMark>> {
        let text = self.note_text(path)?;
        let Some(history) = self.history.get() else {
            return Ok(Vec::new());
        };
        let committed = self.committed(history, &[path.to_owned()])?.remove(0);
        on_disk(history, &committed, &text)
    }

    /// Which of `paths` are notes with agent marks, in the order asked:
    /// for badges on board cards and library rows. Paths that are not
    /// notes are left out.
    pub fn agent_marked(&self, paths: &[String]) -> Result<Vec<String>> {
        let Some(history) = self.history.get() else {
            return Ok(Vec::new());
        };
        let mut seen = HashSet::new();
        let notes: Vec<String> = paths
            .iter()
            .filter(|p| self.vault.is_note_path(p) && seen.insert(p.as_str()))
            .cloned()
            .collect();
        let committed = self.committed(history, &notes)?;
        let mut out = Vec::new();
        for (path, committed) in notes.iter().zip(&committed) {
            // Typing only ever takes marks away.
            if committed.marks.is_empty() {
                continue;
            }
            let Ok(text) = self.note_text(path) else {
                continue;
            };
            if !on_disk(history, committed, &text)?.is_empty() {
                out.push(path.clone());
            }
        }
        Ok(out)
    }

    /// A person accepts the agent's lines in a note as they stand: an empty
    /// commit records it, and they are no longer marked. Later agent writing
    /// is marked again. Does nothing when nothing is marked.
    pub fn accept_agent_marks(&self, actor: &Actor, path: &str, now: Instant) -> Result<()> {
        if actor.is_agent() {
            return Err(Error::Invalid(
                "Only a person can accept an agent's writing".to_owned(),
            ));
        }
        let Some(history) = self.history.get() else {
            return Ok(());
        };
        if self.agent_marks(path)?.is_empty() {
            return Ok(());
        }
        let title = self.vault.read(path)?.meta.title;
        self.lock
            .hold(|| history.accept_marker(&format!("accept: {title}"), actor, path))?;
        self.index().forget_marks(Some(path))?;
        self.state().last_commit = Some(now.millis);
        Ok(())
    }

    /// Empties the marks cache, so the next read walks history afresh.
    #[doc(hidden)]
    pub fn forget_agent_marks(&self) -> Result<()> {
        self.index().forget_marks(None)
    }

    fn note_text(&self, path: &str) -> Result<String> {
        let file = self.vault.path_of(path)?;
        fs::read_to_string(file).map_err(|err| match err.kind() {
            std::io::ErrorKind::NotFound => Error::NotFound(path.to_owned()),
            _ => Error::Io(err),
        })
    }

    /// The notes' marks as committed at HEAD, from the cache where it holds
    /// for HEAD, else by walking back to the commit it holds for (or from
    /// scratch), keeping the answers. `paths` must not repeat.
    fn committed(&self, history: &History, paths: &[String]) -> Result<Vec<Committed>> {
        let rows = self.index().marks_rows(paths)?;
        let head = history.head();
        let mut out: Vec<Committed> = Vec::with_capacity(paths.len());
        let mut stale: Vec<usize> = Vec::new();
        for (i, path) in paths.iter().enumerate() {
            match rows.get(path) {
                Some(row) if head.as_deref() == Some(row.head.as_str()) => out.push(Committed {
                    marks: row.marks.clone(),
                    blob: Oid::from_str(&row.blob).ok(),
                }),
                _ => {
                    out.push(NONE);
                    stale.push(i);
                }
            }
        }
        if stale.is_empty() {
            return Ok(out);
        }
        let wants: Vec<Want> = stale
            .iter()
            .map(|&i| Want {
                path: &paths[i],
                known: rows.get(&paths[i]).map(|r| r.head.as_str()),
            })
            .collect();
        let Some(walk) = history.trails(&wants, LOOK_BACK, MAX_CHANGES)? else {
            return Ok(out);
        };
        let mut keep: Vec<(String, MarksRow)> = Vec::new();
        for (&i, trail) in stale.iter().zip(&walk.trails) {
            let Some(blob) = trail.head else { continue };
            let row = rows.get(&paths[i]);
            let known = match (trail.end, row) {
                (End::Known, Some(row)) => Some(row.marks.as_slice()),
                _ => None,
            };
            let agents = trail.steps.iter().any(|s| s.commit.agent);
            let marks = if let (Some(known), true) = (known, trail.steps.is_empty()) {
                // Nothing changed the note since the cached commit.
                known.to_vec()
            } else if !agents && known.is_none_or(<[AgentMark]>::is_empty) {
                Vec::new()
            } else {
                let mut blame = Blame::new(split(&history.blob_text(blob)?).body);
                for step in &trail.steps {
                    if blame.done() {
                        break;
                    }
                    let before = step.before.map(|b| history.blob_text(b)).transpose()?;
                    let stamp = step.commit.agent.then(|| Stamp {
                        session: step.commit.session.clone().unwrap_or_default(),
                        client: step
                            .commit
                            .author
                            .strip_prefix("agent:")
                            .unwrap_or(&step.commit.author)
                            .to_owned(),
                        commit: step.commit.id.clone(),
                        time: step.commit.time,
                    });
                    blame.step(stamp, before.as_deref().map(|t| split(t).body));
                }
                if let Some(known) = known {
                    blame.known(known);
                }
                blame.marks()
            };
            keep.push((
                paths[i].clone(),
                MarksRow {
                    head: walk.head.clone(),
                    blob: blob.to_string(),
                    marks: marks.clone(),
                },
            ));
            out[i] = Committed {
                marks,
                blob: Some(blob),
            };
        }
        self.index().store_marks(&keep)?;
        Ok(out)
    }
}

/// Committed marks laid over the note as it is on disk.
fn on_disk(history: &History, committed: &Committed, text: &str) -> Result<Vec<AgentMark>> {
    let Some(blob) = committed.blob.filter(|_| !committed.marks.is_empty()) else {
        return Ok(Vec::new());
    };
    if Oid::hash_object(ObjectType::Blob, text.as_bytes())? == blob {
        return Ok(committed.marks.clone());
    }
    let then = history.blob_text(blob)?;
    Ok(carry(&committed.marks, split(&then).body, split(text).body))
}
