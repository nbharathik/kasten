//! Agent sessions: every MCP connection and chat thread is one, with an
//! id, a client name and a start time.

use std::collections::{BTreeSet, HashMap};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::atomic::write_atomic;
use crate::error::Result;
use crate::history::Actor;
use crate::id::ulid_at;
use crate::time::Instant;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub client: String,
    /// Milliseconds since the Unix epoch.
    pub started: u64,
}

impl Session {
    /// A new session for `client` (a short name such as `claude-code`).
    pub fn start(client: &str, now: Instant) -> Session {
        let client: String = client
            .trim()
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || matches!(c, '-' | '_' | '.') {
                    c
                } else {
                    '-'
                }
            })
            .take(40)
            .collect();
        Session {
            id: ulid_at(now.millis),
            client: if client.is_empty() {
                "agent".to_owned()
            } else {
                client
            },
            started: now.millis,
        }
    }

    /// Who the session's commits are by.
    pub fn actor(&self) -> Actor {
        Actor::Agent {
            client: self.client.clone(),
            session: self.id.clone(),
        }
    }
}

/// What a session changed lately, for the soft limits.
#[derive(Debug, Clone, Default)]
pub struct Tally {
    /// Paths changed, with when.
    pub changed: Vec<(String, u64)>,
    pub trashed: usize,
    /// Slides taken out of decks (removed, or left empty), with when.
    slides: Vec<(usize, u64)>,
    /// Pictures added: their size in bytes, with when.
    pictures: Vec<(u64, u64)>,
}

/// How long anything is remembered: no window is longer.
const MEMORY_MS: u64 = 3_600_000;

/// Whether changing `path` counts as changing a note: Kasten's own files do
/// not, and neither do the files in `assets/` (pictures with their sidecars,
/// two files each), which twenty figures for one deck would turn into forty
/// notes.
fn counts_as_a_note(path: &str) -> bool {
    !path.starts_with(".kasten/") && !(path.starts_with("assets/") && !path.ends_with(".md"))
}

impl Tally {
    pub fn record(&mut self, paths: &[String], now: u64) {
        for path in paths.iter().filter(|p| counts_as_a_note(p)) {
            self.changed.push((path.clone(), now));
        }
        // Older entries no longer count for anything.
        self.changed
            .retain(|(_, at)| now.saturating_sub(*at) <= MEMORY_MS);
    }

    /// Notes that `count` slides were taken out of decks at `now`.
    pub fn took_out_slides(&mut self, count: usize, now: u64) {
        if count > 0 {
            self.slides.push((count, now));
        }
        self.slides
            .retain(|(_, at)| now.saturating_sub(*at) <= MEMORY_MS);
    }

    /// Slides taken out of decks within `window` milliseconds before `now`.
    pub fn slides_taken_out(&self, now: u64, window: u64) -> usize {
        self.slides
            .iter()
            .filter(|(_, at)| now.saturating_sub(*at) <= window)
            .map(|(n, _)| *n)
            .sum()
    }

    /// Notes that a picture of `bytes` bytes was added at `now`.
    pub fn added_picture(&mut self, bytes: u64, now: u64) {
        self.pictures.push((bytes, now));
        self.pictures
            .retain(|(_, at)| now.saturating_sub(*at) <= MEMORY_MS);
    }

    /// How many pictures, and how many bytes of them, were added within `window` milliseconds before `now`.
    pub fn pictures_added(&self, now: u64, window: u64) -> (usize, u64) {
        self.pictures
            .iter()
            .filter(|(_, at)| now.saturating_sub(*at) <= window)
            .fold((0, 0), |(n, sum), (bytes, _)| (n + 1, sum + bytes))
    }

    /// Distinct paths changed within `window` milliseconds before `now`.
    pub fn recent(&self, now: u64, window: u64) -> BTreeSet<&str> {
        self.changed
            .iter()
            .filter(|(_, at)| now.saturating_sub(*at) <= window)
            .map(|(p, _)| p.as_str())
            .collect()
    }
}

const TRUST: &str = ".kasten/cache/trust.json";

/// Sessions a person trusted, with when the trust ends (a session is
/// trusted for an hour). Kept in the cache, shared by the app and
/// the MCP server.
pub fn load_trust(root: &Path) -> HashMap<String, u64> {
    std::fs::read_to_string(root.join(TRUST))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn save_trust(root: &Path, trust: &HashMap<String, u64>) -> Result<()> {
    let path = root.join(TRUST);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let text = serde_json::to_string_pretty(trust).unwrap_or_else(|_| "{}".to_owned());
    write_atomic(&path, text.as_bytes())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sessions_have_clean_client_names() {
        let s = Session::start("Claude Code / 1.0", Instant { millis: 1 });
        assert_eq!(s.client, "Claude-Code---1.0");
        assert_eq!(Session::start("  ", Instant { millis: 1 }).client, "agent");
        assert_eq!(s.id.len(), 26);
    }

    #[test]
    fn tallies_recent_distinct_paths() {
        let mut t = Tally::default();
        t.record(
            &[
                "a.md".into(),
                "b.md".into(),
                ".kasten/proposals/x.json".into(),
            ],
            1_000,
        );
        t.record(&["a.md".into()], 700_000);
        assert_eq!(
            t.recent(700_000, 600_000).into_iter().collect::<Vec<_>>(),
            ["a.md"]
        );
        assert_eq!(t.recent(700_000, 700_000).len(), 2);
    }

    #[test]
    fn slides_taken_out_and_pictures_added_are_counted_in_a_window() {
        let mut t = Tally::default();
        t.took_out_slides(2, 1_000);
        t.took_out_slides(0, 1_500);
        t.took_out_slides(3, 500_000);
        assert_eq!(t.slides_taken_out(500_000, 600_000), 5);
        // The first two fall out of a shorter window; nothing counts after an hour.
        assert_eq!(t.slides_taken_out(500_000, 100_000), 3);
        assert_eq!(t.slides_taken_out(4_000_000, 600_000), 0);
        t.added_picture(4_000, 10_000);
        t.added_picture(6_000, 20_000);
        assert_eq!(t.pictures_added(30_000, 600_000), (2, 10_000));
        assert_eq!(t.pictures_added(30_000, 15_000), (1, 6_000));
        assert_eq!(t.pictures_added(900_000, 600_000), (0, 0));
    }

    #[test]
    fn pictures_and_their_sidecars_are_not_notes() {
        let mut t = Tally::default();
        t.record(
            &[
                "assets/figure.png".into(),
                "assets/.meta/figure.png.json".into(),
                "library/talk.deck".into(),
            ],
            1_000,
        );
        assert_eq!(
            t.recent(1_000, 600_000).into_iter().collect::<Vec<_>>(),
            ["library/talk.deck"]
        );
    }
}
