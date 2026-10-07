//! Focus lists. A code block with `focus: ["1", "2-3", "4,6-10"]` looks at
//! line 1 on the first step, lines 2 and 3 on the second, and lines 4, 6 to 10
//! on the third; the other lines are dimmed. Line 1 is the first line of the
//! code, whatever number `firstLine` gives it on the slide.

use std::collections::BTreeMap;

use crate::model::StepState;

/// The lines, from 1, that one entry of a focus list names among `count` lines.
/// It reads `3`, `2-4`, `4,6-10`, `3-` (to the end), `all` and `*`, tolerates spaces and
/// long dashes, and ignores whatever it cannot read and numbers beyond the code.
pub fn lines_of(entry: &str, count: usize) -> Vec<usize> {
    let text: String = entry
        .chars()
        .map(|c| match c {
            '\u{2010}'..='\u{2015}' | '\u{2212}' => '-',
            ';' => ',',
            c => c,
        })
        .collect();
    let lower = text.trim().to_ascii_lowercase();
    if matches!(lower.as_str(), "all" | "*" | "every") {
        return (1..=count).collect();
    }
    let mut wanted = vec![false; count];
    // "2 - 4" is "2-4"; spaces alone separate items.
    let joined = join_dashes(&text);
    for item in joined.split(|c: char| c == ',' || c.is_whitespace()) {
        let (from, to) = match item.split_once('-') {
            Some(("", "")) => continue,
            Some((_, b)) if b.contains('-') => continue,
            Some((a, b)) => (bound(a, 1), bound(b, count as u64)),
            None => (number(item), number(item)),
        };
        let (Some(a), Some(b)) = (from, to) else {
            continue;
        };
        let (a, b) = (a.min(b), a.max(b));
        // Only the part that lies in the code is walked, however far the numbers reach.
        let first = a.max(1);
        let last = b.min(count as u64);
        for line in first..=last {
            wanted[(line - 1) as usize] = true;
        }
    }
    wanted
        .iter()
        .enumerate()
        .filter(|(_, on)| **on)
        .map(|(i, _)| i + 1)
        .collect()
}

/// `text` with the spaces around each dash taken out.
fn join_dashes(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut pending = String::new();
    for c in text.chars() {
        if c.is_whitespace() {
            pending.push(c);
        } else if c == '-' {
            pending.clear();
            out.push('-');
        } else {
            let after_dash = out.ends_with('-');
            if !after_dash {
                out.push_str(&pending);
            }
            pending.clear();
            out.push(c);
        }
    }
    out.push_str(&pending);
    out
}

/// One end of a range: the number, `open` when there is none, nothing when it is not a number.
fn bound(text: &str, open: u64) -> Option<u64> {
    if text.trim().is_empty() {
        Some(open)
    } else {
        number(text)
    }
}

fn number(text: &str) -> Option<u64> {
    let digits = text.trim();
    if digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    // A number too long for 64 bits is a number beyond any code.
    Some(digits.parse().unwrap_or(u64::MAX))
}

