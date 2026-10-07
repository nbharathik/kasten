//! What a list shows in front of its items, and which number each numbered
//! item has. The counting is the editor's: an item's number counts the run of
//! numbered paragraphs at its own level; deeper items in between do not
//! interrupt it, while a plain paragraph, a bullet at the same level or an item
//! at a shallower level start it again. PowerPoint counts the same way, as long
//! as a plain paragraph is written at the first level, which it is.

use slides_core::{ListKind, Paragraph};

use super::metrics::{BULLETS, LIST_INDENT, MAX_LEVEL};

/// The level of a paragraph, from 0 to the deepest PowerPoint has.
pub fn level(paragraph: &Paragraph) -> usize {
    usize::from(paragraph.level.unwrap_or(0)).min(MAX_LEVEL)
}

/// The bullet glyph for a level.
pub fn bullet(level: usize) -> &'static str {
    BULLETS[level % BULLETS.len()]
}

/// The PPTX numbering scheme for a level: `1.` then `a.` then `i.`, and round again.
pub fn scheme(level: usize) -> &'static str {
    match level % 3 {
        1 => "alphaLcPeriod",
        2 => "romanLcPeriod",
        _ => "arabicPeriod",
    }
}

/// How a numbered paragraph is numbered.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Number {
    pub scheme: &'static str,
    /// Set when the item begins a run of numbers again after an earlier run at
    /// its level, so a program that would carry the count on begins at 1.
    pub start_at: Option<u32>,
}

/// The number each numbered paragraph shows, and None for the rest.
pub fn numbers(paragraphs: &[Paragraph]) -> Vec<Option<u32>> {
    let mut counters: Vec<u32> = Vec::new();
    paragraphs
        .iter()
        .map(|p| {
            let Some(kind) = &p.list else {
                counters.clear();
                return None;
            };
            let at = level(p);
            counters.truncate(at + 1);
            if counters.len() <= at {
                counters.resize(at + 1, 0);
            }
            match kind {
                ListKind::Bullet => {
                    counters[at] = 0;
                    None
                }
                ListKind::Number => {
                    counters[at] += 1;
                    Some(counters[at])
                }
            }
        })
        .collect()
}

/// `1` is `a`, `26` is `z`, `27` is `aa`, as a spreadsheet counts its columns.
fn letters(n: u32) -> String {
    let mut rest = n;
    let mut out = Vec::new();
    while rest > 0 {
        rest -= 1;
        out.push(char::from(b'a' + (rest % 26) as u8));
        rest /= 26;
    }
    out.iter().rev().collect()
}

/// Lower-case Roman numerals up to 3999; beyond that the plain number.
fn roman(n: u32) -> String {
    const NUMERALS: [(u32, &str); 13] = [
        (1000, "m"),
        (900, "cm"),
        (500, "d"),
        (400, "cd"),
        (100, "c"),
        (90, "xc"),
        (50, "l"),
        (40, "xl"),
        (10, "x"),
        (9, "ix"),
        (5, "v"),
        (4, "iv"),
        (1, "i"),
    ];
    if n >= 4000 {
        return n.to_string();
    }
    let mut rest = n;
    let mut out = String::new();
    for (value, glyph) in NUMERALS {
        while rest >= value {
            out.push_str(glyph);
            rest -= value;
        }
    }
    out
}

/// What a numbered item shows in front of it, such as `3.`, `c.` or `iv.`.
pub fn marker(scheme: &str, n: u32) -> String {
    match scheme {
        "alphaLcPeriod" => format!("{}.", letters(n)),
        "romanLcPeriod" => format!("{}.", roman(n)),
        _ => format!("{n}."),
    }
}

/// How wide a marker is in ems, judged generously: a wide face such as Inter or Verdana is assumed.
fn width_in_ems(marker: &str) -> f64 {
    marker
        .chars()
        .map(|c| match c {
            '.' => 0.3,
            '•' => 0.45,
            '–' => 0.6,
            '▪' => 0.7,
            '0'..='9' => 0.62,
            'i' | 'j' | 'l' => 0.28,
            'm' | 'w' => 0.85,
            _ => 0.56,
        })
        .sum()
}

/// The widest marker of a scheme among the first `count` numbers. The last is not always it:
/// "viii." is wider than "ix." and "m." than "n.", so a list that ends there still needs the room.
fn widest_marker(scheme: &str, count: u32) -> String {
    // Beyond this every scheme only grows with the number, so the last is the widest of the rest.
    const SCAN: u32 = 4000;
    (1..=count.min(SCAN))
        .chain([count])
        .map(|n| marker(scheme, n))
        .max_by(|a, b| width_in_ems(a).total_cmp(&width_in_ems(b)))
        .unwrap_or_default()
}

