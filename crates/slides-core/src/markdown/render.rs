//! Paragraphs to Markdown: what `parse` reads, written so that `parse` reads
//! it back the same. Each paragraph is written the plainest way that does,
//! checked by reading it, and a stubborn one falls back to escapes and then
//! to tags.

use super::blocks::{MAX_LEVEL, parse};
use super::escape::ISO;
use super::spans::{Seg, Style, render, runs_of, segments};
use crate::model::{ListKind, Paragraph};

/// The Markdown of `paragraphs`, one line each (more for a hard break or a
/// fence). Reading it with `parse` gives the paragraphs back; see the module
/// for what Markdown leaves out.
pub fn to_markdown(paragraphs: &[Paragraph]) -> String {
    let mut blocks: Vec<(String, bool)> = Vec::new();
    let mut numbers = Numbers::default();
    let mut i = 0;
    while i < paragraphs.len() {
        if is_code(&paragraphs[i]) {
            let n = paragraphs[i..].iter().take_while(|p| is_code(p)).count();
            blocks.push((fence(&paragraphs[i..i + n]), true));
            numbers.start_over();
            i += n;
        } else {
            if let Some(block) = block(&paragraphs[i], &mut numbers) {
                blocks.push((block, false));
            }
            i += 1;
        }
    }
    let texts: Vec<&str> = blocks.iter().map(|(text, _)| text.as_str()).collect();
    let mut out = texts.join("\n");
    if blocks.last().is_some_and(|(_, fence)| *fence) {
        out.push('\n');
    }
    out
}

fn is_code(p: &Paragraph) -> bool {
    p.style.as_deref() == Some("code")
}

/// Counts numbered items per level, so that they run 1, 2, 3.
#[derive(Default)]
struct Numbers([u32; MAX_LEVEL + 1]);

impl Numbers {
    fn start_over(&mut self) {
        self.0 = [0; MAX_LEVEL + 1];
    }

    /// Notes an item at `level`; the number it gets if it is a numbered one.
    fn item(&mut self, level: usize, numbered: bool) -> u32 {
        self.0[level + 1..].fill(0);
        self.0[level] = if numbered { self.0[level] + 1 } else { 0 };
        self.0[level]
    }
}

/// The lines of code as one fence, longer than any backtick run inside.
fn fence(lines: &[Paragraph]) -> String {
    let texts: Vec<String> = lines
        .iter()
        .flat_map(|p| p.text().split('\n').map(str::to_owned).collect::<Vec<_>>())
        .collect();
    let longest = texts
        .iter()
        .map(|t| t.split(|c| c != '`').map(str::len).max().unwrap_or(0))
        .max()
        .unwrap_or(0);
    let bar = "`".repeat((longest + 1).max(3));
    format!("{bar}\n{}\n{bar}", texts.join("\n"))
}

/// What comes before the text of a paragraph, and its list level.
fn prefix(p: &Paragraph, numbers: &mut Numbers) -> (String, u8) {
    if let Some(kind) = &p.list {
        let level = usize::from(p.level.unwrap_or(0)).min(MAX_LEVEL);
        let numbered = matches!(kind, ListKind::Number);
        let n = numbers.item(level, numbered);
        let marker = if numbered {
            format!("{n}. ")
        } else {
            "- ".to_owned()
        };
        return ("  ".repeat(level) + &marker, level as u8);
    }
    numbers.start_over();
    let marker = match p.style.as_deref() {
        Some("title") => "# ",
        Some("subtitle") => "## ",
        Some("quote") => "> ",
        _ => "",
    };
    (marker.to_owned(), 0)
}

/// The paragraph as `parse` will read it back.
fn expected(p: &Paragraph, segs: &[Seg], level: u8) -> Paragraph {
    let style = p
        .style
        .clone()
        .filter(|s| p.list.is_none() && matches!(s.as_str(), "title" | "subtitle" | "quote"));
    Paragraph {
        runs: runs_of(segs),
        list: p.list.clone(),
        level: (p.list.is_some() && level > 0).then_some(level),
        style,
        ..Paragraph::plain("")
    }
}

/// One paragraph as text, or nothing for an empty one that has no marker.
fn block(p: &Paragraph, numbers: &mut Numbers) -> Option<String> {
    let segs = segments(&p.runs);
    let marked =
        p.list.is_some() || matches!(p.style.as_deref(), Some("title" | "subtitle" | "quote"));
    if segs.is_empty() && !marked {
        return None;
    }
    let (prefix, level) = prefix(p, numbers);
    if segs.is_empty() {
        return Some(prefix.trim_end().to_owned());
    }
    let want = expected(p, &segs, level);
    let start = prefix.is_empty();
    let style = |tags, full, start| Style { tags, full, start };
    let attempts = [
        (style(false, false, start), false),
        (style(false, true, start), false),
        (style(true, true, start), false),
        // Tags and an empty span at each end, which keep edge spaces and
        // anything that would read as a marker.
        (style(true, true, false), true),
    ];
    for (style, shield) in attempts {
        let line = format!("{prefix}{}", text_of(&segs, style, shield));
        if parse(&line) == [want.clone()] {
            return Some(line);
        }
    }
    // Code or math that spans lines, with a space at the start of one, cannot
    // be written; it keeps its words and loses its look.
    let plain: Vec<Seg> = segs
        .into_iter()
        .map(|s| Seg {
            code: s.code && !s.t.contains('\n'),
            math: s.math && !s.t.contains('\n'),
            ..s
        })
        .collect();
    Some(format!(
        "{prefix}{}",
        text_of(&plain, style(true, true, false), true)
    ))
}

fn text_of(segs: &[Seg], style: Style, shield: bool) -> String {
    let text = breaks(&render(segs, style));
    if shield {
        format!("{ISO}{text}{ISO}")
    } else {
        text
    }
}

/// A newline inside a paragraph as a hard break: a backslash, or two spaces
/// when the line already ends in a backslash. Space at either side of a
/// break, and an empty last line, are held by an empty span.
fn breaks(text: &str) -> String {
    let parts: Vec<&str> = text.split('\n').collect();
    let mut out = String::new();
    for (k, part) in parts.iter().enumerate() {
        let mut line = (*part).to_owned();
        if k > 0 && line.starts_with(char::is_whitespace) {
            line.insert_str(0, ISO);
        }
        if k + 1 < parts.len() {
            if line.ends_with(char::is_whitespace) {
                line.push_str(ISO);
            }
            let slashes = line.chars().rev().take_while(|&c| c == '\\').count();
            line.push_str(if slashes % 2 == 0 { "\\\n" } else { "  \n" });
        } else if k > 0 && line.is_empty() {
            line.push_str(ISO);
        }
        out.push_str(&line);
    }
    out
}
