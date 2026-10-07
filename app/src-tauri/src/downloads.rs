//! Files the app hands to the person: an exported deck goes to their
//! Downloads folder. This is not the vault, so no vault op is involved; what
//! it owes is the vault's manners: a file that is already there is never
//! replaced, the name is made safe, and the size is bounded.

use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

/// The largest file handed over this way.
const MAX_BYTES: usize = 512 * 1024 * 1024;

/// A file name that is safe to create: no folders, no characters a file
/// system refuses, no leading dots, not empty, not too long.
fn safe_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                ' '
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned = cleaned.trim_start_matches('.').trim();
    if cleaned.is_empty() {
        return "Download".to_owned();
    }
    // Keep the extension when the name is cut.
    match cleaned.rsplit_once('.') {
        Some((stem, ext)) if cleaned.chars().count() > 120 && ext.len() <= 12 => {
            format!(
                "{}.{ext}",
                stem.chars().take(100).collect::<String>().trim()
            )
        }
        _ if cleaned.chars().count() > 120 => cleaned.chars().take(120).collect(),
        _ => cleaned.to_owned(),
    }
}

/// Writes `bytes` to a new file called `name` in `dir`, or `name (2)`,
/// `name (3)` … when that is taken. The file is created, never opened over
/// an existing one. Returns where it went.
fn write_new(dir: &Path, name: &str, bytes: &[u8]) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let name = safe_name(name);
    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem.to_owned(), format!(".{ext}")),
        _ => (name.clone(), String::new()),
    };
    for n in 1u32.. {
        let file = if n == 1 {
            name.clone()
        } else {
            format!("{stem} ({n}){ext}")
        };
        let path = dir.join(file);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut open) => {
                open.write_all(bytes)?;
                open.flush()?;
                return Ok(path);
            }
            Err(err) if err.kind() == ErrorKind::AlreadyExists => {}
            Err(err) => return Err(err),
        }
    }
    unreachable!("names run out only after u32::MAX files")
}

/// Keeps the request's body in the person's Downloads folder under the name
/// in the `x-name` header (percent-encoded) and returns the path it went to.
#[tauri::command(async)]
pub fn save_download(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The file's bytes did not arrive".into());
    };
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err("The file is empty or too large to save this way".into());
    }
    let name = request
        .headers()
        .get("x-name")
        .and_then(|value| value.to_str().ok())
        .and_then(crate::commands::assets::percent_decode)
        .ok_or("The file's name did not arrive")?;
    let dir = app
        .path()
        .download_dir()
        .map_err(|_| "This computer has no Downloads folder to save to".to_owned())?;
    write_new(&dir, &name, bytes)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|err| format!("The file could not be saved: {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("kasten-downloads-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn names_are_made_safe() {
        assert_eq!(safe_name("My talk.pptx"), "My talk.pptx");
        assert_eq!(safe_name("../../etc/passwd"), "passwd");
        assert_eq!(safe_name("a:b*c?.pptx"), "a b c .pptx");
        assert_eq!(safe_name(".hidden.pptx"), "hidden.pptx");
        assert_eq!(safe_name("   "), "Download");
        assert_eq!(safe_name(""), "Download");
        let long = format!("{}.pptx", "x".repeat(300));
        let cut = safe_name(&long);
        assert!(
            cut.ends_with(".pptx") && cut.chars().count() <= 120,
            "{cut}"
        );
    }

    #[test]
    fn a_file_that_is_there_is_never_replaced() {
        let dir = temp("free-name");
        let first = write_new(&dir, "Talk.pptx", b"one").unwrap();
        let second = write_new(&dir, "Talk.pptx", b"two").unwrap();
        let third = write_new(&dir, "Talk.pptx", b"three").unwrap();
        assert_eq!(first.file_name().unwrap(), "Talk.pptx");
        assert_eq!(second.file_name().unwrap(), "Talk (2).pptx");
        assert_eq!(third.file_name().unwrap(), "Talk (3).pptx");
        assert_eq!(std::fs::read(&first).unwrap(), b"one");
        assert_eq!(std::fs::read(&second).unwrap(), b"two");
    }

    #[test]
    fn a_name_without_an_extension_gets_its_number_at_the_end() {
        let dir = temp("no-ext");
        write_new(&dir, "notes", b"a").unwrap();
        let second = write_new(&dir, "notes", b"b").unwrap();
        assert_eq!(second.file_name().unwrap(), "notes (2)");
    }
}
