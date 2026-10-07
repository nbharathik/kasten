//! The vault's write lock, `.kasten/write.lock`: the app, the CLI and the MCP
//! server take it for every op, so two processes never write at once.

use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::error::Result;

pub const LOCK_PATH: &str = ".kasten/write.lock";

#[derive(Debug)]
pub struct WriteLock {
    path: PathBuf,
    /// Threads of one process queue here before taking the file lock.
    local: Mutex<()>,
}

impl WriteLock {
    pub fn new(root: &Path) -> WriteLock {
        WriteLock {
            path: root.join(LOCK_PATH),
            local: Mutex::new(()),
        }
    }

    /// Runs `op` while holding the lock, waiting for any other holder.
    pub fn hold<T>(&self, op: impl FnOnce() -> Result<T>) -> Result<T> {
        crate::local_paths::check(&self.path)?;
        let _local = self
            .local
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir)?;
        }
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(&self.path)?;
        let mut lock = fd_lock::RwLock::new(file);
        let _held = lock.write()?;
        op()
    }
}
