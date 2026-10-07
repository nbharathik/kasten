//! What Get latest needs from history to write the vault's folder itself:
//! which blob a tree holds at a path, the id a file's bytes would have,
//! whether the folder's file system ignores case, and git's index brought
//! in step with the files written.

use std::path::Path;

use git2::{ObjectType, Oid};

use super::{History, local_only, locks::Writing};
use crate::error::Result;

/// The blob id git gives `bytes`.
pub(crate) fn blob_id(bytes: &[u8]) -> Result<String> {
    Ok(Oid::hash_object(ObjectType::Blob, bytes)?.to_string())
}

impl History {
    /// The id of the file `tree` holds at `path`, or None when it holds no
    /// file there (a folder or another repository counts as none).
    pub(crate) fn blob_id_at(&self, tree: &str, path: &str) -> Result<Option<String>> {
        let repo = self.repo();
        let tree = repo.find_tree(Oid::from_str(tree)?)?;
        let Ok(entry) = tree.get_path(Path::new(path)) else {
            return Ok(None);
        };
        Ok((entry.kind() == Some(ObjectType::Blob)).then(|| entry.id().to_string()))
    }

    /// Whether the vault's file system takes `a.md` and `A.md` for one
    /// file, as git found when the repository was made.
    pub(crate) fn ignores_case(&self) -> bool {
        let repo = self.repo();
        repo.config()
            .ok()
            .and_then(|config| config.get_bool("core.ignorecase").ok())
            .unwrap_or(cfg!(any(windows, target_os = "macos")))
    }

    /// Brings git's index in step with files Get latest wrote or removed:
    /// each path with `true` is taken as it is on disk, and each with
    /// `false` leaves the index, whatever a file of another case holds.
    pub(crate) fn index_paths(&self, paths: &[(String, bool)]) -> Result<()> {
        self.clear_stale_locks();
        let _writing = Writing::start(&self.root);
        let repo = self.repo();
        let mut index = repo.index()?;
        for (path, kept) in paths.iter().filter(|(p, _)| !local_only(p)) {
            let rel = Path::new(path);
            if *kept {
                index.add_path(rel)?;
            } else if index.get_path(rel, 0).is_some() {
                index.remove_path(rel)?;
            }
        }
        index.write()?;
        Ok(())
    }
}
