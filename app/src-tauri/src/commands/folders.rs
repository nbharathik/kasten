//! The vault chooser's folder browser: the folders in a folder, each marked
//! as a Kasten vault, an Obsidian vault, a folder of notes or a plain
//! folder, and places to start from. Read only: names and markers, never a
//! note's text; no new dependency.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::vaults::expand;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub name: String,
    pub path: String,
    /// `kasten`, `obsidian`, `notes` (Markdown right inside) or `folder`.
    pub kind: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub label: &'static str,
    pub path: String,
}

/// A file of the kind asked for, such as a backup file.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub bytes: u64,
    /// Milliseconds since the Unix epoch.
    pub modified: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    pub path: String,
    pub parent: Option<String>,
    pub folders: Vec<Folder>,
    /// Files ending in the extension asked for, newest first; none when
    /// only folders were asked for.
    pub files: Vec<FileEntry>,
    pub places: Vec<Place>,
}

/// What a folder is, from its markers: never a walk through it.
pub fn kind_of(dir: &Path) -> &'static str {
    if dir.join(".kasten/config.yaml").is_file() {
        "kasten"
    } else if dir.join(".obsidian").is_dir() {
        "obsidian"
    } else if fs::read_dir(dir).is_ok_and(|entries| {
        entries.flatten().take(1_000).any(|e| {
            e.path()
                .extension()
                .is_some_and(|x| x.eq_ignore_ascii_case("md"))
        })
    }) {
        "notes"
    } else {
        "folder"
    }
}

/// The folders in `dir`, hidden ones aside, by name.
pub fn list(dir: &Path) -> Result<Vec<Folder>, String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Can't read {}: {e}", dir.display()))?;
    let mut out: Vec<Folder> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let path = entry.path();
            (!name.starts_with('.') && path.is_dir()).then(|| Folder {
                kind: kind_of(&path),
                path: path.display().to_string(),
                name,
            })
        })
        .collect();
    out.sort_by_key(|f| f.name.to_lowercase());
    Ok(out)
}

/// The files in `dir` ending in `.ext`, hidden ones aside, newest first.
pub fn list_files(dir: &Path, ext: &str) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Can't read {}: {e}", dir.display()))?;
    let wanted = format!(".{}", ext.trim_start_matches('.').to_lowercase());
    let mut out: Vec<FileEntry> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let meta = entry.metadata().ok().filter(|m| m.is_file())?;
            (!name.starts_with('.') && name.to_lowercase().ends_with(&wanted)).then(|| FileEntry {
                path: entry.path().display().to_string(),
                bytes: meta.len(),
                modified: meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64),
                name,
            })
        })
        .collect();
    out.sort_by(|a, b| {
        b.modified
            .cmp(&a.modified)
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(out)
}

/// The folders in `path` (the documents folder when none is given), and
/// the files ending in `.files` when asked, such as `bundle`.
#[tauri::command(async)]
pub fn browse_folders(
    app: AppHandle,
    path: Option<String>,
    files: Option<String>,
) -> Result<Listing, String> {
    let paths = app.path();
    let home = paths.home_dir().ok();
    let documents = paths.document_dir().ok();
    let dir = match path.filter(|p| !p.trim().is_empty()) {
        Some(p) => expand(&p, home.clone()),
        None => documents
            .clone()
            .or(home.clone())
            .unwrap_or_else(|| PathBuf::from("/")),
    };
    let dir = std::path::absolute(&dir).map_err(|e| e.to_string())?;
    let places = [
        ("Home", home),
        ("Documents", documents),
        ("Desktop", paths.desktop_dir().ok()),
    ]
    .into_iter()
    .filter_map(|(label, p)| {
        let p = p.filter(|p| p.is_dir())?;
        Some(Place {
            label,
            path: p.display().to_string(),
        })
    })
    .collect();
    Ok(Listing {
        folders: list(&dir)?,
        files: match files.as_deref() {
            Some(ext) if !ext.trim().is_empty() => list_files(&dir, ext)?,
            _ => Vec::new(),
        },
        parent: dir.parent().map(|p| p.display().to_string()),
        path: dir.display().to_string(),
        places,
    })
}

/// What a folder holds, before it is opened (kasten-core's survey).
#[tauri::command(async)]
pub fn survey_folder(app: AppHandle, path: String) -> Result<kasten_core::Survey, String> {
    let folder = expand(&path, app.path().home_dir().ok());
    crate::crash::caught(|| kasten_core::survey(&folder).map_err(|e| e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("kasten-app-folders-{}", std::process::id()))
            .join(name);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_folders_by_name_and_says_what_each_is() {
        let dir = scratch("list");
        for (folder, marker) in [
            ("Work vault", Some(".kasten/config.yaml")),
            ("obsidian", Some(".obsidian/app.json")),
            ("Notes", Some("idea.md")),
            ("photos", Some("a.png")),
            ("empty", None),
            (".hidden", None),
        ] {
            fs::create_dir_all(dir.join(folder)).unwrap();
            if let Some(marker) = marker {
                let file = dir.join(folder).join(marker);
                fs::create_dir_all(file.parent().unwrap()).unwrap();
                fs::write(file, "x").unwrap();
            }
        }
        fs::write(dir.join("loose.md"), "not a folder").unwrap();
        let found: Vec<(String, &str)> = list(&dir)
            .unwrap()
            .into_iter()
            .map(|f| (f.name, f.kind))
            .collect();
        assert_eq!(
            found,
            [
                ("empty".to_owned(), "folder"),
                ("Notes".to_owned(), "notes"),
                ("obsidian".to_owned(), "obsidian"),
                ("photos".to_owned(), "folder"),
                ("Work vault".to_owned(), "kasten"),
            ]
        );
        assert!(list(&dir.join("missing")).is_err());
    }

    #[test]
    fn lists_only_files_of_the_kind_asked_for() {
        let dir = scratch("files");
        for name in ["kasten-a.bundle", "B.BUNDLE", "notes.md", ".hidden.bundle"] {
            fs::write(dir.join(name), "x").unwrap();
        }
        fs::create_dir_all(dir.join("folder.bundle")).unwrap();
        let mut names: Vec<String> = list_files(&dir, "bundle")
            .unwrap()
            .into_iter()
            .map(|f| f.name)
            .collect();
        names.sort();
        assert_eq!(names, ["B.BUNDLE", "kasten-a.bundle"]);
    }
}
