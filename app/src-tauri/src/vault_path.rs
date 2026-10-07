//! Decides which vault folder the app points at: `KASTEN_VAULT` when set,
//! so dev builds can use `KASTEN_VAULT=./fixtures/dev-vault`,
//! else the vault chosen in the app (app_settings.rs). Nothing here reads or
//! writes vault content.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// A configured vault location and what it resolved to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultPath {
    /// The value exactly as configured.
    pub configured: String,
    /// The absolute folder it resolves to.
    pub resolved: String,
    /// Whether that folder exists.
    pub exists: bool,
}

/// Reads `KASTEN_VAULT`, if set.
pub fn from_env() -> Option<VaultPath> {
    let raw = std::env::var_os("KASTEN_VAULT")?;
    let cwd = std::env::current_dir().ok()?;
    Some(resolve(Path::new(&raw), &cwd, dev_repo_root()))
}

/// The vault to open: `KASTEN_VAULT` if set, else the one chosen in the app.
pub fn chosen(settings_dir: Option<&Path>) -> Option<VaultPath> {
    from_env().or_else(|| {
        let dir = settings_dir?;
        let vault = crate::app_settings::AppSettings::load(dir).vault?;
        Some(resolve(Path::new(&vault), Path::new("/"), None))
    })
}

/// `tauri dev` runs the binary from `app/src-tauri`, while the documented dev
/// setting is relative to the repository root. Debug builds therefore also try
/// the repository root. Release builds never look outside the given path.
#[cfg(debug_assertions)]
fn dev_repo_root() -> Option<&'static Path> {
    Path::new(env!("CARGO_MANIFEST_DIR")).parent()?.parent()
}

#[cfg(not(debug_assertions))]
fn dev_repo_root() -> Option<&'static Path> {
    None
}

/// Resolves `raw` against `cwd`, then against `dev_root` if that finds an
/// existing folder and `cwd` does not.
pub fn resolve(raw: &Path, cwd: &Path, dev_root: Option<&Path>) -> VaultPath {
    let mut candidates: Vec<PathBuf> = vec![cwd.join(raw)];
    if raw.is_relative()
        && let Some(root) = dev_root
    {
        candidates.push(root.join(raw));
    }
    let chosen = candidates
        .iter()
        .find(|p| p.is_dir())
        .unwrap_or(&candidates[0]);
    // `absolute` rather than `canonicalize`: no `\\?\` prefix on Windows and no
    // requirement that the folder exists.
    let resolved = std::path::absolute(chosen).unwrap_or_else(|_| chosen.clone());
    VaultPath {
        configured: raw.display().to_string(),
        resolved: resolved.display().to_string(),
        exists: chosen.is_dir(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh scratch folder per test, under the OS temp dir.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("kasten-app-vault-path-{}", std::process::id()))
            .join(name);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn abs(p: &Path) -> String {
        std::path::absolute(p).unwrap().display().to_string()
    }

    #[test]
    fn absolute_path_is_used_as_is() {
        let vault = scratch("absolute").join("vault");
        std::fs::create_dir_all(&vault).unwrap();
        let got = resolve(&vault, Path::new("/nowhere"), None);
        assert!(got.exists);
        assert_eq!(got.resolved, abs(&vault));
    }

    #[test]
    fn relative_path_prefers_the_working_directory() {
        let cwd = scratch("cwd-first");
        let root = scratch("cwd-first-root");
        std::fs::create_dir_all(cwd.join("v")).unwrap();
        std::fs::create_dir_all(root.join("v")).unwrap();
        let got = resolve(Path::new("./v"), &cwd, Some(&root));
        assert_eq!(got.resolved, abs(&cwd.join("v")));
    }

    #[test]
    fn relative_path_falls_back_to_the_dev_root() {
        let cwd = scratch("fallback-cwd");
        let root = scratch("fallback-root");
        std::fs::create_dir_all(root.join("fixtures/dev-vault")).unwrap();
        let got = resolve(Path::new("./fixtures/dev-vault"), &cwd, Some(&root));
        assert!(got.exists);
        assert_eq!(got.resolved, abs(&root.join("fixtures/dev-vault")));
        assert_eq!(got.configured, "./fixtures/dev-vault");
    }

    #[test]
    fn missing_folder_is_reported_not_created() {
        let cwd = scratch("missing");
        let got = resolve(Path::new("does-not-exist"), &cwd, None);
        assert!(!got.exists);
        assert!(!cwd.join("does-not-exist").exists());
    }
}
