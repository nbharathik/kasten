//! Times in UTC as RFC 3339, the form a sidecar keeps them in, without a
//! time-zone database.

/// `2026-09-24T08:12:05Z` for milliseconds since the Unix epoch.
pub fn rfc3339(millis: u64) -> String {
    let secs = (millis / 1000) as i64;
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // Howard Hinnant's days-to-civil algorithm.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

/// A number of a date or time: digits only, no sign and no spaces, at most `most` of them.
fn number(text: &str, most: usize) -> Option<i64> {
    if text.is_empty() || text.len() > most || !text.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

/// Milliseconds since the Unix epoch for a time written `YYYY-MM-DDTHH:MM:SS`
/// with optional fractions of a second and a `Z`; None for anything else, and
/// for a time before 1970. A sidecar is text anyone can write, so nothing in
/// it is trusted to fit: a year has four digits, as in RFC 3339, and every
/// step is checked.
pub fn rfc3339_millis(text: &str) -> Option<u64> {
    let text = text.strip_suffix('Z')?;
    let (date, time) = text.split_once('T')?;
    let mut day = date.split('-');
    let (year, month, of_month) = (
        number(day.next()?, 4)?,
        number(day.next()?, 2)?,
        number(day.next()?, 2)?,
    );
    if day.next().is_some() || !(1..=12).contains(&month) || !(1..=31).contains(&of_month) {
        return None;
    }
    let (clock, fraction) = time.split_once('.').unwrap_or((time, ""));
    let mut parts = clock.split(':');
    let (h, m, s) = (
        number(parts.next()?, 2)?,
        number(parts.next()?, 2)?,
        number(parts.next()?, 2)?,
    );
    if parts.next().is_some()
        || h > 23
        || m > 59
        || s > 60
        || !fraction.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    let millis: i64 = format!("{fraction:0<3}")[..3].parse().ok()?;
    // Days from civil, the inverse of the algorithm above.
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + of_month - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era
        .checked_mul(146_097)?
        .checked_add(doe)?
        .checked_sub(719_468)?;
    let seconds = days
        .checked_mul(86_400)?
        .checked_add(h * 3600 + m * 60 + s)?;
    u64::try_from(seconds.checked_mul(1000)?.checked_add(millis)?).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_reads_utc_times() {
        assert_eq!(rfc3339(0), "1970-01-01T00:00:00Z");
        assert_eq!(rfc3339(1_758_701_525_000), "2025-09-24T08:12:05Z");
        assert_eq!(rfc3339(951_782_400_000), "2000-02-29T00:00:00Z");
        for millis in [
            0,
            1_000,
            951_782_400_000,
            1_758_701_525_000,
            1_790_236_800_000,
            4_102_444_799_000,
        ] {
            assert_eq!(rfc3339_millis(&rfc3339(millis)), Some(millis), "{millis}");
        }
        assert_eq!(
            rfc3339_millis("2026-09-24T08:00:00.250Z"),
            Some(1_790_236_800_250)
        );
        assert_eq!(
            rfc3339_millis("2026-09-24T08:00:00.5Z"),
            Some(1_790_236_800_500)
        );
    }

    #[test]
    fn a_date_too_large_to_hold_is_not_a_time() {
        // Years have four digits, as in RFC 3339: a longer one is a mistake or an attack,
        // and must neither panic (debug) nor wrap into a date (release).
        for bad in [
            "9999999999-01-01T00:00:00Z",
            "99999999999999999999-01-01T00:00:00Z",
            "10000-01-01T00:00:00Z",
            "-1-01-01T00:00:00Z",
            "+2026-09-24T08:00:00Z",
            "2026-09-24T08:-5:00Z",
            "2026-09-24T+8:00:00Z",
            "2026-09-24T08:00:00.-5Z",
            "2026-09-24T08:00:0 Z",
            "1969-12-31T23:59:59Z",
        ] {
            assert_eq!(rfc3339_millis(bad), None, "{bad}");
        }
        // The last second of the last four-digit year still is one.
        assert_eq!(
            rfc3339_millis("9999-12-31T23:59:59Z"),
            Some(253_402_300_799_000)
        );
        assert_eq!(rfc3339(253_402_300_799_000), "9999-12-31T23:59:59Z");
    }

    #[test]
    fn anything_else_is_not_a_time() {
        for bad in [
            "",
            "2026-09-24",
            "2026-09-24T08:00:00",
            "2026-13-01T00:00:00Z",
            "2026-09-24T25:00:00Z",
            "yesterday",
            "2026-09-24T08:00:00+02:00",
        ] {
            assert_eq!(rfc3339_millis(bad), None, "{bad}");
        }
    }
}
