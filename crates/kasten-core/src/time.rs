//! Timestamps without a time-zone database: UTC in RFC 3339 for frontmatter,
//! and a file-name-safe form for conflict copies and the trash.

use std::time::{SystemTime, UNIX_EPOCH};

/// Seconds and milliseconds since the Unix epoch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Instant {
    pub millis: u64,
}

impl Instant {
    pub fn now() -> Instant {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_millis() as u64);
        Instant { millis }
    }

    fn civil(self) -> (i64, u32, u32, u32, u32, u32) {
        let secs = (self.millis / 1000) as i64;
        let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
        // Howard Hinnant's days-to-civil algorithm.
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z.rem_euclid(146_097);
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
        let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
        let year = yoe + era * 400 + i64::from(month <= 2);
        (
            year,
            month,
            day,
            (rem / 3600) as u32,
            (rem % 3600 / 60) as u32,
            (rem % 60) as u32,
        )
    }

    /// `2026-09-24T08:12:05Z`
    pub fn rfc3339(self) -> String {
        let (y, mo, d, h, mi, s) = self.civil();
        format!("{y:04}-{mo:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
    }

    /// `2026-09-24 08-12`, for names shown to people.
    pub fn file_stamp(self) -> String {
        let (y, mo, d, h, mi, _) = self.civil();
        format!("{y:04}-{mo:02}-{d:02} {h:02}-{mi:02}")
    }

    /// `20260924T081205Z`, for folder names that sort.
    pub fn compact(self) -> String {
        let (y, mo, d, h, mi, s) = self.civil();
        format!("{y:04}{mo:02}{d:02}T{h:02}{mi:02}{s:02}Z")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_utc_dates() {
        let t = Instant {
            millis: 1_758_701_525_000,
        };
        assert_eq!(t.rfc3339(), "2025-09-24T08:12:05Z");
        assert_eq!(t.file_stamp(), "2025-09-24 08-12");
        assert_eq!(t.compact(), "20250924T081205Z");
        assert_eq!(Instant { millis: 0 }.rfc3339(), "1970-01-01T00:00:00Z");
        assert_eq!(
            Instant {
                millis: 951_782_400_000
            }
            .rfc3339(),
            "2000-02-29T00:00:00Z"
        );
    }
}
