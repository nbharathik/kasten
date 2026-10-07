//! What a template's `{{…}}` placeholders become: the note's title, day and
//! project, and around the day its weekday, ISO week, month and year, and
//! the time. The app passes the person's own day and time as
//! `2026-09-28T14:05`; with the day alone (the CLI, an agent), the time is
//! the current one in UTC, and says so, since the core keeps no time zones.

use crate::time::Instant;

const WEEKDAYS: [&str; 7] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];
const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/// `2026-09-24`: four digits, two, two, with dashes.
pub(crate) fn valid_day(date: &str) -> bool {
    let b = date.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

/// The day of `2026-09-24` or `2026-09-24T08:05`, and the time when given.
/// None for anything else, such as a time past 23:59 or with seconds.
pub(crate) fn day_and_time(stamp: &str) -> Option<(&str, Option<&str>)> {
    let (day, time) = match stamp.split_once('T') {
        Some((day, time)) => (day, Some(time)),
        None => (stamp, None),
    };
    if !valid_day(day) {
        return None;
    }
    if let Some(time) = time {
        let b = time.as_bytes();
        let two = |i: usize| (b[i] - b'0') * 10 + (b[i + 1] - b'0');
        let digits =
            b.len() == 5 && b[2] == b':' && [0, 1, 3, 4].iter().all(|&i| b[i].is_ascii_digit());
        if !digits || two(0) > 23 || two(3) > 59 {
            return None;
        }
    }
    Some((day, time))
}

/// Days since 1970-01-01 (Howard Hinnant's days-from-civil).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// The year of a day number (the inverse's year alone is all the week needs).
fn year_of(days: i64) -> i64 {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    yoe + era * 400 + i64::from(mp >= 10)
}

/// The weekday, ISO week (`2026-W40`), month name and year of a valid day.
fn calendar(day: &str) -> (&'static str, String, &'static str, &str) {
    let num = |range: std::ops::Range<usize>| day[range].parse::<i64>().unwrap_or(1);
    let (y, m, d) = (num(0..4), num(5..7), num(8..10));
    let days = days_from_civil(y, m, d);
    let weekday = (days + 3).rem_euclid(7);
    // The ISO week is the one its Thursday is in, counted in that year.
    let thursday = days - weekday + 3;
    let year = year_of(thursday);
    let week = (thursday - days_from_civil(year, 1, 1)) / 7 + 1;
    (
        WEEKDAYS[weekday as usize],
        format!("{year}-W{week:02}"),
        MONTHS[(m.clamp(1, 12) - 1) as usize],
        &day[0..4],
    )
}

/// The template with its placeholders filled. `stamp` is a day, perhaps
/// with the local time, already checked by `day_and_time`.
pub(crate) fn fill(
    template: &str,
    title: &str,
    stamp: &str,
    project: &str,
    now: Instant,
) -> String {
    let (day, time) = day_and_time(stamp).unwrap_or((stamp, None));
    let time = time.map_or_else(|| format!("{} UTC", &now.rfc3339()[11..16]), str::to_owned);
    let mut text = template
        .replace("{{date}}", day)
        .replace("{{project}}", project)
        .replace("{{time}}", &time);
    if valid_day(day) && text.contains("{{") {
        let (weekday, week, month, year) = calendar(day);
        text = text
            .replace("{{weekday}}", weekday)
            .replace("{{week}}", &week)
            .replace("{{month}}", month)
            .replace("{{year}}", year);
    }
    // Last, so braces in a title stay as typed.
    text.replace("{{title}}", title)
}
