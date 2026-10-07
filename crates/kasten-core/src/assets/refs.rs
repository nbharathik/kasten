//! The pictures a note shows: `![alt](path)`, `<img src="path">` and
//! `![[name.png]]`, found the way the page editor reads them (code stays
//! out) and resolved the way it resolves them, so "used in" agrees with what
//! a person sees.

use crate::extract::{fence_after, wiki_targets, without_code_spans};

/// What a reference to a picture names.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Ref {
    /// A path in the vault.
    Path(String),
    /// A file name to look for, as `![[figure.png]]` gives.
    Name(String),
}

fn has_scheme(link: &str) -> bool {
    let mut chars = link.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && link
            .chars()
            .skip(1)
            .find(|c| !(c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-')))
            == Some(':')
}

fn hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// `%XX` escapes turned back, except those for the characters a URL keeps
/// escaped (as JavaScript's `decodeURI` does); the text as written when the
/// result is not UTF-8.
fn decoded(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && let (Some(hi), Some(lo)) = (
                bytes.get(i + 1).and_then(|b| hex(*b)),
                bytes.get(i + 2).and_then(|b| hex(*b)),
            )
        {
            let byte = hi << 4 | lo;
            if b";/?:@&=+$,#".contains(&byte) {
                out.extend_from_slice(&bytes[i..i + 3]);
            } else {
                out.push(byte);
            }
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).unwrap_or_else(|_| text.to_owned())
}

/// The vault path a link in the note at `from` points at; None for web
/// links, anchors, and links that leave the vault. A leading `/` starts at
/// the vault. The same reading as the page editor's `resolveLink`.
pub fn resolve_link(from: &str, src: &str) -> Option<String> {
    let link = src.trim();
    if link.is_empty() || has_scheme(link) || link.starts_with("//") || link.starts_with('#') {
        return None;
    }
    let path = decoded(link.split(['?', '#']).next().unwrap_or(""));
    let mut parts: Vec<&str> = if path.starts_with('/') {
        Vec::new()
    } else {
        let mut folder: Vec<&str> = from.split('/').collect();
        folder.pop();
        folder
    };
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            name => parts.push(name),
        }
    }
    (!parts.is_empty()).then(|| parts.join("/"))
}

/// Where the `]` that closes an alt text is, allowing brackets inside it.
fn closing_bracket(text: &str) -> Option<usize> {
    let mut depth = 0usize;
    for (i, c) in text.char_indices() {
        match c {
            '[' => depth += 1,
            ']' if depth == 0 => return Some(i),
            ']' => depth -= 1,
            _ => {}
        }
    }
    None
}

/// The destination of a link whose text is `after` the `(`: in angle
/// brackets, or up to a space or the closing parenthesis. A link that is
/// never closed by a `)` names nothing.
fn destination(after: &str) -> Option<&str> {
    let after = after.trim_start();
    let (dest, rest) = if let Some(inner) = after.strip_prefix('<') {
        let end = inner.find('>')?;
        (&inner[..end], &inner[end + 1..])
    } else {
        let mut depth = 0usize;
        let end = after.char_indices().find_map(|(i, c)| match c {
            '(' => {
                depth += 1;
                None
            }
            ')' if depth == 0 => Some(i),
            ')' => {
                depth -= 1;
                None
            }
            c if c.is_whitespace() => Some(i),
            _ => None,
        });
        let end = end.unwrap_or(after.len());
        (&after[..end], &after[end..])
    };
    rest.contains(')').then_some(dest)
}

/// The value of attribute `name` in an HTML tag.
fn attribute<'a>(tag: &'a str, lower: &str, name: &str) -> Option<&'a str> {
    let mut from = 0;
    while let Some(found) = lower[from..].find(name) {
        let at = from + found;
        from = at + name.len();
        if at == 0 || !lower.as_bytes()[at - 1].is_ascii_whitespace() {
            continue;
        }
        let Some(rest) = tag[from..].trim_start().strip_prefix('=') else {
            continue;
        };
        let rest = rest.trim_start();
        return match rest.chars().next()? {
            quote @ ('"' | '\'') => rest[1..].find(quote).map(|end| &rest[1..1 + end]),
            _ => Some(
                rest.split(|c: char| c.is_whitespace() || c == '>')
                    .next()
                    .unwrap_or(rest),
            ),
        };
    }
    None
}

fn in_line(from: &str, line: &str, out: &mut Vec<Ref>) {
    let mut path = |dest: &str| out.push(Ref::Path(resolve_link(from, dest).unwrap_or_default()));
    let mut rest = line;
    while let Some(at) = rest.find("![") {
        let after = &rest[at + 2..];
        // `![[…]]` is an embed of the wiki kind, read below.
        if after.starts_with('[') {
            rest = after;
            continue;
        }
        let Some(close) = closing_bracket(after) else {
            break;
        };
        let tail = &after[close + 1..];
        if let Some(dest) = tail.strip_prefix('(').and_then(destination) {
            path(dest);
        }
        rest = tail;
    }
    let lower = line.to_ascii_lowercase();
    let mut from_at = 0;
    while let Some(found) = lower[from_at..].find("<img") {
        let start = from_at + found;
        let end = lower[start..].find('>').map_or(line.len(), |e| start + e);
        if let Some(src) = attribute(&line[start..end], &lower[start..end], "src") {
            path(src);
        }
        from_at = end;
    }
    for (target, embed) in wiki_targets(line) {
        if !embed || !slides_assets::is_picture_name(&target) {
            continue;
        }
        out.push(if target.contains('/') {
            Ref::Path(resolve_link("", &target).unwrap_or_default())
        } else {
            Ref::Name(target)
        });
    }
}

/// The pictures the note at `from` shows, as written in its `text`, in
/// order and without repeats. A reference that names no vault path is left
/// out.
pub fn image_refs(from: &str, text: &str) -> Vec<Ref> {
    let mut found = Vec::new();
    let mut fence = None;
    for raw in text.lines() {
        let line = raw.trim_end_matches('\r');
        let (after, marker) = fence_after(fence, line);
        fence = after;
        let maybe = line.contains("![")
            || (line.contains('<') && line.to_ascii_lowercase().contains("<img"));
        if marker || fence.is_some() || !maybe {
            continue;
        }
        if line.contains('`') {
            in_line(from, &without_code_spans(line), &mut found);
        } else {
            in_line(from, line, &mut found);
        }
    }
    found.retain(|r| !matches!(r, Ref::Path(p) if p.is_empty()));
    let mut seen = Vec::new();
    found.retain(|r| {
        let new = !seen.contains(r);
        if new {
            seen.push(r.clone());
        }
        new
    });
    found
}

#[cfg(test)]
mod tests;
