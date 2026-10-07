//! Emptying the trash, which only a person can do, in a vault that keeps
//! history. Everything waiting is committed first; then each file in the
//! trash whose bytes are exactly what history holds leaves the folder, in
//! one commit that `undo_commit` takes back. A file history does not hold
//! as it is stays, and a link is never followed.

use std::fs;
use std::path::Path;

use serde::Serialize;

use super::{Change, Kasten};
use crate::error::{Error, Result};
use crate::history::{Actor, History};
use crate::time::Instant;

/// What emptying the trash did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Emptied {
    /// How many files left the trash.
    pub removed: usize,
    /// Files left in the trash because history does not hold them as they
    /// are, so removing them would lose them.
    pub kept: Vec<String>,
    /// The commit, which undo takes back.
    pub commit: Option<String>,
}

/// Every file under `dir`, vault-relative, without following links; the
/// links themselves go to `skipped`.
fn files(dir: &Path, rel: &str, found: &mut Vec<String>, skipped: &mut Vec<String>) -> Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = format!("{rel}/{}", entry.file_name().to_string_lossy());
        let kind = fs::symlink_metadata(entry.path())?.file_type();
        if kind.is_symlink() {
            skipped.push(path);
        } else if kind.is_dir() {
            files(&entry.path(), &path, found, skipped)?;
        } else if kind.is_file() {
            found.push(path);
        }
    }
    Ok(())
}

/// Removes the folders under `dir` left empty, deepest first; `dir` stays.
fn prune(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if fs::symlink_metadata(&path).is_ok_and(|m| m.is_dir()) {
            prune(&path);
            // remove_dir removes only an empty folder.
            let _ = fs::remove_dir(&path);
        }
    }
}

impl Kasten {
    /// Empties the trash. Only a person can, and only where history keeps
    /// what goes, so undo brings it all back.
    pub fn empty_trash(&self, actor: &Actor, now: Instant) -> Result<Emptied> {
        if actor.is_agent() {
            return Err(Error::Invalid(
                "Only you can empty the trash; an agent can't".into(),
            ));
        }
        let history: &History = self.history.get().ok_or_else(|| {
            Error::Invalid(
                "This vault keeps no history, so emptying the trash would lose its files for good. Start history first".into(),
            )
        })?;
        // Everything waiting goes into history first, the trash included.
        self.commit_edits()?;
        self.commit_external()?;
        let (mut emptied, commit) =
            self.apply_committing(actor, "empty_trash", false, now.millis, &[], |vault| {
                let trash = vault.root().join(".trash");
                let (mut found, mut kept) = (Vec::new(), Vec::new());
                if trash.is_dir() {
                    files(&trash, ".trash", &mut found, &mut kept)?;
                }
                let mut removed = Vec::new();
                for path in found {
                    let file = vault.root().join(&path);
                    let held = history.blob_at("HEAD", &path)?;
                    if held.is_some() && held == fs::read(&file).ok() {
                        // History holds these very bytes; undo writes them back.
                        fs::remove_file(&file)?;
                        removed.push(path);
                    } else {
                        kept.push(path);
                    }
                }
                prune(&trash);
                Ok(Change {
                    message: format!("trash: emptied {}", removed.len()),
                    value: Emptied {
                        removed: removed.len(),
                        kept,
                        commit: None,
                    },
                    paths: removed,
                })
            })?;
        emptied.commit = commit;
        Ok(emptied)
    }
}
