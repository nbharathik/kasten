//! Restoring a backup into a new folder, from the vault chooser: a git
//! remote (GitHub or any host) or a backup file. The folder must be empty,
//! and the vault is built beside it and moved into place only when whole.
//! Then the remote is confirmed for it on this computer, it becomes the
//! vault that opens, and Kasten restarts on it.

use std::path::PathBuf;

use kasten_core::Kasten;
use kasten_core::history::{self, GitToken, https_origin};
use tauri::{AppHandle, Manager, State};

use crate::app_settings::AppSettings;
use crate::chat::commands::ChatState;
use crate::git_host::github;
use crate::secrets;

fn target(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let folder = crate::commands::vaults::expand(path, app.path().home_dir().ok());
    std::path::absolute(&folder).map_err(|e| e.to_string())
}

/// Makes the restored vault the one that opens, with `remote` confirmed
/// for it on this computer, and restarts on it.
fn open_restored(
    app: &AppHandle,
    folder: &std::path::Path,
    remote: Option<&str>,
) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let chosen = folder.display().to_string();
    AppSettings::update(&dir, |s| {
        s.choose(&chosen);
        if let Some(url) = remote {
            s.confirm_remote(&chosen, Some(url));
        }
    })
    .map_err(|e| format!("Could not save the choice: {e}"))?;
    crate::closing::restart_when_written(app);
    Ok(())
}

/// Restores the backup at the git address `url` into the empty folder
/// `path`. A token pasted here signs in to that server only and is kept
/// in the keychain; without one, a token already kept for the server (as
/// after "Sign in with GitHub"), an SSH key or git's credential helper.
#[tauri::command]
pub async fn restore_from_git(
    app: AppHandle,
    chat: State<'_, ChatState>,
    url: String,
    path: String,
    username: Option<String>,
    secret: Option<String>,
) -> Result<(), String> {
    let url = url.trim().to_owned();
    let folder = target(&app, &path)?;
    let keys = chat.keys();
    let origin = https_origin(&url);
    let pasted = secret
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty());
    let token = match (&origin, pasted) {
        (Some(origin), Some(secret)) => Some(GitToken {
            username: username
                .map(|u| u.trim().to_owned())
                .filter(|u| !u.is_empty())
                .unwrap_or_else(|| {
                    if origin == github::ORIGIN {
                        github::TOKEN_USER
                    } else {
                        "kasten"
                    }
                    .to_owned()
                }),
            origin: origin.clone(),
            secret,
        }),
        (None, Some(_)) => {
            return Err(
                "A token is for an https:// address; an ssh address signs in with an SSH key"
                    .into(),
            );
        }
        (Some(origin), None) => secrets::git_token(keys.as_ref(), origin).ok().flatten(),
        (None, None) => None,
    };
    let into = folder.clone();
    let remote = url.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::crash::caught(|| {
            history::clone_backup(&remote, token.as_ref(), &into)
                .map_err(|e| history::redact(&e.to_string(), token.as_ref()))?;
            // The address it came from is the backup from now on, even if
            // the vault's settings named another way to reach it.
            let kasten = Kasten::open(&into).map_err(|e| e.to_string())?;
            let mut config = kasten.config();
            if config.git.remote.as_deref() != Some(remote.as_str()) {
                config.git.remote = Some(remote.clone());
                kasten.set_config(config).map_err(|e| e.to_string())?;
            }
            if let Some(token) = &token {
                // Where the keychain can't keep it, it lasts this run only.
                let _ = secrets::save_git_token(keys.as_ref(), token);
            }
            Ok(())
        })
    })
    .await
    .map_err(crate::crash::joined)??;
    open_restored(&app, &folder, Some(&url))
}

/// Restores a backup file into the empty folder `path`.
#[tauri::command]
pub async fn restore_from_file(app: AppHandle, file: String, path: String) -> Result<(), String> {
    let bundle = target(&app, &file)?;
    let folder = target(&app, &path)?;
    let into = folder.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::crash::caught(|| {
            history::restore_from_bundle(&bundle, &into).map_err(|e| e.to_string())?;
            Ok(())
        })
    })
    .await
    .map_err(crate::crash::joined)??;
    open_restored(&app, &folder, None)
}
