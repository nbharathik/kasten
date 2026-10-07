//! Links and tags in imported Markdown, found outside code: `[[wiki]]` and
//! `![[embed]]` links, `[text](target)` and `![alt](target)` links, and
//! Obsidian's inline `#tags`. Rewriting changes only the links it is asked
//! to; every other byte stays as it was.

/// A link as written.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Link {
    /// `[[target#heading|alias]]`; `![[…]]` when `embed`. Inside a table
    /// the alias follows `\|` (`escaped_pipe`).
    Wiki {
        embed: bool,
        target: String,
        heading: Option<String>,
        alias: Option<String>,
        escaped_pipe: bool,
    },
    /// `[text](destination "title")`; `![…](…)` when `image`. The title is
    /// kept with its quotes.
    Markdown {
        image: bool,
        text: String,
        destination: String,
        title: Option<String>,
    },
}

/// A fence that opens a code block (``` or ~~~, three or more) or `$$`.
fn fence_of(line: &str) -> Option<(u8, usize)> {
    let trimmed = line.trim_end_matches(['\n', '\r']);
    let body = trimmed.trim_start_matches(' ');
    if trimmed.len() - body.len() > 3 {
        return None;
    }
    if body.trim_end() == "$$" {
        return Some((b'$', 2));
    }
    let first = *body.as_bytes().first()?;
    if first != b'`' && first != b'~' {
        return None;
    }
    let count = body.bytes().take_while(|&b| b == first).count();
    (count >= 3).then_some((first, count))
}

/// Whether `line` closes a block opened by `open`.
fn closes(line: &str, open: (u8, usize)) -> bool {
    fence_of(line).is_some_and(|(c, n)| {
        let rest = line.trim().trim_start_matches(c as char);
        c == open.0 && n >= open.1 && rest.is_empty()
    })
}

/// The lines outside code blocks, each with whether it is inside one.
fn lines(body: &str) -> Vec<(&str, bool)> {
    let mut open: Option<(u8, usize)> = None;
    body.split_inclusive('\n')
        .map(|line| match open {
            Some(fence) => {
                if closes(line, fence) {
                    open = None;
                }
                (line, true)
            }
            None => {
                open = fence_of(line);
                (line, open.is_some())
            }
        })
        .collect()
}

/// Byte ranges of the line's inline code spans, backticks included.
fn code_spans(line: &str) -> Vec<(usize, usize)> {
    let bytes = line.as_bytes();
    let mut spans = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'`' || (i > 0 && bytes[i - 1] == b'\\') {
            i += 1;
            continue;
        }
        let run = bytes[i..].iter().take_while(|&&b| b == b'`').count();
        let mut j = i + run;
        let mut end = None;
        while j < bytes.len() {
            if bytes[j] == b'`' {
                let close = bytes[j..].iter().take_while(|&&b| b == b'`').count();
                if close == run {
                    end = Some(j + close);
                    break;
                }
                j += close;
            } else {
                j += 1;
            }
        }
        match end {
            Some(end) => {
                spans.push((i, end));
                i = end;
            }
            None => i += run,
        }
    }
    spans
}

/// Replaces links outside code with what `change` returns for them.
pub(crate) fn rewrite_links(body: &str, mut change: impl FnMut(&Link) -> Option<String>) -> String {
    let mut out = String::with_capacity(body.len());
    for (line, code) in lines(body) {
        if code {
            out.push_str(line);
        } else {
            out.push_str(&rewrite_line(line, &mut change));
        }
    }
    out
}

