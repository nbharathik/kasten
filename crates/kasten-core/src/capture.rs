//! How a quick capture becomes a card. Its first line is the
//! title and its other lines the body, so nothing appears twice: a short
//! thought is one clean card, a long one a page with a real title. A first
//! line that would lose something as a title (a to-do's box, a link's
//! address, code, math) stays in the body, and the title only names it.

use crate::extract::readable;

/// The longest title a capture gets before it is cut.
const TITLE_CHARS: usize = 80;

/// The title and the body for `markdown`, captured.
pub(crate) fn split(markdown: &str) -> (String, String) {
    let lines: Vec<&str> = markdown.lines().collect();
    let Some(at) = lines.iter().position(|l| !l.trim().is_empty()) else {
        return ("Quick note".to_owned(), String::new());
    };
    let first = lines[at].trim();
    let whole = body_of(&lines[at..]);
    let shown = readable(first);
    if shown.is_empty() || !plain(first) {
        return (
            label(if shown.is_empty() {
                "Quick note"
            } else {
                &shown
            }),
            whole,
        );
    }
    let rest = body_of(&lines[at + 1..]);
    if shown.chars().count() <= TITLE_CHARS {
        return (headline(&shown), rest);
    }
    // A long first line of plain text: its first sentence, if short, is
    // the title, and what follows it opens the body.
    if first == shown
        && let Some(end) = first_sentence(first)
    {
        let title = headline(first[..end].trim());
        let after = first[end..].trim();
        let body = if rest.is_empty() {
            format!("{after}\n")
        } else {
            format!("{after}\n{rest}")
        };
        return (title, body);
    }
    (label(&shown), whole)
}

/// A title without one closing full stop, as headlines go; "?", "!" and
/// an ellipsis stay.
fn headline(text: &str) -> String {
    match text.strip_suffix('.') {
        Some(rest) if !rest.ends_with('.') => rest.trim_end().to_owned(),
        _ => text.to_owned(),
    }
}

/// Lines as a body: no blank lines first, one newline last, or nothing.
fn body_of(lines: &[&str]) -> String {
    let start = lines
        .iter()
        .position(|l| !l.trim().is_empty())
        .unwrap_or(lines.len());
    let text = lines[start..].join("\n");
    let text = text.trim_end();
    if text.is_empty() {
        String::new()
    } else {
        format!("{text}\n")
    }
}

/// A line whose text a title keeps whole: prose or a heading, perhaps with
/// emphasis. Lists, quotes, tables, code, math, links and HTML are not.
fn plain(line: &str) -> bool {
    let block = line.starts_with(['-', '*', '+', '>', '|', '<', '`', '~', '$', '!'])
        || line.split_once(['.', ')']).is_some_and(|(n, rest)| {
            !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()) && rest.starts_with(' ')
        });
    let inline = ["[", "`", "$", "<", "http://", "https://", "|", "^"]
        .iter()
        .any(|mark| line.contains(mark));
    // "**Bold** start" and "*note*" are emphasis, not a list.
    let emphasis = line.starts_with("**") || (line.starts_with('*') && !line.starts_with("* "));
    (!block || emphasis) && !inline
}

/// The byte just past the first sentence of `line`, when it ends within a
/// title's length. Abbreviations such as "Dr." or "e.g." do not end one.
fn first_sentence(line: &str) -> Option<usize> {
    let mut chars = 0;
    for (i, c) in line.char_indices() {
        chars += 1;
        if chars > TITLE_CHARS {
            return None;
        }
        if !matches!(c, '.' | '!' | '?') || !line[i + 1..].starts_with(' ') {
            continue;
        }
        let word = line[..i].rsplit(' ').next().unwrap_or("");
        let short = word.chars().count() <= 2
            || word.contains('.')
            || matches!(word, "etc" | "vs" | "approx");
        if !short && line[..i].split_whitespace().count() >= 3 {
            return Some(i + 1);
        }
    }
    None
}

/// `text` as a title: whole when it fits, else cut at a word and marked "…".
fn label(text: &str) -> String {
    if text.chars().count() <= TITLE_CHARS {
        return text.to_owned();
    }
    let cut: String = text.chars().take(TITLE_CHARS).collect();
    let cut = match cut.rfind(' ') {
        Some(space) if space > TITLE_CHARS / 2 => cut[..space].to_owned(),
        _ => cut,
    };
    format!("{}…", cut.trim_end_matches([' ', ',', ';', ':', '-']))
}
