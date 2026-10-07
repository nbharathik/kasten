//! Finding the extent of inline constructs: code, math, links, autolinks and
//! tags. Each scanner looks only forward from where it is asked and either
//! finds the whole construct or says there is none, so a marker that does not
//! close costs nothing but itself.

use std::ops::Range;

/// The characters a backslash can escape. Besides the ones that start inline
/// markup it covers `- + .` so a line can be kept from reading as a list.
pub(super) const ESCAPABLE: &str = "\\*_~`[]()<>$#-+.";

/// How many `ch` there are in a row from `i`.
pub(super) fn run_len(c: &[char], i: usize, ch: char) -> usize {
    c[i..].iter().take_while(|&&x| x == ch).count()
}

/// Where a code span opened by `n` backticks ending before `from` closes: the
/// next run of exactly `n` backticks.
pub(super) fn code_end(c: &[char], from: usize, n: usize) -> Option<usize> {
    let mut j = from;
    while j < c.len() {
        if c[j] == '`' {
            let m = run_len(c, j, '`');
            if m == n {
                return Some(j);
            }
            j += m;
        } else {
            j += 1;
        }
    }
    None
}

/// The text of a code span: one space is dropped from each end when both are
/// there, so a span can begin or end with a backtick.
pub(super) fn code_text(inner: &[char]) -> String {
    let padded = inner.len() > 2
        && inner[0] == ' '
        && inner[inner.len() - 1] == ' '
        && inner.iter().any(|&x| x != ' ');
    let inner = if padded {
        &inner[1..inner.len() - 1]
    } else {
        inner
    };
    inner.iter().collect()
}

/// A math span at `i`: its LaTeX and the index after it. It needs a non-space
/// right after the opening `$` and right before the closing one, and no digit
/// right after that, so prices such as "$5 and $6" stay text. The first `$`
/// (or `$$`) after the opener decides; `\$` never closes.
pub(super) fn math_span(c: &[char], i: usize) -> Option<(String, usize)> {
    let n = if c.get(i + 1) == Some(&'$') { 2 } else { 1 };
    let start = i + n;
    if c.get(start).is_none_or(|x| x.is_whitespace()) {
        return None;
    }
    let mut j = start;
    while j < c.len() {
        match c[j] {
            '\\' => j += 2,
            '$' if n == 1 || c.get(j + 1) == Some(&'$') => {
                let after = j + n;
                let fits = j > start
                    && !c[j - 1].is_whitespace()
                    && !c.get(after).is_some_and(|x| x.is_ascii_digit());
                return fits.then(|| (c[start..j].iter().collect(), after));
            }
            _ => j += 1,
        }
    }
    None
}

/// `[text](url)`: the range of the text, the address and the index after it.
pub(super) struct Link {
    pub text: Range<usize>,
    pub url: String,
    pub end: usize,
}

pub(super) fn link_at(c: &[char], i: usize) -> Option<Link> {
    let mut depth = 1;
    let mut j = i + 1;
    while j < c.len() {
        match c[j] {
            '\\' => j += 2,
            '`' => {
                let n = run_len(c, j, '`');
                j = code_end(c, j + n, n).map_or(j + n, |e| e + n);
            }
            '$' => j = math_span(c, j).map_or(j + 1, |(_, end)| end),
            '[' => {
                depth += 1;
                j += 1;
            }
            ']' => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
                j += 1;
            }
            _ => j += 1,
        }
    }
    if depth != 0 || j >= c.len() || j == i + 1 || c.get(j + 1) != Some(&'(') {
        return None;
    }
    let (url, end) = destination(c, j + 2)?;
    Some(Link {
        text: i + 1..j,
        url,
        end,
    })
}

/// The address after `(`: no spaces, balanced parentheses, escapes allowed.
fn destination(c: &[char], from: usize) -> Option<(String, usize)> {
    let mut url = String::new();
    let mut depth = 1;
    let mut j = from;
    while j < c.len() {
        match c[j] {
            '\\' if c.get(j + 1).is_some_and(|&n| ESCAPABLE.contains(n)) => {
                url.push(c[j + 1]);
                j += 2;
                continue;
            }
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return (!url.is_empty()).then_some((url, j + 1));
                }
            }
            x if x.is_whitespace() => return None,
            _ => {}
        }
        url.push(c[j]);
        j += 1;
    }
    None
}

/// `<https://x.y>`: the address and the index after it.
pub(super) fn autolink(c: &[char], i: usize) -> Option<(String, usize)> {
    let end = i
        + 1
        + c[i + 1..]
            .iter()
            .position(|&x| x == '>' || x == '<' || x.is_whitespace())?;
    if c[end] != '>' {
        return None;
    }
    let url: String = c[i + 1..end].iter().collect();
    ["http://", "https://", "mailto:"]
        .iter()
        .any(|p| url.len() > p.len() && url.starts_with(p))
        .then_some((url, end + 1))
}

/// `<u>`, `</u>` and the same for `b`, `i` and `s`: the name, whether it
/// opens, and the index after it.
pub(super) fn tag_at(c: &[char], i: usize) -> Option<(char, bool, usize)> {
    let (open, k) = if c.get(i + 1) == Some(&'/') {
        (false, i + 2)
    } else {
        (true, i + 1)
    };
    let name = *c.get(k)?;
    (matches!(name, 'u' | 'b' | 'i' | 's') && c.get(k + 1) == Some(&'>')).then_some((
        name,
        open,
        k + 2,
    ))
}
