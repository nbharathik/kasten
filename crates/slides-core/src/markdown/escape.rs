//! Writing text so that it reads back as the same text: backslashes before
//! what would otherwise be markup, and the spans that carry their contents
//! whole (code, math, addresses).

use super::scan::{ESCAPABLE, math_span};

/// An empty underline. It reads as nothing, so it can stand between things
/// that would otherwise run together or be trimmed away.
pub(super) const ISO: &str = "<u></u>";

/// How text is escaped.
#[derive(Clone, Copy)]
pub(super) struct Esc {
    /// Escape every character that could start markup, not just those that
    /// would here.
    pub full: bool,
    /// The text is the text of a link, where brackets must balance.
    pub in_link: bool,
    /// The text starts a line, where a list or heading marker would count.
    pub line_start: bool,
}

pub(super) fn escape(t: &str, esc: Esc) -> String {
    let chars: Vec<char> = t.chars().collect();
    // The places where a line starts, and a marker would count: the start of
    // the text if it starts a line, and after each line break inside it.
    let mut marked = vec![false; chars.len()];
    if esc.line_start
        && let Some(at) = line_start_marker(&chars)
    {
        marked[at] = true;
    }
    for (k, &c) in chars.iter().enumerate() {
        if c == '\n'
            && let Some(at) = line_start_marker(&chars[k + 1..])
        {
            marked[k + 1 + at] = true;
        }
    }
    let last_bracket = chars.iter().rposition(|&c| c == ']');
    let mut out = String::with_capacity(t.len() + 4);
    for (k, &c) in chars.iter().enumerate() {
        let prev = k.checked_sub(1).map(|j| chars[j]);
        let next = chars.get(k + 1).copied();
        let alnum = |c: Option<char>| c.is_some_and(char::is_alphanumeric);
        let escaped = marked[k]
            || match c {
                '\\' => esc.full || next.is_none_or(|n| ESCAPABLE.contains(n)),
                '*' | '`' | '$' => true,
                '_' => esc.full || !(alnum(prev) && alnum(next)),
                '~' => esc.full || prev == Some('~') || next == Some('~'),
                '[' => esc.full || esc.in_link || last_bracket.is_some_and(|j| j > k),
                ']' => esc.full || esc.in_link,
                '(' | ')' | '#' | '>' => esc.full,
                '<' => esc.full || next.is_none_or(|n| n.is_ascii_alphabetic() || n == '/'),
                _ => false,
            };
        if escaped {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// Where a backslash keeps the start of a line from reading as a list item,
/// heading or quote. (A `*` is always escaped, so it needs no help.)
fn line_start_marker(c: &[char]) -> Option<usize> {
    let blank = |k: usize| c.get(k).is_none_or(|x| x.is_whitespace());
    match *c.first()? {
        '-' | '+' | '>' if blank(1) => Some(0),
        '#' => blank(c.iter().take_while(|&&x| x == '#').count()).then_some(0),
        d if d.is_ascii_digit() => {
            let n = c.iter().take_while(|x| x.is_ascii_digit()).count();
            let marker = (1..=9).contains(&n) && matches!(c.get(n), Some('.' | ')'));
            (marker && blank(n + 1)).then_some(n)
        }
        _ => None,
    }
}

/// `t` as a code span, with as many backticks around it as it takes.
pub(super) fn code_span(t: &str) -> String {
    let mut runs = Vec::new();
    let mut n = 0;
    for c in t.chars().chain(std::iter::once(' ')) {
        if c == '`' {
            n += 1;
        } else {
            if n > 0 {
                runs.push(n);
            }
            n = 0;
        }
    }
    let mut width = 1;
    while runs.contains(&width) {
        width += 1;
    }
    // A reader drops one space from each end when both are there.
    let pad = t.starts_with('`')
        || t.ends_with('`')
        || (t.starts_with(' ') && t.ends_with(' ') && t.chars().any(|c| c != ' '));
    let (bar, space) = ("`".repeat(width), if pad { " " } else { "" });
    format!("{bar}{space}{t}{space}{bar}")
}

/// `t` as math, if the scanner reads it back whole: with `$` around it, or
/// `$$` when it holds a `$` of its own.
pub(super) fn math_text(t: &str) -> Option<String> {
    ["$", "$$"].iter().find_map(|bar| {
        let text = format!("{bar}{t}{bar}");
        let chars: Vec<char> = text.chars().collect();
        (math_span(&chars, 0) == Some((t.to_owned(), chars.len()))).then_some(text)
    })
}

/// An address as it goes between parentheses: spaces become `%20`, and a
/// backslash or parenthesis is escaped.
pub(super) fn url_text(url: &str) -> String {
    let mut out = String::new();
    for c in url.chars() {
        if c.is_whitespace() {
            for byte in c.to_string().bytes() {
                out.push_str(&format!("%{byte:02X}"));
            }
        } else {
            if matches!(c, '\\' | '(' | ')') {
                out.push('\\');
            }
            out.push(c);
        }
    }
    out
}

/// Whether `<url>` reads back as a link whose text is the address.
pub(super) fn autolinkable(url: &str) -> bool {
    ["http://", "https://", "mailto:"]
        .iter()
        .any(|p| url.len() > p.len() && url.starts_with(p))
        && !url
            .chars()
            .any(|c| c.is_whitespace() || c == '<' || c == '>')
}