/// The room, in slide units, that a marker set at `points` needs in front of its text: its width and a little air.
fn room_for(marker: &str, points: f64) -> f64 {
    (width_in_ems(marker) + 0.2) * slides_core::units::points_to_units(points)
}

/// The most that any list grows: a marker as big as a heading is not given more room than this.
const MOST_HANGING: f64 = 240.0;

/// How far the marker of each paragraph hangs before its text, in slide units.
/// The editor hangs every marker `LIST_INDENT` in. PowerPoint sets the text
/// after a marker at a tab stop, and a marker wider than the hanging space
/// pushes the text on to the next default one, an inch away. So where a marker
/// does not fit (a number of two digits, or any at a large size) the list hangs
/// as far as its widest marker needs, in steps of 6 units, and every item of that level
/// hangs the same, so the text stays in line. `points` is the size of each paragraph's marker.
pub fn hangs(paragraphs: &[Paragraph], points: &[f64]) -> Vec<f64> {
    let counts = numbers(paragraphs);
    // The widest number at a level is the one with the largest count.
    let mut most = [1_u32; MAX_LEVEL + 1];
    for (p, count) in paragraphs.iter().zip(&counts) {
        if let Some(n) = count {
            let at = level(p);
            most[at] = most[at].max(*n);
        }
    }
    // The widest marker at a level is not always that of the largest count, and is worked out once for the level.
    let widest_number: [String; MAX_LEVEL + 1] =
        std::array::from_fn(|at| widest_marker(scheme(at), most[at]));
    let need: Vec<Option<f64>> = paragraphs
        .iter()
        .zip(points)
        .map(|(p, size)| {
            let at = level(p);
            let text = match &p.list {
                Some(ListKind::Number) => widest_number[at].as_str(),
                Some(ListKind::Bullet) => bullet(at),
                None => return None,
            };
            Some(room_for(text, *size))
        })
        .collect();
    let mut widest = [0.0_f64; MAX_LEVEL + 1];
    for (p, room) in paragraphs.iter().zip(&need) {
        if let Some(room) = room {
            let at = level(p);
            widest[at] = widest[at].max(*room);
        }
    }
    paragraphs
        .iter()
        .zip(&need)
        .map(|(p, own)| {
            let room = widest[level(p)];
            if own.is_none() || room <= LIST_INDENT {
                LIST_INDENT
            } else {
                ((room / 6.0).ceil() * 6.0).min(MOST_HANGING)
            }
        })
        .collect()
}

/// The numbering of each paragraph: its scheme, and where a run restarts.
pub fn numbering(paragraphs: &[Paragraph]) -> Vec<Option<Number>> {
    let mut seen = [false; MAX_LEVEL + 1];
    numbers(paragraphs)
        .into_iter()
        .zip(paragraphs)
        .map(|(n, p)| {
            let n = n?;
            let at = level(p);
            let restarts = n == 1 && seen[at];
            seen[at] = true;
            Some(Number {
                scheme: scheme(at),
                start_at: restarts.then_some(1),
            })
        })
        .collect()
}

#[cfg(test)]
mod widths;

#[cfg(test)]
mod tests {
    use super::*;

    fn item(kind: Option<ListKind>, level: u8) -> Paragraph {
        Paragraph {
            list: kind,
            level: Some(level),
            ..Paragraph::plain("x")
        }
    }

    fn num(level: u8) -> Paragraph {
        item(Some(ListKind::Number), level)
    }

    fn bul(level: u8) -> Paragraph {
        item(Some(ListKind::Bullet), level)
    }

    fn plain() -> Paragraph {
        item(None, 0)
    }

    #[test]
    fn consecutive_items_count_up_and_deeper_items_do_not_interrupt() {
        let list = [num(0), num(0), bul(1), num(1), num(1), num(0)];
        assert_eq!(
            numbers(&list),
            [Some(1), Some(2), None, Some(1), Some(2), Some(3)]
        );
    }

    #[test]
    fn a_plain_paragraph_a_bullet_or_a_shallower_item_start_the_count_again() {
        assert_eq!(
            numbers(&[num(0), plain(), num(0)]),
            [Some(1), None, Some(1)]
        );
        assert_eq!(numbers(&[num(0), bul(0), num(0)]), [Some(1), None, Some(1)]);
        assert_eq!(
            numbers(&[num(0), num(1), num(1), num(0), num(1)]),
            [Some(1), Some(1), Some(2), Some(2), Some(1)]
        );
        assert_eq!(
            numbers(&[num(0), num(1), plain(), num(1)]),
            [Some(1), Some(1), None, Some(1)]
        );
    }

    #[test]
    fn a_paragraph_with_no_level_is_at_the_first() {
        let p = Paragraph {
            list: Some(ListKind::Number),
            ..Paragraph::plain("x")
        };
        assert_eq!(numbers(&[p.clone(), p]), [Some(1), Some(2)]);
    }

