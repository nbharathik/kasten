//! The app's own settings, kept outside every vault in the OS's config
//! folder: which vault opens at start, the ones opened lately, the backup
//! remote and AI providers' addresses confirmed for each, and how the
//! window looked last. Nothing here reads or writes vault content.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

const FILE: &str = "settings.json";
/// Vaults remembered in "Recent".
const MAX_RECENT: usize = 8;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    /// The vault folder that opens at start.
    pub vault: Option<String>,
    /// Vaults opened lately, newest first.
    pub recent: Vec<String>,
    /// The backup remote confirmed on this computer, by vault folder. A
    /// vault's own config never chooses where its notes are pushed, since
    /// a vault someone shares could name any server.
    pub remotes: BTreeMap<String, String>,
    /// The AI providers' addresses confirmed on this computer, by vault
    /// folder: beside a provider's own API and this computer, chats and
    /// search by meaning send notes nowhere else.
    pub ai_origins: BTreeMap<String, BTreeSet<String>>,
    /// The page was dark when last seen, so the next start's first frame
    /// is too; unknown until the page says.
    pub dark: Option<bool>,
    /// The GitHub account signed in with, to show; its token is in the
    /// keychain.
    pub github_login: Option<String>,
    /// The folder backup files go to, by vault folder: one a sync client
    /// or a disk keeps, confirmed on this computer.
    pub backup_folders: BTreeMap<String, String>,
    /// Closing the window keeps Kasten running in the tray (the default)
    /// rather than quitting. macOS keeps it in the Dock either way.
    pub keep_running: Option<bool>,
    /// The person has been told once that Kasten keeps running.
    pub told_keep_running: bool,
    /// The quick capture shortcut, when changed from the default.
    pub capture_shortcut: Option<String>,
    /// System notifications while Kasten is in the background (default on).
    pub notifications: Option<bool>,
}

impl AppSettings {
    /// The settings in `dir`, or the defaults when there are none or they
    /// cannot be read.
    pub fn load(dir: &Path) -> AppSettings {
        fs::read_to_string(dir.join(FILE))
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    /// Writes the settings to `dir`, replacing the file in one step, and
    /// flushed to disk first: a power cut leaves the old settings or the
    /// new ones, never an empty file.
    pub fn save(&self, dir: &Path) -> io::Result<()> {
        use std::io::Write;
        fs::create_dir_all(dir)?;
        let text = serde_json::to_string_pretty(self).map_err(io::Error::other)?;
        let temp = dir.join(format!("{FILE}.tmp"));
        let mut file = fs::File::create(&temp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, dir.join(FILE))?;
        // The folder's entry for it too, where the system allows.
        #[cfg(unix)]
        if let Ok(folder) = fs::File::open(dir) {
            let _ = folder.sync_all();
        }
        Ok(())
    }

    /// Changes the settings in `dir` and writes them if anything changed.
    /// One change at a time, so two at once cannot lose either.
    pub fn update<T>(dir: &Path, change: impl FnOnce(&mut AppSettings) -> T) -> io::Result<T> {
        static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());
        let _held = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
        let before = AppSettings::load(dir);
        let mut after = before.clone();
        let out = change(&mut after);
        if after != before {
            after.save(dir)?;
        }
        Ok(out)
    }

    /// Makes `vault` the one to open, first among the recent ones.
    pub fn choose(&mut self, vault: &str) {
        self.vault = Some(vault.to_owned());
        self.recent.retain(|v| v != vault);
        self.recent.insert(0, vault.to_owned());
        self.recent.truncate(MAX_RECENT);
    }

    /// The remote confirmed for the vault in `folder`, if any.
    pub fn confirmed_remote(&self, folder: &str) -> Option<&str> {
        self.remotes.get(folder).map(String::as_str)
    }

    /// The AI providers' addresses confirmed for the vault in `folder`.
    pub fn confirmed_origins(&self, folder: &str) -> BTreeSet<String> {
        self.ai_origins.get(folder).cloned().unwrap_or_default()
    }

    /// Confirms an AI provider's address for the vault in `folder`.
    pub fn confirm_origin(&mut self, folder: &str, origin: &str) {
        self.ai_origins
            .entry(folder.to_owned())
            .or_default()
            .insert(origin.to_owned());
    }

    pub fn keeps_running(&self) -> bool {
        self.keep_running.unwrap_or(true)
    }

    pub fn notifies(&self) -> bool {
        self.notifications.unwrap_or(true)
    }

    /// Confirms `remote` for the vault in `folder`, or forgets it.
    pub fn confirm_remote(&mut self, folder: &str, remote: Option<&str>) {
        match remote {
            Some(url) => self.remotes.insert(folder.to_owned(), url.to_owned()),
            None => self.remotes.remove(folder),
        };
    }
}

