//! Times for file names, in UTC, without a date library.

use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since 1970.
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// Year, month, day, hour, minute, second of a time in milliseconds.
fn civil(millis: u64) -> (i64, u32, u32, u32, u32, u32) {
    let secs = (millis / 1000) as i64;
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
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

/// `2026-09-29 14-32`, for names people read.
pub fn readable(millis: u64) -> String {
    let (y, mo, d, h, mi, _) = civil(millis);
    format!("{y:04}-{mo:02}-{d:02} {h:02}-{mi:02}")
}

/// `20260929T143205Z`, for names that sort.
pub fn compact(millis: u64) -> String {
    let (y, mo, d, h, mi, s) = civil(millis);
    format!("{y:04}{mo:02}{d:02}T{h:02}{mi:02}{s:02}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_utc_times() {
        assert_eq!(readable(1_758_701_525_000), "2025-09-24 08-12");
        assert_eq!(compact(1_758_701_525_000), "20250924T081205Z");
        assert_eq!(compact(0), "19700101T000000Z");
        assert_eq!(compact(951_782_400_000), "20000229T000000Z");
    }
}