/// What each of `count` lines looks like at each step, as the `step_states` a line
/// stores: only where the state changes. Step 0 shows every line as it is. A step
/// whose entry names no line of the code has no focus, so it shows every line.
pub fn states(focus: &[String], count: usize) -> Vec<BTreeMap<u32, StepState>> {
    let sets: Vec<Vec<usize>> = focus.iter().map(|entry| lines_of(entry, count)).collect();
    (1..=count)
        .map(|line| {
            let mut states = BTreeMap::new();
            let mut before = StepState::Normal;
            for (k, set) in sets.iter().enumerate() {
                let now = if set.is_empty() || set.binary_search(&line).is_ok() {
                    StepState::Normal
                } else {
                    StepState::Dimmed
                };
                if now != before {
                    states.insert(u32::try_from(k + 1).unwrap_or(u32::MAX), now.clone());
                    before = now;
                }
            }
            states
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_lines_ranges_and_lists_are_read() {
        assert_eq!(lines_of("1", 10), [1]);
        assert_eq!(lines_of("2-3", 10), [2, 3]);
        assert_eq!(lines_of("4,6-8", 10), [4, 6, 7, 8]);
        assert_eq!(
            lines_of("8-6", 10),
            [6, 7, 8],
            "a range backwards is the same range"
        );
        assert_eq!(lines_of("3-", 5), [3, 4, 5]);
        assert_eq!(lines_of("all", 3), [1, 2, 3]);
        assert_eq!(lines_of("*", 2), [1, 2]);
    }

    #[test]
    fn spaces_long_dashes_and_semicolons_are_forgiven() {
        assert_eq!(lines_of(" 2 – 4 ", 10), [2, 3, 4], "an en dash");
        assert_eq!(lines_of("2 — 4", 10), [2, 3, 4], "an em dash");
        assert_eq!(lines_of("1 ; 3", 10), [1, 3]);
        assert_eq!(lines_of("1 3 5-6", 10), [1, 3, 5, 6]);
        assert_eq!(lines_of("2 -4", 10), [2, 3, 4]);
    }

    #[test]
    fn what_is_out_of_range_or_not_a_number_is_ignored() {
        assert_eq!(lines_of("9-99", 10), [9, 10]);
        assert_eq!(lines_of("50", 10), Vec::<usize>::new());
        assert_eq!(lines_of("0", 10), Vec::<usize>::new());
        assert_eq!(lines_of("line 3, x, 4", 10), [3, 4]);
        assert_eq!(lines_of("", 10), Vec::<usize>::new());
        assert_eq!(lines_of("1-99999999999999999999999", 3), [1, 2, 3]);
        assert_eq!(lines_of("a-5", 10), Vec::<usize>::new());
        assert_eq!(lines_of("1-3-5", 10), Vec::<usize>::new());
        assert_eq!(lines_of("-", 10), Vec::<usize>::new());
        assert_eq!(lines_of("1", 0), Vec::<usize>::new());
    }

    #[test]
    fn each_line_stores_only_where_its_state_changes() {
        let focus: Vec<String> = ["1", "2-3", "4,6-10"]
            .iter()
            .map(|s| (*s).to_owned())
            .collect();
        let s = states(&focus, 10);
        assert_eq!(s.len(), 10);
        // Line 1 is in focus at step 1, then out of it for good.
        assert_eq!(s[0], BTreeMap::from([(2, StepState::Dimmed)]));
        // Line 2 waits at step 1, is the focus at step 2, and is dimmed again at 3.
        assert_eq!(
            s[1],
            BTreeMap::from([
                (1, StepState::Dimmed),
                (2, StepState::Normal),
                (3, StepState::Dimmed)
            ])
        );
        // Line 5 is never in focus: dimmed from the first step on.
        assert_eq!(s[4], BTreeMap::from([(1, StepState::Dimmed)]));
        assert_eq!(
            s[5],
            BTreeMap::from([(1, StepState::Dimmed), (3, StepState::Normal)])
        );
        // Nothing is stored for step 0, which shows every line.
        assert!(s.iter().all(|m| !m.contains_key(&0)));
    }

    #[test]
    fn a_step_that_names_no_line_shows_every_line() {
        let focus: Vec<String> = ["2", "99", ""].iter().map(|s| (*s).to_owned()).collect();
        let s = states(&focus, 3);
        assert_eq!(
            s[0],
            BTreeMap::from([(1, StepState::Dimmed), (2, StepState::Normal)])
        );
        assert_eq!(
            s[1],
            BTreeMap::new(),
            "in focus at step 1, and every line shows after"
        );
    }

    #[test]
    fn no_focus_stores_nothing() {
        assert!(states(&[], 4).iter().all(BTreeMap::is_empty));
        assert!(states(&["1".to_owned()], 0).is_empty());
    }
}
