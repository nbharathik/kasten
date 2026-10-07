//! Choosing the vault: the first-run screen and Settings create one or open a
//! folder, the choice is saved in the app's settings, and the app restarts
//! on it (the watcher and clock belong to one vault) once the page has
//! written what was typed.

use std::path::{Path, PathBuf};

use kasten_core::{Instant, Kasten};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::notes::HUMAN;
use crate::app_settings::{AppSettings, default_vault};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultChoices {
    /// The vault open now, if any.
    pub current: Option<String>,
    /// Vaults opened lately, newest first.
    pub recent: Vec<String>,
    /// Where a new vault would go.
    pub suggested: String,
    /// `KASTEN_VAULT` is set and wins over any choice made here.
    pub from_env: bool,
}

fn settings_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

/// `~/Notes` as the home folder's `Notes`; other paths as given.
pub(crate) fn expand(path: &str, home: Option<PathBuf>) -> PathBuf {
    let path = path.trim();
    let rest = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\"));
    match (rest, home) {
        (Some(rest), Some(home)) => home.join(rest),
        (None, Some(home)) if path == "~" => home,
        _ => PathBuf::from(path),
    }
}

#[tauri::command(async)]
pub fn vault_choices(app: AppHandle) -> Result<VaultChoices, String> {
    let settings = AppSettings::load(&settings_dir(&app)?);
    let paths = app.path();
    Ok(VaultChoices {
        current: crate::vault_path::chosen(Some(&settings_dir(&app)?)).map(|v| v.resolved),
        recent: settings.recent,
        suggested: default_vault(paths.document_dir().ok(), paths.home_dir().ok())
            .display()
            .to_string(),
        from_env: std::env::var_os("KASTEN_VAULT").is_some(),
    })
}

/// The sync app that copies `path` (OneDrive, Dropbox, iCloud Drive…), so
/// the chooser can warn before a vault is made or opened there.
#[tauri::command(async)]
pub fn folder_synced(app: AppHandle, path: String) -> Option<String> {
    let home = app.path().home_dir().ok();
    let folder = expand(&path, home.clone());
    kasten_core::synced_by(&folder, home.as_deref()).map(str::to_owned)
}

/// Checks the folder (making a new vault there when `create` is set), saves
/// the choice and restarts the app on it.
#[tauri::command(async)]
pub fn open_vault(
    app: AppHandle,
    path: String,
    create: bool,
    name: Option<String>,
    kit: Option<String>,
) -> Result<(), String> {
    let folder = expand(&path, app.path().home_dir().ok());
    let folder = std::path::absolute(&folder).map_err(|e| e.to_string())?;
    crate::crash::caught(|| prepare(&folder, create, name.as_deref(), kit.as_deref()))?;
    let chosen = folder.display().to_string();
    AppSettings::update(&settings_dir(&app)?, |settings| settings.choose(&chosen))
        .map_err(|e| format!("Could not save the choice: {e}"))?;
    // The page's waiting typing is written first, then the app restarts
    // on the new vault.
    crate::closing::restart_when_written(&app);
    Ok(())
}

/// Makes `folder` a vault (never overwriting anything there), with a
/// starter kit when one was picked, or checks it opens as one.
fn prepare(
    folder: &Path,
    create: bool,
    name: Option<&str>,
    kit: Option<&str>,
) -> Result<(), String> {
    if create {
        let name = name
            .map(str::trim)
            .filter(|n| !n.is_empty())
            .map(str::to_owned)
            .or_else(|| folder.file_name().map(|n| n.to_string_lossy().into_owned()))
            .unwrap_or_else(|| "Kasten".to_owned());
        let kasten = Kasten::init(folder, &name).map_err(|e| e.to_string())?;
        if let Some(kit) = kit {
            kasten.add_kit(&HUMAN, kit, Instant::now()).map_err(|e| {
                format!("The vault is made, but its starter kit was not added: {e}")
            })?;
        }
        return Ok(());
    }
    if !folder.is_dir() {
        return Err(format!("No folder at {}", folder.display()));
    }
    Kasten::open(folder).map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("kasten-app-vaults-{}", std::process::id()))
            .join(name);
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn expands_the_home_folder() {
        assert_eq!(
            expand(" ~/Notes ", Some("/home/a".into())),
            PathBuf::from("/home/a/Notes")
        );
        assert_eq!(
            expand("/srv/notes", Some("/home/a".into())),
            PathBuf::from("/srv/notes")
        );
    }

    #[test]
    fn creates_a_vault_or_opens_a_folder() {
        let fresh = scratch("fresh");
        prepare(&fresh, true, Some("My notes"), None).unwrap();
        assert!(fresh.join("templates/meeting.md").is_file());
        assert!(fresh.join(".git").is_dir(), "history starts at once");
        // Opening it again works, and a missing folder is refused.
        prepare(&fresh, false, None, None).unwrap();
        assert!(prepare(&scratch("missing"), false, None, None).is_err());
    }

    #[test]
    fn a_new_vault_can_start_with_a_kit() {
        let fresh = scratch("with-kit");
        prepare(&fresh, true, Some("Planned"), Some("daily-planner")).unwrap();
        assert!(fresh.join("library/daily-planner.md").is_file());
        let journal = std::fs::read_to_string(fresh.join("templates/journal.md")).unwrap();
        assert_eq!(journal, "---\ntitle: \"{{date}}\"\ntype: journal\n---\n");
        assert!(prepare(&scratch("bad-kit"), true, None, Some("nope")).is_err());
    }
}
