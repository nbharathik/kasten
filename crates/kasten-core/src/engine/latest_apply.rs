//! Writing what Get latest brings into the vault's folder, file by file,
//! rather than through git's checkout:
//!
//! - Every file is looked at first. If one is in the way (changed since
//!   the last commit, or a file history doesn't know, such as one git
//!   ignores), nothing is written.
//! - Each file is then written atomically. A file that already holds what
//!   it should counts as done, so a Get latest stopped part way picks up
//!   where it stopped.
//! - Files the other side removed go last, and only while they still hold
//!   what history does.
//! - Git's index follows, so the next commit builds on what came in.

use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use super::Kasten;
use crate::atomic::write_atomic;
use crate::error::{Error, Result};
use crate::history::{History, blob_id, local_only};

/// Why the files could not all be written.
pub(super) enum Stopped {
    /// A file was in the way: nothing was written.
    InTheWay(Error),
    /// Writing failed part way: some files hold the new version.
    PartWay(Error),
}

/// One file to write, or to remove when `keep` is false.
struct Step {
    path: String,
    keep: bool,
}

fn in_the_way(path: &str, known: bool) -> Error {
    Error::Invalid(if known {
        format!(
            "{path} changed since the last commit, so getting the latest wrote nothing. Try again in a moment"
        )
    } else {
        format!(
            "{path} is in the way: this vault's history doesn't know that file, so getting the latest wrote nothing. Move it elsewhere, then try again"
        )
    })
}

/// The id of what the folder holds at `file`, or None when it holds
/// nothing there. Anything but a plain file is in the way.
fn held_at(file: &Path, path: &str, known: bool) -> Result<Option<String>> {
    match fs::symlink_metadata(file) {
        Err(err) if matches!(err.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory) => {
            Ok(None)
        }
        Err(err) => Err(err.into()),
        Ok(meta) if meta.is_file() => Ok(Some(blob_id(&fs::read(file)?)?)),
        Ok(_) => Err(in_the_way(path, known)),
    }
}

/// Whether `inner` lies inside the folder `outer`.
fn inside(inner: &str, outer: &str) -> bool {
    inner.len() > outer.len() && inner.starts_with(outer) && inner.as_bytes()[outer.len()] == b'/'
}

impl Kasten {
    /// Makes the folder hold `to` where it held `from`, as above.
    pub(super) fn apply_latest(
        &self,
        history: &History,
        from: &str,
        to: &str,
    ) -> std::result::Result<(), Stopped> {
        let changed = history
            .changed_between(from, to)
            .map_err(Stopped::InTheWay)?;
        let steps = self
            .plan(history, from, to, &changed)
            .map_err(Stopped::InTheWay)?;
        self.write_steps(history, to, &steps)
            .map_err(Stopped::PartWay)?;
        let index: Vec<(String, bool)> = steps.iter().map(|s| (s.path.clone(), s.keep)).collect();
        history.index_paths(&index).map_err(Stopped::PartWay)
    }

    /// Every changed file, and whether it is written or removed. Files
    /// already as they should be are kept in the list, for the index.
    fn plan(
        &self,
        history: &History,
        from: &str,
        to: &str,
        changed: &[String],
    ) -> Result<Vec<Step>> {
        let mut steps = Vec::new();
        for path in changed.iter().filter(|p| !local_only(p)) {
            let file = self.vault.tracked_file(path)?;
            let want = history.blob_id_at(to, path)?;
            let was = history.blob_id_at(from, path)?;
            let now = held_at(&file, path, was.is_some())?;
            if now != want && now != was {
                return Err(in_the_way(path, was.is_some()));
            }
            steps.push(Step {
                path: path.clone(),
                keep: want.is_some(),
            });
        }
        // Where `a.md` and `A.md` are one file, a note renamed by case
        // leaves nothing to remove: its file is the new one.
        if history.ignores_case() {
            let kept: HashSet<String> = steps
                .iter()
                .filter(|s| s.keep)
                .map(|s| s.path.to_lowercase())
                .collect();
            steps.retain(|s| s.keep || !kept.contains(&s.path.to_lowercase()));
        }
        Ok(steps)
    }

    fn write_steps(&self, history: &History, to: &str, steps: &[Step]) -> Result<()> {
        let (writes, removals): (Vec<&Step>, Vec<&Step>) = steps.iter().partition(|s| s.keep);
        // A removal where a written file's folder goes, or inside where a
        // file goes, comes first; the rest come last.
        let (early, late): (Vec<&Step>, Vec<&Step>) = removals.into_iter().partition(|r| {
            writes
                .iter()
                .any(|w| inside(&w.path, &r.path) || inside(&r.path, &w.path))
        });
        for step in early {
            self.remove_latest(history, to, &step.path)?;
        }
        for (done, step) in writes.into_iter().enumerate() {
            let file = self.vault.tracked_file(&step.path)?;
            let bytes = history
                .blob_in_tree(to, &step.path)?
                .ok_or_else(|| Error::Git(format!("{} is missing from the latest", step.path)))?;
            if fs::read(&file).is_ok_and(|now| now == bytes) {
                continue;
            }
            self.may_fail_write(done)?;
            if let Some(dir) = file.parent() {
                fs::create_dir_all(dir)?;
            }
            write_atomic(&file, &bytes)?;
        }
        for step in late {
            self.remove_latest(history, to, &step.path)?;
        }
        Ok(())
    }

    /// Removes a file the other side removed, with any folder it leaves
    /// empty, as git's checkout does.
    fn remove_latest(&self, history: &History, to: &str, path: &str) -> Result<()> {
        let file = self.vault.tracked_file(path)?;
        if history.blob_id_at(to, path)?.is_some() {
            return Ok(());
        }
        match fs::remove_file(&file) {
            Ok(()) => {}
            Err(err) if err.kind() == ErrorKind::NotFound => {}
            Err(err) => return Err(err.into()),
        }
        let root = self.root();
        let mut dir = file.parent();
        while let Some(at) = dir {
            if at == root || fs::remove_dir(at).is_err() {
                break;
            }
            dir = at.parent();
        }
        Ok(())
    }

    fn may_fail_write(&self, done: usize) -> Result<()> {
        let mut state = self.state();
        if state.fail_writes_after.is_some_and(|n| done >= n) {
            state.fail_writes_after = None;
            return Err(
                std::io::Error::new(ErrorKind::StorageFull, "No space left on the disk").into(),
            );
        }
        Ok(())
    }

    /// Makes the next Get latest fail after writing `files` files, as a
    /// full disk would: for testing that it finishes later.
    #[doc(hidden)]
    pub fn fail_get_latest_writes_after(&self, files: usize) {
        self.state().fail_writes_after = Some(files);
    }
}
