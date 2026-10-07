//! Template variables beyond the title, date and project: the time, the
//! weekday, the ISO week, the month and the year. The app passes the
//! person's local day and time as `2026-09-28T14:05`; a caller that sends
//! only the day gets the time in UTC, marked as such.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::{Kind, NewNote, apply_template, create_note};

const TEMPLATE: &str = "---\ntitle: \"{{title}}\"\n---\n{{weekday}} {{date}} at {{time}}, {{week}}, {{month}} {{year}}.\n";

fn page(title: &str, date: &str) -> NewNote {
    NewNote {
        kind: Kind::Page,
        title: title.into(),
        date: date.into(),
        project: None,
        parent: None,
        template: Some("vars".into()),
        icon: None,
    }
}

fn body(text: &str) -> &str {
    text.split("---\n").nth(2).unwrap()
}

#[test]
fn fills_the_time_weekday_week_month_and_year() {
    let t = dev_vault();
    fs::write(t.vault.root().join("templates/vars.md"), TEMPLATE).unwrap();
    let made = create_note(&t.vault, &page("Plan", "2026-09-28T14:05"), NOW).unwrap();
    assert_eq!(
        body(&made.text),
        "Monday 2026-09-28 at 14:05, 2026-W40, September 2026.\n"
    );
    // The day alone is still what names a journal day and fills {{date}}.
    assert!(!made.text.contains("T14:05\n"));
}

#[test]
fn counts_iso_weeks_across_the_new_year() {
    let t = dev_vault();
    fs::write(t.vault.root().join("templates/vars.md"), TEMPLATE).unwrap();
    for (day, weekday, week) in [
        ("2027-01-01", "Friday", "2026-W53"),
        ("2026-01-01", "Thursday", "2026-W01"),
        ("2024-12-30", "Monday", "2025-W01"),
        ("2024-02-29", "Thursday", "2024-W09"),
    ] {
        let made = create_note(&t.vault, &page(day, &format!("{day}T09:00")), NOW).unwrap();
        let text = body(&made.text);
        assert!(
            text.starts_with(&format!("{weekday} {day} at 09:00, {week},")),
            "{day}: {text}"
        );
    }
}

#[test]
fn a_day_without_a_time_says_the_time_is_utc() {
    let t = dev_vault();
    fs::write(t.vault.root().join("templates/vars.md"), TEMPLATE).unwrap();
    // NOW is 2026-09-24T08:00:00Z.
    let made = create_note(&t.vault, &page("Plan", "2026-09-24"), NOW).unwrap();
    assert!(
        body(&made.text).starts_with("Thursday 2026-09-24 at 08:00 UTC,"),
        "{}",
        made.text
    );
}

#[test]
fn refuses_a_time_that_is_not_one() {
    let t = dev_vault();
    fs::write(t.vault.root().join("templates/vars.md"), TEMPLATE).unwrap();
    for bad in [
        "2026-09-28T25:00",
        "2026-09-28T1405",
        "2026-09-28 14:05",
        "2026-09-28T14:05:00",
    ] {
        assert!(
            create_note(&t.vault, &page("Plan", bad), NOW).is_err(),
            "{bad}"
        );
    }
}

#[test]
fn a_template_applied_to_an_empty_page_fills_them_too() {
    let t = dev_vault();
    fs::write(t.vault.root().join("templates/vars.md"), TEMPLATE).unwrap();
    let mut blank = page("Empty", "2026-09-28");
    blank.template = None;
    let made = create_note(&t.vault, &blank, NOW).unwrap();
    let filled =
        apply_template(&t.vault, &made.meta.path, "vars", "2026-12-31T23:59", NOW).unwrap();
    assert_eq!(
        body(&filled.text),
        "Thursday 2026-12-31 at 23:59, 2026-W53, December 2026.\n"
    );
}
