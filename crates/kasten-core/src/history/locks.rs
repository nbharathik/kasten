//! The lock files git takes in `.git`, and the ones a killed process left.

use std::path::{Path, PathBuf};

use super::History;

/// How long after Kasten's mark a lock can have been taken by the write
/// the mark belongs to. A lock taken later is another program's.
const WRITE_SPAN: std::time::Duration = std::time::Duration::from_secs(5 * 60);

/// File times on some file systems are two seconds apart.
const COARSE: std::time::Duration = std::time::Duration::from_secs(2);

/// Kasten's mark while it writes to git, in its own cache: a lock file
/// found beside it was left by a Kasten process killed mid-write.
const WRITING_MARK: &str = ".kasten/cache/git-writing";

/// Marks Kasten writing to git until dropped; a killed process leaves it.
pub(super) struct Writing(PathBuf);

impl Writing {
    pub(super) fn start(root: &Path) -> Writing {
        let mark = root.join(WRITING_MARK);
        if let Some(dir) = mark.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&mark, "");
        Writing(mark)
    }
}

impl Drop for Writing {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

impl History {
    /// The lock files git takes while it writes the index and the branch.
    fn lock_files(&self) -> Vec<PathBuf> {
        let git = self.root.join(".git");
        let mut locks = vec![git.join("index.lock"), git.join("HEAD.lock")];
        if let Ok(branch) = self.branch() {
            locks.push(git.join("refs/heads").join(format!("{branch}.lock")));
        }
        locks
    }

    /// Removes the lock files a Kasten process killed mid-write left in
    /// `.git`, known by its mark: only those taken while that write was
    /// under way. Any other program's lock is left alone, however old: a
    /// git command run by hand holds its lock as long as it runs, `git
    /// commit` waiting on its editor or `git add -p`. Kasten writes to git
    /// only under the vault's write lock, so its mark is never a live
    /// process's.
    pub(super) fn clear_stale_locks(&self) {
        let mark = self.root.join(WRITING_MARK);
        let Some(marked) = modified(&mark) else {
            return;
        };
        let from = marked.checked_sub(COARSE).unwrap_or(marked);
        let until = marked + WRITE_SPAN;
        for lock in self.lock_files() {
            if modified(&lock).is_some_and(|taken| taken >= from && taken <= until) {
                let _ = std::fs::remove_file(&lock);
            }
        }
        let _ = std::fs::remove_file(&mark);
    }

    /// The lock file a git command run by hand holds now, as the vault
    /// names it, after a moment's wait for a short one to finish.
    pub fn held_by(&self) -> Option<String> {
        self.clear_stale_locks();
        let held = || {
            self.lock_files()
                .into_iter()
                .find(|lock| lock.exists())
                .and_then(|lock| {
                    lock.strip_prefix(&self.root)
                        .ok()
                        .map(|rel| rel.to_string_lossy().replace('\\', "/"))
                })
        };
        for _ in 0..4 {
            held()?;
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        held()
    }

    /// The error for an op held back by a git command at work.
    pub(crate) fn busy_error(lock: &str) -> crate::error::Error {
        crate::error::Error::Git(format!(
            "A git command is working in this vault's history (it holds {lock}); try again when it is done. If no git command is running, delete {lock} and try again"
        ))
    }

    /// Whether a git command run by hand holds the history now.
    pub fn busy(&self) -> bool {
        self.held_by().is_some()
    }
}

fn modified(path: &Path) -> Option<std::time::SystemTime> {
    std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
}
