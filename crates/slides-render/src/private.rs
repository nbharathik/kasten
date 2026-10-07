//! Folders and files that belong to this user alone.
//!
//! What a program writes under a shared folder such as /tmp is open to every other user who can guess its name:
//! they can plant a link there for the program to write through, or a folder of their own for it to work in. So a
//! folder that is used again is made closed to other users (mode 0700) and is used only while it is a real folder
//! (not a link), this user's, and still closed; a folder used once has a name nobody can guess and is made only if
//! nothing is there; and a file is made new, never through a link. Where there are no users and modes (Windows)
//! the checks that need them pass, since the per-user folders there are private already.

use std::fs::{self, DirBuilder, OpenOptions};
use std::io::{self, Read, Write};
use std::path::Path;

#[cfg(unix)]
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt};
#[cfg(unix)]
use std::sync::OnceLock;

/// The user this program runs as (the effective user), when the system can say.
#[cfg(unix)]
pub fn current_uid() -> Option<u32> {
    static UID: OnceLock<Option<u32>> = OnceLock::new();
    *UID.get_or_init(|| {
        if let Ok(status) = fs::read_to_string("/proc/self/status")
            && let Some(ids) = status.lines().find_map(|l| l.strip_prefix("Uid:"))
        {
            return ids.split_whitespace().nth(1)?.parse().ok();
        }
        // Systems without /proc have `id`.
        let out = std::process::Command::new("/usr/bin/id")
            .arg("-u")
            .output()
            .ok()?;
        String::from_utf8_lossy(&out.stdout).trim().parse().ok()
    })
}

/// No users to tell apart.
#[cfg(not(unix))]
pub fn current_uid() -> Option<u32> {
    None
}

/// Whether this program runs as the administrator.
pub fn running_as_root() -> bool {
    cfg!(unix) && current_uid() == Some(0)
}

fn refused(path: &Path, why: &str) -> io::Error {
    io::Error::new(
        io::ErrorKind::PermissionDenied,
        format!("{} {why}", path.display()),
    )
}

/// `bytes` random bytes as hexadecimal text, from the system's source of randomness.
pub fn random_hex(bytes: usize) -> String {
    let mut raw = vec![0u8; bytes];
    let from_system = fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut raw));
    if from_system.is_err() {
        // No such device (Windows): the standard library seeds its hash maps from the system's randomness.
        use std::hash::{BuildHasher, Hasher};
        for chunk in raw.chunks_mut(8) {
            let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
            hasher.write_u128(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_or(0, |d| d.as_nanos()),
            );
            let word = hasher.finish().to_le_bytes();
            chunk.copy_from_slice(&word[..chunk.len()]);
        }
    }
    raw.iter().map(|b| format!("{b:02x}")).collect()
}

/// A name for this run of the program that nobody can guess, the same throughout the run: for a folder in a shared
/// place such as /tmp, where a name that can be guessed can be taken by somebody else first.
pub fn process_token() -> &'static str {
    static TOKEN: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    TOKEN.get_or_init(|| random_hex(12))
}

/// Whether `path` is a real folder (not a link) that is this user's and closed to everyone else.
pub fn check_private(path: &Path) -> io::Result<()> {
    let meta = fs::symlink_metadata(path)?;
    if !meta.is_dir() {
        return Err(refused(
            path,
            "is a link or a file, not a folder of your own",
        ));
    }
    #[cfg(unix)]
    {
        let me = current_uid().ok_or_else(|| {
            refused(
                path,
                "cannot be checked: the system does not say which user this is",
            )
        })?;
        if meta.uid() != me {
            return Err(refused(path, "belongs to another user"));
        }
        let mode = meta.mode() & 0o777;
        if mode & 0o077 != 0 || mode & 0o700 != 0o700 {
            return Err(refused(
                path,
                &format!(
                    "can be entered by other users (mode {mode:03o}); close it to them with `chmod 700 {}`",
                    path.display()
                ),
            ));
        }
    }
    Ok(())
}

/// Makes a folder closed to other users, and fails if there is anything at `path` already, even a link to nothing.
pub fn create_private(path: &Path) -> io::Result<()> {
    let mut builder = DirBuilder::new();
    builder.recursive(false);
    #[cfg(unix)]
    builder.mode(0o700);
    builder.create(path)
}

/// A folder to use again and again: made (closed to other users) when it is not there, else used only if it passes
/// [`check_private`]. The folders above it are made if they are missing and are not checked: they are the user's
/// own cache folder, or a shared one such as /tmp, where only the last name is ours to make safe.
pub fn ensure_private(path: &Path) -> io::Result<()> {
    match check_private(path) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
                fs::create_dir_all(parent)?;
            }
            match create_private(path) {
                Ok(()) => Ok(()),
                // Somebody made it in the meantime: it must be as good as one this user made.
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => check_private(path),
                Err(e) => Err(e),
            }
        }
        other => other,
    }
}

fn new_file(create_new: bool) -> OpenOptions {
    let mut options = OpenOptions::new();
    options.write(true);
    if create_new {
        options.create_new(true);
    } else {
        options.create(true).truncate(true);
    }
    #[cfg(unix)]
    options.mode(0o600);
    options
}

/// Writes a file that must not exist yet: a link or a file in the way is an error, and nothing is written through it.
pub fn write_new(path: &Path, bytes: &[u8]) -> io::Result<()> {
    new_file(true).open(path)?.write_all(bytes)
}

/// Writes a file in a private folder that this program keeps between runs: it is written again only if it is a plain
/// file of this user (or not there), never through a link.
pub fn overwrite_own(path: &Path, bytes: &[u8]) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(meta) if !meta.is_file() => {
            return Err(refused(
                path,
                "is a link or a folder, not a file of your own",
            ));
        }
        #[cfg(unix)]
        Ok(meta) if Some(meta.uid()) != current_uid() => {
            return Err(refused(path, "belongs to another user"));
        }
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    new_file(false).open(path)?.write_all(bytes)
}

/// Opens (making it if need be) a file this program keeps in a private folder for locking, refusing a link or
/// another user's file in its place.
pub fn open_lock(path: &Path) -> io::Result<fs::File> {
    match fs::symlink_metadata(path) {
        Ok(meta) if !meta.is_file() => {
            return Err(refused(
                path,
                "is a link or a folder, not a file of your own",
            ));
        }
        #[cfg(unix)]
        Ok(meta) if Some(meta.uid()) != current_uid() => {
            return Err(refused(path, "belongs to another user"));
        }
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    let mut options = OpenOptions::new();
    options.create(true).truncate(false).read(true).write(true);
    #[cfg(unix)]
    options.mode(0o600);
    options.open(path)
}

#[cfg(test)]
mod tests;
