//! The main window opens hidden, over a background in the page's own
//! colour, at the size and place it was left, and shows once the page has
//! drawn, so it never opens as a white flash. A second launch, the Dock
//! and the tray bring it forward.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::window::Color;
use tauri::{AppHandle, Manager, Theme, WebviewWindow};
use tauri_plugin_window_state::{StateFlags, WindowExt};

use crate::app_settings::AppSettings;
use crate::closing::MAIN;

/// What is remembered of the window: never full screen, which is for
/// presenting, and never whether it was shown.
pub fn remembered() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
}

/// Where the window's place is kept: a file of its own when `KASTEN_VAULT`
/// picks the vault, so a development window never moves the everyday one.
pub fn state_file(vault_from_env: bool) -> &'static str {
    if vault_from_env {
        ".window-state-kasten-vault.json"
    } else {
        ".window-state.json"
    }
}

/// How long the window waits for the page before it shows anyway.
const PATIENCE: Duration = Duration::from_secs(3);

static SHOWN: AtomicBool = AtomicBool::new(false);

/// The page's own background in each theme (`--color-canvas`).
pub fn background(dark: bool) -> Color {
    if dark {
        Color(0x19, 0x19, 0x19, 0xff)
    } else {
        Color(0xff, 0xff, 0xff, 0xff)
    }
}

/// Readies the hidden window at start: the background of the theme last
/// seen (else the system's), and the size and place it was left at. A page
/// that never says it has drawn still gets its window after a while.
pub fn prepare(app: &AppHandle, settings: Option<&Path>) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    let dark = settings
        .and_then(|dir| AppSettings::load(dir).dark)
        .unwrap_or_else(|| matches!(window.theme(), Ok(Theme::Dark)));
    let _ = window.set_background_color(Some(background(dark)));
    // Maximizing a hidden window shows it on Windows, so that waits for
    // the first show.
    let _ = window.restore_state(StateFlags::SIZE | StateFlags::POSITION);
    let app = app.clone();
    let _ = std::thread::Builder::new()
        .name("kasten-show".into())
        .spawn(move || {
            std::thread::sleep(PATIENCE);
            show_first(&app);
        });
}

/// Shows the window the first time, maximized if it was left so.
fn show_first(app: &AppHandle) {
    if SHOWN.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.restore_state(StateFlags::MAXIMIZED);
        bring_forward(&window);
    }
}

/// Brings the window forward: back from the Dock or the taskbar, shown if
/// hidden, and focused.
pub fn show_main(app: &AppHandle) {
    if !SHOWN.load(Ordering::SeqCst) {
        return show_first(app);
    }
    if let Some(window) = app.get_webview_window(MAIN) {
        bring_forward(&window);
    }
}

fn bring_forward(window: &WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// The page has drawn its first frame: the window shows.
#[tauri::command]
pub fn app_ready(app: AppHandle) {
    crate::startup::mark("window");
    show_first(&app);
}

/// The page's theme: the window's background follows it at once, and the
/// next start opens in it.
#[tauri::command(async)]
pub fn remember_theme(app: AppHandle, dark: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.set_background_color(Some(background(dark)));
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    AppSettings::update(&dir, |settings| settings.dark = Some(dark))
        .map_err(|e| format!("Could not keep the theme: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remembers_size_place_and_maximized_only() {
        let flags = remembered();
        assert!(flags.contains(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED));
        for never in [
            StateFlags::FULLSCREEN,
            StateFlags::VISIBLE,
            StateFlags::DECORATIONS,
        ] {
            assert!(!flags.intersects(never), "{never:?}");
        }
    }

    #[test]
    fn a_development_window_keeps_its_place_apart() {
        assert_ne!(state_file(true), state_file(false));
        assert_eq!(state_file(false), ".window-state.json");
    }

    #[test]
    fn the_background_matches_the_page() {
        assert_eq!(background(false), Color(255, 255, 255, 255));
        assert_eq!(background(true), Color(0x19, 0x19, 0x19, 255));
    }
}
