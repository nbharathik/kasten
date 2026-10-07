//! Which imported notes are journal days: Obsidian's daily notes, found by
//! the folder and date format in `.obsidian/daily-notes.json`, or else any
//! note named as a day (`2026-09-23`).

use std::fs;
use std::path::Path;

use serde_json::Value;

const MONTHS: [&str; 12] = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];

#[derive(Debug, Clone)]
pub(crate) struct DailyNotes {
    /// Where daily notes are, with forward slashes; empty for anywhere.
    folder: String,
    /// A moment.js format, as Obsidian takes it: `YYYY-MM-DD`.
    format: String,
}

impl DailyNotes {
    pub fn read(root: &Path) -> DailyNotes {
        let config: Option<Value> = fs::read_to_string(root.join(".obsidian/daily-notes.json"))
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok());
        let field = |key: &str| {
            config
                .as_ref()
                .and_then(|c| c.get(key))
                .and_then(Value::as_str)
                .map(|s| s.trim().trim_matches('/').to_owned())
                .filter(|s| !s.is_empty())
        };
        DailyNotes {
            folder: field("folder").unwrap_or_default(),
            format: field("format").unwrap_or_else(|| "YYYY-MM-DD".to_owned()),
        }
    }

    /// The day a note at `rel` is, as `YYYY-MM-DD`, if it is one.
    pub fn date_of(&self, rel: &str) -> Option<String> {
        let inside = if self.folder.is_empty() {
            rel
        } else {
            rel.strip_prefix(&self.folder)?.strip_prefix('/')?
        };
        let stem = inside.strip_suffix(".md").unwrap_or(inside);
        // A format with folders in it (`YYYY/MM/YYYY-MM-DD`) names the file by its last part.
        let last = self.format.rsplit('/').next().unwrap_or(&self.format);
        let name = stem.rsplit('/').next().unwrap_or(stem);
        parse_day(last, name)
    }
}

/// Reads `text` as a day in the moment.js `format`: `YYYY`, `MM`, `M`,
/// `DD`, `D`, month names (`MMMM`, `MMM`), weekday names (`dddd`, `ddd`),
/// `[literal text]` and any other character as itself.
pub(crate) fn parse_day(format: &str, text: &str) -> Option<String> {
    let (mut year, mut month, mut day) = (None, None, None);
    let (mut f, mut t) = (format, text);
    let digits = |t: &str, min: usize, max: usize| -> Option<(u32, usize)> {
        let n = t.bytes().take(max).take_while(u8::is_ascii_digit).count();
        (n >= min).then(|| t[..n].parse().ok().map(|v| (v, n)))?
    };
    let letters = |t: &str| {
        t.chars()
            .take_while(|c| c.is_alphabetic())
            .map(char::len_utf8)
            .sum::<usize>()
    };
    while !f.is_empty() {
        if let Some(rest) = f.strip_prefix("YYYY") {
            let (v, n) = digits(t, 4, 4)?;
            year = Some(v);
            (f, t) = (rest, &t[n..]);
        } else if let Some(rest) = f.strip_prefix("MMMM").or_else(|| f.strip_prefix("MMM")) {
            let n = letters(t);
            let word = t[..n].to_lowercase();
            let m = MONTHS
                .iter()
                .position(|name| *name == word || (word.len() == 3 && name.starts_with(&word)))?;
            month = Some(m as u32 + 1);
            (f, t) = (rest, &t[n..]);
        } else if let Some(rest) = f.strip_prefix("MM") {
            let (v, n) = digits(t, 2, 2)?;
            month = Some(v);
            (f, t) = (rest, &t[n..]);
        } else if let Some(rest) = f.strip_prefix("M") {
            let (v, n) = digits(t, 1, 2)?;
            month = Some(v);
            (f, t) = (rest, &t[n..]);
        } else if let Some(rest) = f.strip_prefix("dddd").or_else(|| f.strip_prefix("ddd")) {
            let n = letters(t);
            (f, t) = (rest, &t[n..]);
        } else if let Some(rest) = f.strip_prefix("DD") {
            let (v, n) = digits(t, 2, 2)?;
            day = Some(v);
            (f, t) = (rest, &t[n..]);
        } else if let Some(rest) = f.strip_prefix("D") {
            let (v, n) = digits(t, 1, 2)?;
            day = Some(v);
            (f, t) = (rest, &t[n..]);
        } else if let Some(rest) = f.strip_prefix('[') {
            let (literal, after) = rest.split_once(']')?;
            t = t.strip_prefix(literal)?;
            f = after;
        } else {
            let c = f.chars().next()?;
            t = t.strip_prefix(c)?;
            f = &f[c.len_utf8()..];
        }
    }
    let (y, m, d) = (year?, month?, day?);
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        2 => 28,
        _ => return None,
    };
    (t.is_empty() && (1..=days).contains(&d)).then(|| format!("{y:04}-{m:02}-{d:02}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_days_in_obsidian_formats() {
        assert_eq!(
            parse_day("YYYY-MM-DD", "2026-09-23").as_deref(),
            Some("2026-09-23")
        );
        assert_eq!(
            parse_day("DD.MM.YYYY", "23.09.2026").as_deref(),
            Some("2026-09-23")
        );
        assert_eq!(
            parse_day("dddd, MMMM D, YYYY", "Wednesday, September 23, 2026").as_deref(),
            Some("2026-09-23")
        );
        assert_eq!(
            parse_day("YYYY-MM-DD [Daily]", "2026-09-23 Daily").as_deref(),
            Some("2026-09-23")
        );
        assert_eq!(
            parse_day("D MMM YYYY", "3 Sep 2026").as_deref(),
            Some("2026-09-03")
        );
        assert_eq!(parse_day("YYYY-MM-DD", "2026-02-29"), None);
        assert_eq!(
            parse_day("YYYY-MM-DD", "2024-02-29").as_deref(),
            Some("2024-02-29")
        );
        assert_eq!(parse_day("YYYY-MM-DD", "2026-09-23 notes"), None);
        assert_eq!(parse_day("YYYY-MM-DD", "Meeting notes"), None);
        assert_eq!(parse_day("YYYY-MM-DD", "2026-13-01"), None);
    }

    #[test]
    fn finds_daily_notes_in_their_folder() {
        let daily = DailyNotes {
            folder: "Daily".into(),
            format: "YYYY/MM/YYYY-MM-DD".into(),
        };
        assert_eq!(
            daily.date_of("Daily/2026/09/2026-09-23.md").as_deref(),
            Some("2026-09-23")
        );
        assert_eq!(
            daily.date_of("Daily/2026-09-23.md").as_deref(),
            Some("2026-09-23")
        );
        assert_eq!(daily.date_of("Notes/2026-09-23.md"), None);
        let anywhere = DailyNotes {
            folder: String::new(),
            format: "YYYY-MM-DD".into(),
        };
        assert_eq!(
            anywhere.date_of("Notes/2026-09-23.md").as_deref(),
            Some("2026-09-23")
        );
        assert_eq!(anywhere.date_of("Notes/Plan.md"), None);
    }
}