fn rewrite_line(line: &str, change: &mut impl FnMut(&Link) -> Option<String>) -> String {
    let code = code_spans(line);
    let bytes = line.as_bytes();
    let mut out = String::new();
    let (mut i, mut copied) = (0, 0);
    while i < bytes.len() {
        if let Some(&(_, end)) = code.iter().find(|(start, _)| *start == i) {
            i = end;
            continue;
        }
        let starts = bytes[i] == b'[' || (bytes[i] == b'!' && bytes.get(i + 1) == Some(&b'['));
        let found = if starts && (i == 0 || bytes[i - 1] != b'\\') {
            parse_link(line, i, &code)
        } else {
            None
        };
        let Some((end, link)) = found else {
            i += 1;
            continue;
        };
        match change(&link) {
            Some(new) => {
                out.push_str(&line[copied..i]);
                out.push_str(&new);
                copied = end;
                i = end;
            }
            // Links inside the text are looked at too.
            None if matches!(link, Link::Markdown { .. }) => {
                i += if bytes[i] == b'!' { 2 } else { 1 };
            }
            None => i = end,
        }
    }
    out.push_str(&line[copied..]);
    out
}

fn in_code(code: &[(usize, usize)], at: usize) -> bool {
    code.iter().any(|&(start, end)| at >= start && at < end)
}

/// The link starting at `i` (`[` or `!`), and where it ends.
fn parse_link(line: &str, i: usize, code: &[(usize, usize)]) -> Option<(usize, Link)> {
    let bytes = line.as_bytes();
    let bang = bytes[i] == b'!';
    let open = i + usize::from(bang);
    if line[open..].starts_with("[[") {
        let inner_start = open + 2;
        let close = inner_start + line[inner_start..].find("]]")?;
        let inner = &line[inner_start..close];
        if inner.is_empty() || inner.contains("[[") || in_code(code, close) {
            return None;
        }
        let (target, alias, escaped_pipe) = match inner.find('|') {
            Some(p) if p > 0 && inner.as_bytes()[p - 1] == b'\\' => {
                (&inner[..p - 1], Some(&inner[p + 1..]), true)
            }
            Some(p) => (&inner[..p], Some(&inner[p + 1..]), false),
            None => (inner, None, false),
        };
        let (target, heading) = match target.find('#') {
            Some(h) => (&target[..h], Some(&target[h + 1..])),
            None => (target, None),
        };
        let link = Link::Wiki {
            embed: bang,
            target: target.to_owned(),
            heading: heading.map(str::to_owned),
            alias: alias.map(str::to_owned),
            escaped_pipe,
        };
        return Some((close + 2, link));
    }
    // `[text]`, brackets inside balanced.
    let mut depth = 0usize;
    let mut j = open;
    let close = loop {
        match bytes.get(j)? {
            b'\\' => j += 1,
            b'[' => depth += 1,
            b']' => {
                depth -= 1;
                if depth == 0 {
                    break j;
                }
            }
            _ => {}
        }
        j += 1;
    };
    if bytes.get(close + 1) != Some(&b'(') {
        return None;
    }
    let mut k = close + 2;
    while matches!(bytes.get(k), Some(b' ' | b'\t')) {
        k += 1;
    }
    let destination;
    if bytes.get(k) == Some(&b'<') {
        let end = k + 1 + line[k + 1..].find('>')?;
        destination = &line[k + 1..end];
        k = end + 1;
    } else {
        let start = k;
        let mut parens = 0usize;
        while let Some(&b) = bytes.get(k) {
            match b {
                b' ' | b'\t' | b'\n' | b'\r' => break,
                b'(' => parens += 1,
                b')' if parens == 0 => break,
                b')' => parens -= 1,
                b'\\' => k += 1,
                _ => {}
            }
            k += 1;
        }
        destination = &line[start..k.min(line.len())];
    }
    while matches!(bytes.get(k), Some(b' ' | b'\t')) {
        k += 1;
    }
    let mut title = None;
    if let Some(&q @ (b'"' | b'\'' | b'(')) = bytes.get(k) {
        let end_quote = if q == b'(' { b')' } else { q };
        let end = k + 1 + bytes[k + 1..].iter().position(|&b| b == end_quote)?;
        title = Some(line[k..=end].to_owned());
        k = end + 1;
        while matches!(bytes.get(k), Some(b' ' | b'\t')) {
            k += 1;
        }
    }
    if bytes.get(k) != Some(&b')') {
        return None;
    }
    let link = Link::Markdown {
        image: bang,
        text: line[open + 1..close].to_owned(),
        destination: destination.to_owned(),
        title,
    };
    Some((k + 1, link))
}

