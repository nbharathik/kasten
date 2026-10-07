//! Build and vault information for the status bar.

use serde::Serialize;

use crate::vault_path::{self, VaultPath};

/// What the frontend shows in its status bar before any vault is opened.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub core_version: &'static str,
    pub app_version: &'static str,
    pub vault: Option<VaultPath>,
    /// This program, which serves MCP when started with `--mcp`.
    pub exe: Option<String>,
    /// Where this build's releases are listed, to say what is new in it.
    pub releases: Option<String>,
    /// This build installs new versions in place.
    pub can_install: bool,
}

/// The info with the vault chosen in the app's settings in `dir`.
pub fn app_info_for(dir: Option<&std::path::Path>, can_install: bool) -> AppInfo {
    AppInfo {
        core_version: kasten_core::VERSION,
        app_version: env!("CARGO_PKG_VERSION"),
        vault: vault_path::chosen(dir),
        exe: std::env::current_exe()
            .ok()
            .map(|p| p.display().to_string()),
        releases: crate::updates::releases_page(env!("CARGO_PKG_REPOSITORY")),
        can_install,
    }
}

#[tauri::command(async)]
pub fn app_info(app: tauri::AppHandle) -> AppInfo {
    use tauri::Manager;
    let can_install = app.state::<crate::update_install::Installer>().on();
    app_info_for(app.path().app_config_dir().ok().as_deref(), can_install)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_core_version() {
        let info = app_info_for(None, false);
        assert_eq!(info.core_version, kasten_core::VERSION);
        assert_eq!(info.app_version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn app_info_serializes_in_camel_case() {
        let json = serde_json::to_value(app_info_for(None, true)).unwrap();
        assert_eq!(json["canInstall"], true);
        assert!(json.get("coreVersion").is_some(), "{json}");
        assert!(json.get("appVersion").is_some(), "{json}");
        assert!(json.get("vault").is_some(), "{json}");
        assert!(
            json["exe"].as_str().is_some_and(|e| !e.is_empty()),
            "{json}"
        );
        let releases = json.get("releases").expect("optional field is serialized");
        assert!(
            releases.is_null()
                || releases.as_str().is_some_and(|r| {
                    r.starts_with("https://github.com/") && r.ends_with("/releases")
                }),
            "{json}"
        );
    }
}
