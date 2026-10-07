//! Markdown as a reader sees it: a line without its block marks, link
//! brackets, emphasis or HTML tags, for excerpts, snippets, to-dos and
//! headings. Code spans stand as written.

/// At most `max` bytes of `text`, cut at a character boundary.
pub(crate) fn window(text: &str, max: usize) -> &str {
    if text.len() <= max {
        return text;
    }
    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

/// A Markdown line as a reader sees it: no block marks, link brackets,
/// emphasis marks or HTML tags.
pub fn readable(line: &str) -> String {
    inline_text(strip_block_marks(line))
}

/// The line without its quote, callout, heading, list and task marks.
fn strip_block_marks(line: &str) -> &str {
    let mut t = line.trim();
    loop {
        let before = t;
        for mark in ["> ", ">"] {
            if let Some(rest) = t.strip_prefix(mark) {
                t = rest.trim_start();
            }
        }
        if let Some(rest) = t.strip_prefix("[!")
            && let Some(end) = rest.find(']')
        {
            t = rest[end + 1..].trim_start();
        }
        let hashes = t.chars().take_while(|&c| c == '#').count();
        if (1..=6).contains(&hashes) && t[hashes..].starts_with(' ') {
            t = t[hashes..].trim_start();
        }
        if let Some((marker, rest)) = t.split_once(' ') {
            let numbered = marker
                .strip_suffix(['.', ')'])
                .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()));
            if matches!(marker, "-" | "*" | "+") || numbered {
                t = rest.trim_start();
            }
        }
        for box_ in ["[ ] ", "[x] ", "[X] "] {
            if let Some(rest) = t.strip_prefix(box_) {
                t = rest.trim_start();
            }
        }
        if t == before {
            break;
        }
    }
    t
}

/// Inline math at the start of `text`: its TeX, and its length with the
/// dollars. The editor's rule (Pandoc's, math-remark.ts): no space just
/// inside single dollars, and no digit right after them, so "$5 and $10"
/// stays two prices.
fn inline_math(text: &str) -> Option<(&str, usize)> {
    let dollars = if text.starts_with("$$") { 2 } else { 1 };
    let body = &text[dollars..];
    let end = window(body, 300).find(&text[..dollars])?;
    let tex = &body[..end];
    let len = dollars + end + dollars;
    let spaced = tex.starts_with(char::is_whitespace) || tex.ends_with(char::is_whitespace);
    let priced = text[len..].starts_with(|c: char| c.is_ascii_digit());
    if tex.trim().is_empty() || (dollars == 1 && (spaced || priced)) {
        return None;
    }
    Some((tex.trim(), len))
}

/// Text as a reader sees it: no link brackets, emphasis marks or HTML tags;
/// code spans and math as written.
pub(crate) fn inline_text(t: &str) -> String {
    let mut out = String::with_capacity(t.len());
    let mut rest = t;
    while !rest.is_empty() {
        // A code span's text stands as written, between matching tick runs.
        if rest.starts_with('`') {
            let ticks = rest.bytes().take_while(|&b| b == b'`').count();
            let fence = &rest[..ticks];
            if let Some(end) = window(&rest[ticks..], 300).find(fence)
                && !rest[ticks + end + ticks..].starts_with('`')
            {
                out.push_str(rest[ticks..ticks + end].trim());
                rest = &rest[ticks + end + ticks..];
                continue;
            }
            rest = &rest[ticks..];
            continue;
        }
        // Inline math reads as its TeX, which stands as written.
        if rest.starts_with('$')
            && let Some((tex, len)) = inline_math(rest)
        {
            out.push_str(tex);
            rest = &rest[len..];
            continue;
        }
        if let Some(after) = rest.strip_prefix("![[").or_else(|| rest.strip_prefix("[["))
            && let Some(end) = window(after, 300).find("]]")
        {
            let inner = &after[..end];
            let shown = inner.split_once('|').map_or_else(
                || inner.split('#').next().unwrap_or(inner),
                |(_, alias)| alias,
            );
            out.push_str(shown.trim());
            rest = &after[end + 2..];
            continue;
        }
        if rest.starts_with('<')
            && let Some(end) = rest.get(..rest.len().min(300)).and_then(|w| w.find('>'))
        {
            rest = &rest[end + 1..];
            continue;
        }
        if rest.starts_with('[')
            && let Some(close) = window(rest, 300).find("](")
            && let Some(end) = window(&rest[close..], 500).find(')')
        {
            out.push_str(&rest[1..close]);
            rest = &rest[close + end + 1..];
            continue;
        }
        // An escaped punctuation mark stands for itself; any other backslash,
        // as in TeX or a Windows path, is text (CommonMark).
        if let Some(after) = rest.strip_prefix('\\')
            && let Some(c) = after.chars().next().filter(char::is_ascii_punctuation)
        {
            out.push(c);
            rest = &after[1..];
            continue;
        }
        let skip = ["**", "__", "~~"].iter().find(|m| rest.starts_with(**m));
        if let Some(mark) = skip {
            rest = &rest[mark.len()..];
            continue;
        }
        // A single `*` or `_` between a word and a space or edge marks
        // emphasis; inside a word (`snake_case`, `2*3`) it is text.
        if rest.starts_with(['*', '_']) {
            let word = |c: Option<char>| c.is_some_and(char::is_alphanumeric);
            if word(out.chars().last()) != word(rest[1..].chars().next()) {
                rest = &rest[1..];
                continue;
            }
        }
        let c = rest.chars().next().unwrap_or(' ');
        out.push(c);
        rest = &rest[c.len_utf8()..];
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}
