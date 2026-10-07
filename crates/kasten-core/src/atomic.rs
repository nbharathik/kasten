//! Atomic writes: write a temporary file in the
//! same folder, flush it to disk, then rename it over the target. A crash
//! leaves either the old file or the new one, never half of one.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use crate::id::ulid_at;
use crate::time::Instant;

/// A hidden name of its own, short whatever the target's name: a note named
/// near the file system's limit can still be saved.
fn temp_path(target: &Path) -> PathBuf {
    target.with_file_name(format!(".kasten-{}.tmp", ulid_at(Instant::now().millis)))
}

/// A file's bytes, or None when there is no file: any other failure to
/// read it is an error, never taken for "not there".
pub(crate) fn read_if_there(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err),
    }
}

/// Whether `name` is one of these temporary files: `.kasten-<ulid>.tmp`.
pub(crate) fn is_temp_name(name: &str) -> bool {
    name.strip_prefix(".kasten-")
        .and_then(|rest| rest.strip_suffix(".tmp"))
        .is_some_and(|id| id.len() == 26 && id.bytes().all(|b| b.is_ascii_alphanumeric()))
}

/// Removes the temporary files interrupted writes left an hour or more
/// ago, anywhere in the vault but git's own folder. Links are not followed.
pub(crate) fn sweep_stale(root: &Path) {
    if let Some(before) = SystemTime::now().checked_sub(Duration::from_secs(3600)) {
        sweep(root, before, true);
    }
}

fn sweep(dir: &Path, before: SystemTime, top: bool) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            if !(top && name == ".git") {
                sweep(&entry.path(), before, false);
            }
        } else if kind.is_file()
            && is_temp_name(&name)
            && entry
                .metadata()
                .and_then(|meta| meta.modified())
                .is_ok_and(|modified| modified < before)
        {
            let _ = fs::remove_file(entry.path());
        }
    }
}

fn sync_dir(dir: &Path) {
    // Directories cannot be opened for syncing on Windows; the rename is
    // durable enough there.
    if cfg!(unix)
        && let Ok(handle) = File::open(dir)
    {
        let _ = handle.sync_all();
    }
}

fn write_temp(target: &Path, bytes: &[u8]) -> io::Result<PathBuf> {
    if let Some(dir) = target.parent() {
        fs::create_dir_all(dir)?;
    }
    let temp = temp_path(target);
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()
    })();
    if let Err(err) = result {
        let _ = fs::remove_file(&temp);
        return Err(err);
    }
    Ok(temp)
}

/// Windows readers may briefly deny delete sharing (including file scanners).
/// Retry only the atomic rename; never remove the destination to make it work.
/// Allow up to two seconds: a reader can retain its handle for over a second.
fn replace_temp(temp: &Path, target: &Path) -> io::Result<()> {
    let mut retries = 0;
    loop {
        match fs::rename(temp, target) {
            Err(error)
                if cfg!(windows)
                    && matches!(error.raw_os_error(), Some(5 | 32 | 33))
                    && retries < 80 =>
            {
                retries += 1;
                std::thread::sleep(Duration::from_millis(25));
            }
            result => return result,
        }
    }
}

/// Replaces `target` with `bytes` atomically, creating folders as needed.
/// On Unix the file keeps its mode; Windows keeps only a read-only flag,
/// which would stop the new file from replacing it anyway.
pub fn write_atomic(target: &Path, bytes: &[u8]) -> io::Result<()> {
    let temp = write_temp(target, bytes)?;
    if cfg!(unix)
        && let Ok(meta) = fs::metadata(target)
    {
        let _ = fs::set_permissions(&temp, meta.permissions());
    }
    if let Err(err) = replace_temp(&temp, target) {
        let _ = fs::remove_file(&temp);
        return Err(err);
    }
    if let Some(dir) = target.parent() {
        sync_dir(dir);
    }
    Ok(())
}

/// Writes a new file atomically, failing with `AlreadyExists` rather than
/// replacing one that is there.
pub fn create_atomic(target: &Path, bytes: &[u8]) -> io::Result<()> {
    let temp = write_temp(target, bytes)?;
    // A hard link fails if the target exists, unlike rename. Unsupported
    // filesystems fail safely: an existence check followed by rename can
    // overwrite a file another process creates between those calls.
    let placed = match fs::hard_link(&temp, target) {
        // The file is in place; a temporary name that won't go is only
        // clutter, which the next open tidies away.
        Ok(()) => {
            let _ = fs::remove_file(&temp);
            Ok(())
        }
        Err(err) => Err(err),
    };
    if placed.is_err() {
        let _ = fs::remove_file(&temp);
    }
    placed?;
    if let Some(dir) = target.parent() {
        sync_dir(dir);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn a_brief_windows_reader_does_not_lose_a_save() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir =
            std::env::temp_dir().join(format!("kasten-rename-{}", ulid_at(Instant::now().millis)));
        fs::create_dir(&dir).unwrap();
        let target = dir.join("note.md");
        fs::write(&target, "old content").unwrap();
        let reader = OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&target)
            .unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(900));
            drop(reader);
        });
        let saved = write_atomic(&target, b"complete new content");
        release.join().unwrap();
        assert!(saved.is_ok(), "{saved:?}");
        assert_eq!(fs::read(&target).unwrap(), b"complete new content");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn a_persistent_windows_reader_preserves_the_original_on_error() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir =
            std::env::temp_dir().join(format!("kasten-denied-{}", ulid_at(Instant::now().millis)));
        fs::create_dir(&dir).unwrap();
        let target = dir.join("note.md");
        fs::write(&target, "original content").unwrap();
        let reader = OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&target)
            .unwrap();
        assert!(write_atomic(&target, b"new content").is_err());
        drop(reader);
        assert_eq!(fs::read(&target).unwrap(), b"original content");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn competing_creates_never_replace_the_winner() {
        let dir =
            std::env::temp_dir().join(format!("kasten-create-{}", ulid_at(Instant::now().millis)));
        fs::create_dir(&dir).unwrap();
        let target = dir.join("note.md");
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
        let workers: Vec<_> = (0..8)
            .map(|n| {
                let target = target.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let bytes = format!("complete content {n}\n");
                    barrier.wait();
                    (bytes.clone(), create_atomic(&target, bytes.as_bytes()))
                })
            })
            .collect();
        let mut winners = Vec::new();
        for worker in workers {
            let (bytes, result) = worker.join().unwrap();
            match result {
                Ok(()) => winners.push(bytes),
                Err(error) => assert_eq!(error.kind(), io::ErrorKind::AlreadyExists),
            }
        }
        assert_eq!(winners.len(), 1);
        assert_eq!(fs::read_to_string(&target).unwrap(), winners[0]);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }
}