/// `[[title#heading|alias]]` as Kasten writes links.
pub(crate) fn wiki_link(
    embed: bool,
    title: &str,
    heading: Option<&str>,
    alias: Option<&str>,
    escaped_pipe: bool,
) -> String {
    let mut out = String::from(if embed { "![[" } else { "[[" });
    out.push_str(title);
    if let Some(heading) = heading.filter(|h| !h.is_empty()) {
        out.push('#');
        out.push_str(heading);
    }
    if let Some(alias) = alias {
        out.push_str(if escaped_pipe { "\\|" } else { "|" });
        out.push_str(alias);
    }
    out.push_str("]]");
    out
}

fn is_tag_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '-' | '/')
}

/// Obsidian's inline tags outside code, each once (the first spelling):
/// `#tag` or `#nested/tag` after a space or at a line's start, not `#123`.
pub(crate) fn inline_tags(body: &str) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    for (line, code) in lines(body) {
        if code {
            continue;
        }
        let spans = code_spans(line);
        let mut previous: Option<char> = None;
        for (at, c) in line.char_indices() {
            let after_space = previous.is_none_or(char::is_whitespace);
            previous = Some(c);
            if c != '#' || !after_space || in_code(&spans, at) {
                continue;
            }
            let tag: String = line[at + 1..]
                .chars()
                .take_while(|&c| is_tag_char(c))
                .collect();
            let tag = tag.trim_end_matches('/');
            if tag.is_empty() || tag.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            if !tags.iter().any(|t| t.to_lowercase() == tag.to_lowercase()) {
                tags.push(tag.to_owned());
            }
        }
    }
    tags
}

/// A vault path as a Markdown link's target: characters a link or a URL
/// reads specially (spaces, `#`, `%`, brackets…) percent-encoded, letters in
/// any script kept as they are.
pub(crate) fn link_path(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for c in path.chars() {
        if c.is_ascii_alphanumeric() || !c.is_ascii() || "/-._~!$&'*+,;=:@".contains(c) {
            out.push(c);
        } else {
            out.push_str(&format!("%{:02X}", c as u32));
        }
    }
    out
}

/// The vault path `to` as a link from the note at `from`.
pub(crate) fn relative(from: &str, to: &str) -> String {
    format!(
        "{}{}",
        "../".repeat(from.matches('/').count()),
        link_path(to)
    )
}

/// `%XX` escapes read as UTF-8; a `%` that starts no escape stays.
pub(crate) fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex = |b: u8| (b as char).to_digit(16);
        if bytes[i] == b'%'
            && let (Some(h), Some(l)) = (
                bytes.get(i + 1).and_then(|&b| hex(b)),
                bytes.get(i + 2).and_then(|&b| hex(b)),
            )
        {
            out.push((h * 16 + l) as u8);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The body without a first `# heading` that only repeats the title, as
/// Notion and many Markdown notes begin; Kasten shows the title above.
pub(crate) fn without_title(body: &str, title: &str) -> String {
    let start = body.len() - body.trim_start_matches(['\n', '\r']).len();
    let rest = &body[start..];
    let (first, after) = rest.split_once('\n').unwrap_or((rest, ""));
    let Some(heading) = first.trim_end_matches('\r').strip_prefix("# ") else {
        return body.to_owned();
    };
    let heading = heading.trim().trim_end_matches('#').trim();
    if heading.to_lowercase() != title.trim().to_lowercase() {
        return body.to_owned();
    }
    after.trim_start_matches(['\n', '\r']).to_owned()
}

#[cfg(test)]
#[path = "markdown_tests.rs"]
mod tests;
