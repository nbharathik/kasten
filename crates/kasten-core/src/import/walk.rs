//! The folder being imported: checked against the vault, listed without its
//! hidden files (Obsidian's `.obsidian/` and `.trash/`, `.git/`), and told
//! apart: a Heptabase backup, a Notion export, an Obsidian vault or plain
//! Markdown.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use super::ImportKind;
use crate::error::{Error, Result};

/// One file in the folder.
#[derive(Debug, Clone)]
pub(crate) struct SourceFile {
    /// Its path in the folder, with forward slashes.
    pub rel: String,
    pub abs: PathBuf,
    pub size: u64,
    /// Last changed, in milliseconds since the Unix epoch.
    pub modified: Option<u64>,
}

impl SourceFile {
    /// The name without its folder or extension.
    pub fn stem(&self) -> &str {
        let name = self.rel.rsplit('/').next().unwrap_or(&self.rel);
        name.rsplit_once('.').map_or(name, |(stem, _)| stem)
    }

    /// The extension, lowercase; empty without one.
    pub fn ext(&self) -> String {
        let name = self.rel.rsplit('/').next().unwrap_or(&self.rel);
        name.rsplit_once('.')
            .map(|(_, ext)| ext.to_lowercase())
            .unwrap_or_default()
    }

    /// The folder it is in, `""` at the top.
    pub fn folder(&self) -> &str {
        self.rel.rsplit_once('/').map_or("", |(dir, _)| dir)
    }
}

/// The folder to import, refused when it is this vault, in it or holds it.
pub(crate) fn check_source(vault: &Path, source: &Path) -> Result<PathBuf> {
    let root = fs::canonicalize(source)
        .ok()
        .filter(|p| p.is_dir())
        .ok_or_else(|| Error::Invalid(format!("No folder at {}", source.display())))?;
    let vault = fs::canonicalize(vault)?;
    if root == vault {
        return Err(Error::Invalid(
            "That folder is this vault; pick a folder of notes outside it".to_owned(),
        ));
    }
    if root.starts_with(&vault) {
        return Err(Error::Invalid(
            "That folder is inside this vault; pick a folder of notes outside it".to_owned(),
        ));
    }
    if vault.starts_with(&root) {
        return Err(Error::Invalid(
            "That folder holds this vault; pick the folder of the notes themselves".to_owned(),
        ));
    }
    Ok(root)
}

/// Every file under `root`, sorted by path, leaving out hidden files and
/// folders and symbolic links.
pub(crate) fn walk(root: &Path) -> Result<Vec<SourceFile>> {
    let mut out = Vec::new();
    walk_dir(root, "", &mut out)?;
    out.sort_by(|a, b| a.rel.cmp(&b.rel));
    Ok(out)
}

fn walk_dir(dir: &Path, prefix: &str, out: &mut Vec<SourceFile>) -> Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        let rel = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            walk_dir(&entry.path(), &rel, out)?;
        } else if kind.is_file() {
            let meta = entry.metadata()?;
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64);
            out.push(SourceFile {
                rel,
                abs: entry.path(),
                size: meta.len(),
                modified,
            });
        }
    }
    Ok(())
}

/// A Notion export names every page and database `Title <32 hex digits>`.
pub(crate) fn notion_id(stem: &str) -> Option<&str> {
    let (_, id) = stem.rsplit_once(' ')?;
    let id = id.strip_suffix("_all").unwrap_or(id);
    (id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())).then_some(id)
}

/// What the folder is, from its files.
pub(crate) fn detect(root: &Path, files: &[SourceFile]) -> ImportKind {
    let heptabase = root.join("All-Data.json").is_file()
        || (root.join("card.json").is_file() && root.join("whiteboard.json").is_file());
    if heptabase {
        return ImportKind::Heptabase;
    }
    let notion = files
        .iter()
        .any(|f| matches!(f.ext().as_str(), "md" | "csv") && notion_id(f.stem()).is_some());
    if notion {
        return ImportKind::Notion;
    }
    if root.join(".obsidian").is_dir() {
        return ImportKind::Obsidian;
    }
    ImportKind::Markdown
}