/// Where a new vault goes by default: `Kasten` in the documents folder, or
/// in the home folder when a sync app copies the documents folder (OneDrive
/// often does on Windows, iCloud Drive on a Mac).
pub fn default_vault(documents: Option<PathBuf>, home: Option<PathBuf>) -> PathBuf {
    let synced = |dir: &&PathBuf| kasten_core::synced_by(dir, home.as_deref()).is_some();
    [&documents, &home]
        .into_iter()
        .flatten()
        .find(|dir| !synced(dir))
        .or(documents.as_ref())
        .or(home.as_ref())
        .cloned()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Kasten")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("kasten-app-settings-{}", std::process::id()))
            .join(name);
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn remembers_the_chosen_vault_and_recent_ones() {
        let dir = scratch("remember");
        assert_eq!(AppSettings::load(&dir), AppSettings::default());
        let mut settings = AppSettings::default();
        settings.choose("/notes/a");
        settings.choose("/notes/b");
        settings.choose("/notes/a");
        settings.save(&dir).unwrap();
        let loaded = AppSettings::load(&dir);
        assert_eq!(loaded.vault.as_deref(), Some("/notes/a"));
        assert_eq!(loaded.recent, ["/notes/a", "/notes/b"]);
        for n in 0..20 {
            settings.choose(&format!("/notes/{n}"));
        }
        assert_eq!(settings.recent.len(), MAX_RECENT);
    }

    #[test]
    fn remembers_the_remote_confirmed_for_each_vault() {
        let dir = scratch("remotes");
        let mut settings = AppSettings::default();
        settings.confirm_remote("/notes/a", Some("git@example.com:a.git"));
        settings.confirm_remote("/notes/b", Some("https://example.com/b.git"));
        settings.confirm_remote("/notes/b", None);
        settings.save(&dir).unwrap();
        let loaded = AppSettings::load(&dir);
        assert_eq!(
            loaded.confirmed_remote("/notes/a"),
            Some("git@example.com:a.git")
        );
        assert_eq!(loaded.confirmed_remote("/notes/b"), None);
        // Settings saved before remotes were kept still load.
        fs::write(dir.join(FILE), r#"{"vault": "/notes/a", "recent": []}"#).unwrap();
        assert_eq!(AppSettings::load(&dir).vault.as_deref(), Some("/notes/a"));
    }

    #[test]
    fn remembers_the_ai_addresses_confirmed_for_each_vault() {
        let dir = scratch("origins");
        let mut settings = AppSettings::default();
        settings.confirm_origin("/notes/a", "https://llm.example");
        settings.confirm_origin("/notes/a", "https://llm.example");
        settings.confirm_origin("/notes/b", "http://192.168.1.20:8000");
        settings.save(&dir).unwrap();
        let loaded = AppSettings::load(&dir);
        assert_eq!(
            loaded
                .confirmed_origins("/notes/a")
                .into_iter()
                .collect::<Vec<_>>(),
            ["https://llm.example"]
        );
        assert!(loaded.confirmed_origins("/notes/c").is_empty());
    }

    #[test]
    fn changes_are_written_only_when_something_changed() {
        let dir = scratch("update");
        AppSettings::update(&dir, |s| s.dark = Some(true)).unwrap();
        assert_eq!(AppSettings::load(&dir).dark, Some(true));
        let written = fs::metadata(dir.join(FILE)).unwrap().modified().unwrap();
        fs::remove_file(dir.join(FILE)).unwrap();
        // The same value again leaves the file alone: here, still gone.
        AppSettings::update(&dir, |s| s.dark = None).unwrap();
        assert!(!dir.join(FILE).exists());
        AppSettings::update(&dir, |s| s.choose("/notes/a")).unwrap();
        let loaded = AppSettings::load(&dir);
        assert_eq!(loaded.vault.as_deref(), Some("/notes/a"));
        assert!(fs::metadata(dir.join(FILE)).unwrap().modified().unwrap() >= written);
    }

    #[test]
    fn changes_made_at_once_are_all_kept() {
        let dir = scratch("together");
        let threads: Vec<_> = (0..8)
            .map(|n| {
                let dir = dir.clone();
                std::thread::spawn(move || {
                    AppSettings::update(&dir, |s| {
                        s.confirm_origin(&format!("/notes/{n}"), "https://llm.example")
                    })
                    .unwrap()
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap();
        }
        assert_eq!(AppSettings::load(&dir).ai_origins.len(), 8);
    }

    #[test]
    fn unreadable_settings_fall_back_to_defaults() {
        let dir = scratch("broken");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE), "{ not json").unwrap();
        assert_eq!(AppSettings::load(&dir), AppSettings::default());
    }

    #[test]
    fn new_vaults_go_to_the_documents_folder() {
        assert_eq!(
            default_vault(Some("/home/a/Documents".into()), Some("/home/a".into())),
            PathBuf::from("/home/a/Documents/Kasten")
        );
        assert_eq!(
            default_vault(None, Some("/home/a".into())),
            PathBuf::from("/home/a/Kasten")
        );
    }

    #[test]
    fn new_vaults_stay_out_of_a_synced_documents_folder() {
        assert_eq!(
            default_vault(
                Some("/home/a/OneDrive/Documents".into()),
                Some("/home/a".into())
            ),
            PathBuf::from("/home/a/Kasten")
        );
        // Nowhere better: the documents folder, and the chooser warns.
        assert_eq!(
            default_vault(
                Some("/home/a/Dropbox/Documents".into()),
                Some("/home/a/Dropbox".into())
            ),
            PathBuf::from("/home/a/Dropbox/Documents/Kasten")
        );
    }
}
