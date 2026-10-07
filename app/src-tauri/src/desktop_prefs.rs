//! The desktop's own choices, in Settings: whether closing the window
//! keeps Kasten running in the tray, and whether it may send
//! notifications while in the background. Kept in the app's settings.

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::app_settings::AppSettings;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPrefs {
    pub keep_running: bool,
    pub notifications: bool,
    /// A Mac keeps Kasten in the Dock whatever keep_running says.
    pub mac: bool,
}

fn read(settings: &AppSettings) -> DesktopPrefs {
    DesktopPrefs {
        keep_running: settings.keeps_running(),
        notifications: settings.notifies(),
        mac: cfg!(target_os = "macos"),
    }
}

#[tauri::command(async)]
pub fn desktop_prefs(app: AppHandle) -> Result<DesktopPrefs, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(read(&AppSettings::load(&dir)))
}

#[tauri::command(async)]
pub fn set_desktop_prefs(
    app: AppHandle,
    keep_running: Option<bool>,
    notifications: Option<bool>,
) -> Result<DesktopPrefs, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    AppSettings::update(&dir, |s| {
        if let Some(keep) = keep_running {
            s.keep_running = Some(keep);
        }
        if let Some(on) = notifications {
            s.notifications = Some(on);
        }
        read(s)
    })
    .map_err(|e| e.to_string())
}
