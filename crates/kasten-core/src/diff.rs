//! Line diffs: how much of a note an edit removes (the 40% guardrail) and a
//! unified diff for proposals under review.

use std::collections::HashMap;

/// The share of `old`'s bytes, by whole lines, that `new` no longer has.
/// Moving lines around removes nothing; changing a line removes it.
pub fn removed_fraction(old: &str, new: &str) -> f64 {
    let total: usize = old.lines().map(|l| l.trim().len()).sum();
    if total == 0 {
        return 0.0;
    }
    let mut kept: HashMap<&str, usize> = HashMap::new();
    for line in new.lines() {
        *kept.entry(line.trim()).or_default() += 1;
    }
    let mut removed = 0;
    for line in old.lines().map(str::trim) {
        match kept.get_mut(line) {
            Some(n) if *n > 0 => *n -= 1,
            _ => removed += line.len(),
        }
    }
    removed as f64 / total as f64
}

/// Lines longer than this many per side are shown as a whole replacement.
const MAX_LINES: usize = 3000;

enum Step<'a> {
    Same(&'a str),
    Gone(&'a str),
    Added(&'a str),
}

/// The steps from `a` to `b`, by a longest common subsequence of the lines
/// between their common start and end.
fn steps<'a>(a: &[&'a str], b: &[&'a str]) -> Vec<Step<'a>> {
    let start = a.iter().zip(b).take_while(|(x, y)| x == y).count();
    let end = a[start..]
        .iter()
        .rev()
        .zip(b[start..].iter().rev())
        .take_while(|(x, y)| x == y)
        .count();
    let (ma, mb) = (&a[start..a.len() - end], &b[start..b.len() - end]);
    let mut out: Vec<Step> = a[..start].iter().map(|l| Step::Same(l)).collect();
    if ma.len() > MAX_LINES || mb.len() > MAX_LINES {
        out.extend(ma.iter().map(|l| Step::Gone(l)));
        out.extend(mb.iter().map(|l| Step::Added(l)));
    } else {
        let (n, m) = (ma.len(), mb.len());
        let mut table = vec![0u32; (n + 1) * (m + 1)];
        let at = |i: usize, j: usize| i * (m + 1) + j;
        for i in (0..n).rev() {
            for j in (0..m).rev() {
                table[at(i, j)] = if ma[i] == mb[j] {
                    table[at(i + 1, j + 1)] + 1
                } else {
                    table[at(i + 1, j)].max(table[at(i, j + 1)])
                };
            }
        }
        let (mut i, mut j) = (0, 0);
        while i < n || j < m {
            if i < n && j < m && ma[i] == mb[j] {
                out.push(Step::Same(ma[i]));
                i += 1;
                j += 1;
            } else if i < n && (j == m || table[at(i + 1, j)] >= table[at(i, j + 1)]) {
                // Removals before additions, as git shows them.
                out.push(Step::Gone(ma[i]));
                i += 1;
            } else {
                out.push(Step::Added(mb[j]));
                j += 1;
            }
        }
    }
    out.extend(a[a.len() - end..].iter().map(|l| Step::Same(l)));
    out
}

/// For each line of `a`, the line of `b` it stays as in the diff from `a` to
/// `b`, or None where `b` no longer has it (agent marks trace lines back
/// through a note's versions with this).
pub(crate) fn kept_lines(a: &[&str], b: &[&str]) -> Vec<Option<usize>> {
    let mut out = Vec::with_capacity(a.len());
    let mut j = 0;
    for step in steps(a, b) {
        match step {
            Step::Same(_) => {
                out.push(Some(j));
                j += 1;
            }
            Step::Gone(_) => out.push(None),
            Step::Added(_) => j += 1,
        }
    }
    out
}

/// A unified diff of `old` to `new` with `context` lines around changes,
/// headed with `name`. Empty when they are the same.
pub fn unified(name: &str, old: &str, new: &str, context: usize) -> String {
    if old == new {
        return String::new();
    }
    let a: Vec<&str> = old.lines().collect();
    let b: Vec<&str> = new.lines().collect();
    let all = steps(&a, &b);
    let changed: Vec<usize> = all
        .iter()
        .enumerate()
        .filter(|(_, s)| !matches!(s, Step::Same(_)))
        .map(|(i, _)| i)
        .collect();
    let mut out = format!("--- a/{name}\n+++ b/{name}\n");
    let mut k = 0;
    while k < changed.len() {
        let from = changed[k].saturating_sub(context);
        let mut to = changed[k] + context + 1;
        while k + 1 < changed.len() && changed[k + 1] <= to + context {
            k += 1;
            to = changed[k] + context + 1;
        }
        let to = to.min(all.len());
        // Line numbers at the hunk's start on each side.
        let (mut la, mut lb) = (1, 1);
        for step in &all[..from] {
            match step {
                Step::Same(_) => {
                    la += 1;
                    lb += 1;
                }
                Step::Gone(_) => la += 1,
                Step::Added(_) => lb += 1,
            }
        }
        let hunk = &all[from..to];
        let count_a = hunk.iter().filter(|s| !matches!(s, Step::Added(_))).count();
        let count_b = hunk.iter().filter(|s| !matches!(s, Step::Gone(_))).count();
        out.push_str(&format!("@@ -{la},{count_a} +{lb},{count_b} @@\n"));
        for step in hunk {
            match step {
                Step::Same(l) => out.push_str(&format!(" {l}\n")),
                Step::Gone(l) => out.push_str(&format!("-{l}\n")),
                Step::Added(l) => out.push_str(&format!("+{l}\n")),
            }
        }
        k += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn measures_what_an_edit_removes() {
        assert_eq!(removed_fraction("", "anything"), 0.0);
        assert_eq!(removed_fraction("a\nb\n", "b\na\nc\n"), 0.0);
        assert!((removed_fraction("aaaa\nbbbb\n", "aaaa\n") - 0.5).abs() < 1e-9);
        assert_eq!(removed_fraction("one\ntwo\n", ""), 1.0);
        // Blank lines and indentation do not count.
        assert_eq!(removed_fraction("  x\n\n\n", "x\n"), 0.0);
    }

    #[test]
    fn finds_the_lines_a_change_kept() {
        let a = ["one", "two", "three", "four"];
        let b = ["zero", "one", "three", "four", "five"];
        assert_eq!(kept_lines(&a, &b), [Some(1), None, Some(2), Some(3)]);
        assert_eq!(kept_lines(&a, &[]), [None; 4]);
        assert_eq!(kept_lines(&[], &b), []);
    }

    #[test]
    fn writes_unified_diffs() {
        assert_eq!(unified("n.md", "same\n", "same\n", 3), "");
        let old = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n";
        let new = "1\n2\nthree\n4\n5\n6\n7\n8\n9\n10\neleven\n";
        assert_eq!(
            unified("n.md", old, new, 1),
            "--- a/n.md\n+++ b/n.md\n@@ -2,3 +2,3 @@\n 2\n-3\n+three\n 4\n@@ -10,1 +10,2 @@\n 10\n+eleven\n"
        );
        let joined = unified("n.md", "a\nb\nc\n", "a\nB\nc\nd\n", 3);
        assert_eq!(
            joined,
            "--- a/n.md\n+++ b/n.md\n@@ -1,3 +1,4 @@\n a\n-b\n+B\n c\n+d\n"
        );
    }
}
