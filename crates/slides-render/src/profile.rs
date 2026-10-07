//! Where the browser keeps its profile (and where other programs of Kasten Slides do their work). A browser needs a
//! folder of its own, and nothing here ever deletes one, so a few folders are kept and lent out again and again:
//! each is guarded by a lock on a file, taken for as long as a render host uses it and given back by the system
//! when the program ends, however it ends. Two render hosts at once use two folders; a hundred runs in a row use one.
//!
//! The folders are private (see `private`): the place they are kept in and each folder are this user's and closed
//! to everyone else, or they are not used. A folder that another user planted, or made open, or replaced by a link,
//! is passed over.

use std::ffi::OsString;
use std::fs::{File, TryLockError};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use crate::private;

/// How many folders a pool has, at most: how many browsers can run at once.
pub const SLOTS: usize = 16;

/// A kind of folder that is kept and lent out: the browser's profiles, or a place to convert a file in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Pool {
    /// The folder they are kept in, under the cache folder: `render`.
    pub name: &'static str,
    /// The setting that names another place to keep them.
    pub variable: &'static str,
    /// What each folder is called, with its number after it: `profile-3`.
    pub folder: &'static str,
}

/// The browser's profiles.
pub const BROWSER: Pool = Pool {
    name: "render",
    variable: "SLIDES_RENDER_PROFILES",
    folder: "profile",
};

/// Places for other programs to do their work in, such as the LibreOffice that draws the previews of an import.
pub const WORKPLACES: Pool = Pool {
    name: "previews",
    variable: "SLIDES_WORKPLACES",
    folder: "work",
};

/// A folder that is ours for as long as this value lives.
#[derive(Debug)]
pub struct Slot {
    /// The folder to work in (for the browser, its user data folder).
    pub dir: PathBuf,
    /// Which of the folders it is.
    pub number: usize,
    _lock: File,
}

/// The places a pool's folders can be kept in, best first: the one the pool's setting names, the person's cache
/// folder, the system's temporary folder.
pub fn bases(pool: &Pool, get: impl Fn(&str) -> Option<OsString>) -> Vec<PathBuf> {
    let value = |name: &str| get(name).filter(|v| !v.is_empty()).map(PathBuf::from);
    let mut out = Vec::new();
    out.extend(value(pool.variable));
    let cache = if cfg!(target_os = "macos") {
        value("HOME").map(|h| h.join("Library/Caches"))
    } else if cfg!(windows) {
        value("LOCALAPPDATA")
    } else {
        value("XDG_CACHE_HOME").or_else(|| value("HOME").map(|h| h.join(".cache")))
    };
    out.extend(cache.map(|c| c.join("kasten-slides").join(pool.name)));
    let user = value("USER")
        .or_else(|| value("USERNAME"))
        .map(|u| {
            u.to_string_lossy()
                .chars()
                .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
                .collect::<String>()
        })
        .unwrap_or_default();
    // The last resort, in a folder anyone can write in: a name nobody can guess (so nobody can be there first), made
    // for this run only, and still checked like any other. It piles up in the temporary folder, which is for that.
    out.push(std::env::temp_dir().join(format!(
        "kasten-slides-{}-{}-{}",
        pool.name,
        if user.is_empty() { "user" } else { &user },
        private::process_token()
    )));
    out
}

/// Takes the first free folder of the pool under `base`, leaving out the numbers in `skip`. `base` must be private.
pub fn claim_in(pool: &Pool, base: &Path, skip: &[usize]) -> io::Result<Slot> {
    private::ensure_private(base)?;
    let mut refused: Vec<String> = Vec::new();
    for number in (0..SLOTS).filter(|n| !skip.contains(n)) {
        let lock = match private::open_lock(&base.join(format!("slot-{number}.lock"))) {
            Ok(lock) => lock,
            Err(e) => {
                refused.push(e.to_string());
                continue;
            }
        };
        match lock.try_lock() {
            Ok(()) => {
                let dir = base.join(format!("{}-{number}", pool.folder));
                match private::ensure_private(&dir) {
                    Ok(()) => {
                        return Ok(Slot {
                            dir,
                            number,
                            _lock: lock,
                        });
                    }
                    // Not ours to use; the lock is let go with `lock`, and the next folder is tried.
                    Err(e) => refused.push(e.to_string()),
                }
            }
            Err(TryLockError::WouldBlock) => {}
            Err(TryLockError::Error(e)) => return Err(e),
        }
    }
    Err(io::Error::other(match refused.first() {
        Some(first) => format!(
            "none of the {SLOTS} folders under {} can be used: {first}",
            base.display()
        ),
        None => format!(
            "all {SLOTS} folders under {} are in use by other programs",
            base.display()
        ),
    }))
}

/// Says, once in a program, that a place was passed over for another and why. A folder that is refused is left as it
/// is, so a run that has to use a folder in the temporary place instead leaves one behind, and nobody would otherwise
/// find out that the place they meant to use is not being used.
fn say_passed_over(said: &AtomicBool, why: &[String], used: &Path, out: impl FnOnce(&str)) {
    let Some(first) = why.first() else { return };
    if !said.swap(true, Ordering::Relaxed) {
        out(&format!(
            "note: not using {first}. This run uses {} instead.",
            used.display()
        ));
    }
}

/// Takes a free folder from the first place that can hold one, and says why the places that could not did not.
pub fn claim(pool: &Pool, bases: &[PathBuf], skip: &[usize]) -> io::Result<Slot> {
    static SAID: AtomicBool = AtomicBool::new(false);
    let mut why: Vec<String> = Vec::new();
    for base in bases {
        match claim_in(pool, base, skip) {
            Ok(slot) => {
                say_passed_over(&SAID, &why, &slot.dir, |line| eprintln!("{line}"));
                return Ok(slot);
            }
            Err(e) => why.push(e.to_string()),
        }
    }
    Err(io::Error::other(if why.is_empty() {
        "there is nowhere to keep it".to_owned()
    } else {
        why.join("; ")
    }))
}

/// Takes a free folder from the pool where this machine keeps them.
pub fn claim_here(pool: &Pool) -> io::Result<Slot> {
    claim(pool, &bases(pool, |name| std::env::var_os(name)), &[])
}

#[cfg(test)]
mod tests;