    #[test]
    fn schemes_and_bullets_cycle_with_the_level() {
        let schemes: Vec<_> = (0..5).map(scheme).collect();
        assert_eq!(
            schemes,
            [
                "arabicPeriod",
                "alphaLcPeriod",
                "romanLcPeriod",
                "arabicPeriod",
                "alphaLcPeriod"
            ]
        );
        let bullets: Vec<_> = (0..4).map(bullet).collect();
        assert_eq!(bullets, ["•", "–", "▪", "•"]);
    }

    #[test]
    fn levels_stop_at_the_ninth() {
        assert_eq!(level(&num(200)), MAX_LEVEL);
        assert_eq!(level(&Paragraph::plain("x")), 0);
    }

    #[test]
    fn markers_read_as_the_editor_writes_them() {
        assert_eq!(marker("arabicPeriod", 12), "12.");
        assert_eq!(marker("alphaLcPeriod", 1), "a.");
        assert_eq!(marker("alphaLcPeriod", 27), "aa.");
        assert_eq!(marker("romanLcPeriod", 14), "xiv.");
        assert_eq!(marker("romanLcPeriod", 4000), "4000.");
    }

    #[test]
    fn a_marker_that_fits_the_editors_indent_keeps_it_and_one_that_does_not_widens_the_list() {
        let list = |n: usize| (0..n).map(|_| num(0)).collect::<Vec<_>>();
        // A bullet at 22 pt is about 19 units wide with its air: it fits in 24.
        assert_eq!(hangs(&[bul(0), bul(0)], &[22.0, 22.0]), [24.0, 24.0]);
        // A number at 18 pt: "1." is 0.9 em and air, 26 units: wider than 24.
        assert_eq!(hangs(&list(2), &[18.0, 18.0]), [30.0, 30.0]);
        // At 22 pt it needs 32 units, which is 36 in steps of 6.
        assert_eq!(hangs(&list(2), &[22.0, 22.0]), [36.0, 36.0]);
        // At 14 pt "1." needs 20 units and fits.
        assert_eq!(hangs(&list(2), &[14.0, 14.0]), [24.0, 24.0]);
    }

    #[test]
    fn every_item_of_a_level_hangs_the_same_and_a_plain_paragraph_keeps_the_editors_indent() {
        let list: Vec<Paragraph> = (0..10).map(|_| num(0)).chain([plain(), num(1)]).collect();
        let sizes = vec![14.0; list.len()];
        let got = hangs(&list, &sizes);
        // "10." at 14 pt is 1.5 em and air, 32 units: the whole first level hangs 36, the shorter markers too.
        assert!(got[..10].iter().all(|h| *h == 36.0), "{got:?}");
        assert_eq!(got[10], 24.0);
        assert_eq!(
            got[11], 24.0,
            "a level of its own is sized by its own markers"
        );
    }

    #[test]
    fn a_list_hangs_for_its_widest_marker_and_not_for_its_last() {
        let list = |n: usize, level: u8| (0..n).map(|_| num(level)).collect::<Vec<_>>();
        let hang = |n: usize, level: u8| hangs(&list(n, level), &vec![14.0; n])[0];
        // Roman numerals: "viii." is wider than "ix.", so a list of nine hangs as far as one of eight.
        assert_eq!(hang(9, 2), hang(8, 2));
        assert!(hang(8, 2) > hang(3, 2), "{} {}", hang(8, 2), hang(3, 2));
        // Letters: "m." is wider than "n.".
        assert_eq!(hang(14, 1), hang(13, 1));
        assert!(hang(13, 1) > hang(3, 1));
    }

    #[test]
    fn a_very_long_list_is_worked_out_in_one_pass() {
        let list: Vec<Paragraph> = (0..30_000).map(|n| num((n % 3) as u8)).collect();
        let sizes = vec![22.0; list.len()];
        let started = std::time::Instant::now();
        let hangs = hangs(&list, &sizes);
        assert_eq!(hangs.len(), list.len());
        assert!(
            started.elapsed() < std::time::Duration::from_secs(5),
            "{:?}",
            started.elapsed()
        );
    }

    #[test]
    fn a_marker_as_big_as_a_headline_stops_growing() {
        assert_eq!(hangs(&[num(0)], &[400.0]), [240.0]);
    }

    #[test]
    fn only_a_run_that_begins_again_is_told_to_start_at_one() {
        let list = [
            num(0),
            num(0),
            plain(),
            num(0),
            num(0),
            num(1),
            num(1),
            num(0),
        ];
        let starts: Vec<_> = numbering(&list)
            .into_iter()
            .map(|n| n.map(|n| n.start_at))
            .collect();
        assert_eq!(
            starts,
            [
                Some(None),
                Some(None),
                None,
                Some(Some(1)),
                Some(None),
                Some(None),
                Some(None),
                Some(None)
            ]
        );
    }
}
