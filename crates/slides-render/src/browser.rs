//! Finding a browser to draw with: Chrome, Chromium or Edge, wherever the person keeps it.
//!
//! The order is what a person expects to be able to steer: `$CHROMIUM_PATH`, then `$CHROME`, then the usual names on
//! `PATH`, then the browsers Playwright downloads, then the places each system installs a browser.

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

/// Settings that name the browser's program, in the order they are tried.
pub const VARIABLES: [&str; 2] = ["CHROMIUM_PATH", "CHROME"];

/// The names a browser goes by on `PATH`, in the order they are tried.
pub const NAMES: [&str; 5] = [
    "chromium",
    "chromium-browser",
    "google-chrome",
    "google-chrome-stable",
    "microsoft-edge",
];

/// Where Playwright keeps a downloaded browser inside its `chromium-<revision>` folder, by system.
const PLAYWRIGHT_PROGRAMS: [&str; 6] = [
    "chrome-linux/chrome",
    "chrome-linux64/chrome",
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
    "chrome-win/chrome.exe",
    "chrome-win64/chrome.exe",
];

/// Where to look. [`Search::from_environment`] is what the program uses; a test makes its own.
#[derive(Clone, Debug, Default)]
pub struct Search {
    /// The settings that are set, as (name, value), in the order they are tried.
    pub variables: Vec<(String, PathBuf)>,
    /// The folders of `PATH`.
    pub path: Vec<PathBuf>,
    /// Folders that hold Playwright's `chromium-<revision>` folders.
    pub playwright: Vec<PathBuf>,
    /// Places a browser is installed on the various systems.
    pub places: Vec<PathBuf>,
}

/// Whether `path` is a file that can be run.
fn is_program(path: &Path) -> bool {
    let Ok(meta) = fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

impl Search {
    /// The places this machine keeps a browser, as its environment says.
    pub fn from_environment() -> Search {
        Search::from_lookup(|name| std::env::var_os(name))
    }

    /// The same, reading the environment through `get`.
    pub fn from_lookup(get: impl Fn(&str) -> Option<OsString>) -> Search {
        let value = |name: &str| get(name).filter(|v| !v.is_empty());
        let variables = VARIABLES
            .iter()
            .filter_map(|name| value(name).map(|v| ((*name).to_owned(), PathBuf::from(v))))
            .collect();
        let path = value("PATH")
            .map(|p| std::env::split_paths(&p).collect())
            .unwrap_or_default();
        let home = value("HOME")
            .or_else(|| value("USERPROFILE"))
            .map(PathBuf::from);
        let mut playwright = Vec::new();
        match value("PLAYWRIGHT_BROWSERS_PATH") {
            // Playwright's own meaning of 0: the browsers live inside a package, not in a folder to look in.
            Some(folder) if folder == "0" => {}
            // A folder named explicitly is the only one looked in, so that a person can point away from the others.
            Some(folder) => playwright.push(PathBuf::from(folder)),
            None => {
                playwright.push(PathBuf::from("/opt/pw-browsers"));
                if let Some(home) = &home {
                    playwright.push(home.join(".cache/ms-playwright"));
                    playwright.push(home.join("Library/Caches/ms-playwright"));
                }
                if let Some(local) = value("LOCALAPPDATA") {
                    playwright.push(PathBuf::from(local).join("ms-playwright"));
                }
            }
        }
        let mut places: Vec<PathBuf> = [
            "/opt/google/chrome/chrome",
            "/opt/microsoft/msedge/msedge",
            "/snap/bin/chromium",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        for (variable, tail) in [
            ("ProgramFiles", r"Google\Chrome\Application\chrome.exe"),
            ("ProgramFiles(x86)", r"Google\Chrome\Application\chrome.exe"),
            ("LOCALAPPDATA", r"Google\Chrome\Application\chrome.exe"),
            ("ProgramFiles", r"Microsoft\Edge\Application\msedge.exe"),
            (
                "ProgramFiles(x86)",
                r"Microsoft\Edge\Application\msedge.exe",
            ),
        ] {
            if let Some(base) = value(variable) {
                places.push(PathBuf::from(base).join(tail));
            }
        }
        Search {
            variables,
            path,
            playwright,
            places,
        }
    }

    fn on_path(&self, name: &str) -> Option<PathBuf> {
        self.path.iter().find_map(|dir| {
            [dir.join(name), dir.join(format!("{name}.exe"))]
                .into_iter()
                .find(|p| is_program(p))
        })
    }

    /// The newest browser Playwright downloaded into `root`.
    fn in_playwright(root: &Path) -> Option<PathBuf> {
        let mut found: Vec<(u64, PathBuf)> = fs::read_dir(root)
            .ok()?
            .flatten()
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().into_owned();
                let revision: u64 = name.strip_prefix("chromium-")?.parse().ok()?;
                let program = PLAYWRIGHT_PROGRAMS
                    .iter()
                    .map(|tail| entry.path().join(tail))
                    .find(|p| is_program(p))?;
                Some((revision, program))
            })
            .collect();
        found.sort();
        found.pop().map(|(_, program)| program)
    }

    /// The browser to use, or why there is none.
    pub fn find(&self) -> Result<PathBuf> {
        let mut notes = Vec::new();
        for (name, value) in &self.variables {
            if is_program(value) {
                return Ok(value.clone());
            }
            notes.push(format!(
                "{name} is set to {}, but there is no program there.",
                value.display()
            ));
        }
        if let Some(found) = NAMES.iter().find_map(|name| self.on_path(name)) {
            return Ok(found);
        }
        if let Some(found) = self
            .playwright
            .iter()
            .find_map(|root| Search::in_playwright(root))
        {
            return Ok(found);
        }
        if let Some(found) = self.places.iter().find(|p| is_program(p)) {
            return Ok(found.clone());
        }
        Err(Error::NoBrowser { notes })
    }
}

/// The browser this machine has: what a render will be drawn with.
pub fn find_browser() -> Result<PathBuf> {
    Search::from_environment().find()
}

#[cfg(test)]
mod tests;
