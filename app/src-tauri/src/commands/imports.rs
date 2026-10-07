//! Moving notes in from Obsidian, a Markdown folder, Notion or Heptabase
//! through kasten-core: what an import would write, the
//! import as one commit, and undoing it, or any one commit, as a new one.

use std::path::PathBuf;

use kasten_core::import::{ImportOptions, ImportSummary, Imported};
use kasten_core::{Instant, Undone};
use tauri::State;

use super::notes::{HUMAN, OpenVault};

/// A folder as a person types or pastes it: quotes around it (as Windows'
/// "Copy as path" adds) left off, and `~/` as the home folder.
fn folder(source: &str) -> PathBuf {
    let source = source.trim().trim_matches(['"', '\'']);
    match source
        .strip_prefix("~/")
        .or_else(|| source.strip_prefix("~\\"))
    {
        Some(rest) => std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map_or_else(
                || PathBuf::from(source),
                |home| PathBuf::from(home).join(rest),
            ),
        None => PathBuf::from(source),
    }
}

#[tauri::command(async)]
pub fn plan_import(
    state: State<'_, OpenVault>,
    source: String,
    options: ImportOptions,
) -> Result<ImportSummary, String> {
    state.run(|k| k.plan_import(&folder(&source), &options, Instant::now()))
}

#[tauri::command(async)]
pub fn import_notes(
    state: State<'_, OpenVault>,
    source: String,
    options: ImportOptions,
) -> Result<Imported, String> {
    state.run(|k| k.import(&HUMAN, &folder(&source), &options, Instant::now()))
}

#[tauri::command(async)]
pub fn undo_commit(state: State<'_, OpenVault>, commit: String) -> Result<Undone, String> {
    state.run(|k| k.undo_commit(&commit, Instant::now()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_folders_as_people_paste_them() {
        assert_eq!(
            folder("  \"/notes/My Vault\" "),
            PathBuf::from("/notes/My Vault")
        );
        assert_eq!(folder("'/notes/x'"), PathBuf::from("/notes/x"));
        let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
        if let Some(home) = home {
            assert_eq!(folder("~/Notes"), PathBuf::from(home).join("Notes"));
        }
    }
}
