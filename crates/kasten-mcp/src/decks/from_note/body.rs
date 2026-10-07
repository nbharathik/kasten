//! The lines of a note read for slides: the note cut at its headings, and what
//! each part holds: a list, prose, pictures and the citation keys.

use super::text::{Picture, cited_keys, first_sentence, pictures_in, plain};

/// The most lines a slide's list has; the rest of a note's list stays in the notes.
const MOST_LINES: usize = 6;
/// The longest a line of a list is, in characters.
const LINE_CHARS: usize = 110;

pub(super) struct Section {
    pub level: usize,
    pub title: String,
    pub lines: Vec<String>,
}

pub(super) fn is_fence(line: &str) -> bool {
    let t = line.trim_start();
    t.starts_with("```") || t.starts_with("~~~")
}

/// `# Title`: its level and words. `#tag` is not a heading.
pub(super) fn heading(line: &str) -> Option<(usize, String)> {
    let hashes = line.bytes().take_while(|b| *b == b'#').count();
    let rest = line.get(hashes..)?;
    if !(1..=6).contains(&hashes) || !(rest.is_empty() || rest.starts_with(' ')) {
        return None;
    }
    Some((hashes, plain(rest.trim().trim_end_matches('#').trim())))
}

/// The body cut at its headings; the first section is what comes before the first.
pub(super) fn sections(body: &str) -> Vec<Section> {
    let mut out = vec![Section {
        level: 0,
        title: String::new(),
        lines: Vec::new(),
    }];
    let mut fenced = false;
    for line in body.lines() {
        if is_fence(line) {
            fenced = !fenced;
        }
        match heading(line).filter(|_| !fenced) {
            Some((level, title)) => out.push(Section {
                level,
                title,
                lines: Vec::new(),
            }),
            None => {
                if let Some(last) = out.last_mut() {
                    last.lines.push(line.to_owned());
                }
            }
        }
    }
    out
}

/// The level whose headings are slides: the shallowest, unless a single top heading stands for the note itself.
pub(super) fn slide_level(found: &[Section]) -> Option<usize> {
    let mut levels: Vec<usize> = found
        .iter()
        .filter(|s| s.level > 0)
        .map(|s| s.level)
        .collect();
    levels.sort_unstable();
    let top = *levels.first()?;
    let alone = levels.iter().filter(|l| **l == top).count() == 1;
    if top == 1 && alone && levels.len() > 1 {
        levels.iter().copied().find(|l| *l > top)
    } else {
        Some(top)
    }
}

/// A list item's depth (0, or 1 when indented) and words, for `- x`, `* x`, `+ x`, `1. x` and `- [ ] x`.
fn list_item(line: &str) -> Option<(usize, &str)> {
    let indent = line.len() - line.trim_start().len();
    let t = line.trim_start();
    let rest = if let Some(rest) = t.strip_prefix(['-', '*', '+']) {
        rest.strip_prefix(' ')?
    } else {
        let digits = t.bytes().take_while(u8::is_ascii_digit).count();
        let after = t.get(digits..)?;
        if digits == 0 || digits > 3 {
            return None;
        }
        after
            .strip_prefix(". ")
            .or_else(|| after.strip_prefix(") "))?
    };
    let rest = rest.trim_start();
    let rest = ["[ ] ", "[x] ", "[X] "]
        .iter()
        .find_map(|b| rest.strip_prefix(b))
        .unwrap_or(rest);
    Some((usize::from(indent >= 2), rest.trim()))
}

/// The words of a quoted line without its `>` marks and a callout's header.
fn unquoted(line: &str) -> Option<&str> {
    let t = line.trim_start();
    if !t.starts_with('>') {
        return Some(line);
    }
    let inner = t.trim_start_matches(['>', ' ']);
    if inner.starts_with("[!") {
        return None;
    }
    Some(inner)
}

fn skipped(line: &str) -> bool {
    let t = line.trim();
    t.starts_with('|')
        || t.starts_with("[^")
        || (t.len() >= 3 && t.chars().all(|c| matches!(c, '-' | '*' | '_' | ' ')))
}

/// What a section's lines hold.
#[derive(Default)]
pub(super) struct Body {
    pub lines: Vec<String>,
    pub prose: Vec<String>,
    pub pictures: Vec<Picture>,
    pub keys: Vec<String>,
}

fn escaped(line: &str) -> String {
    if line.trim_start().starts_with('#') {
        format!("\\{}", line.trim_start())
    } else if line.trim().eq_ignore_ascii_case("notes:") {
        "Notes –".to_owned()
    } else {
        line.to_owned()
    }
}

impl Body {
    pub(super) fn read(raw: &[String]) -> Body {
        let mut body = Body::default();
        let mut paragraph = String::new();
        let mut fenced = false;
        let flush = |body: &mut Body, paragraph: &mut String| {
            if !paragraph.trim().is_empty() {
                body.prose.push(escaped(paragraph.trim()));
            }
            paragraph.clear();
        };
        for line in raw {
            if is_fence(line) {
                flush(&mut body, &mut paragraph);
                fenced = !fenced;
                body.prose.push(escaped(line));
                continue;
            }
            if fenced {
                body.prose.push(escaped(line));
                continue;
            }
            if line.trim().is_empty() {
                flush(&mut body, &mut paragraph);
                body.prose.push(String::new());
                continue;
            }
            for key in cited_keys(line) {
                if !body.keys.contains(&key) {
                    body.keys.push(key);
                }
            }
            let (pictures, rest) = pictures_in(line);
            let had_picture = !pictures.is_empty();
            body.pictures.extend(pictures);
            if skipped(&rest) || (had_picture && rest.trim().is_empty()) {
                continue;
            }
            let Some(rest) = unquoted(&rest) else {
                continue;
            };
            if let Some((depth, words)) = list_item(rest) {
                flush(&mut body, &mut paragraph);
                let words = plain(words);
                if !words.is_empty() {
                    body.lines.push(format!("{}- {words}", "  ".repeat(depth)));
                }
            } else {
                let words = plain(rest);
                if !words.is_empty() {
                    paragraph.push(' ');
                    paragraph.push_str(&words);
                }
            }
        }
        flush(&mut body, &mut paragraph);
        while body.prose.last().is_some_and(String::is_empty) {
            body.prose.pop();
        }
        body
    }
}

/// `n` lines of a list, cut short, and the ones that did not fit.
pub(super) fn fitted(lines: &[String]) -> (Vec<String>, Vec<String>) {
    let mut shown = Vec::new();
    let mut spare = Vec::new();
    for line in lines {
        if shown.len() < MOST_LINES {
            let indent = line.len() - line.trim_start().len();
            let words = line.trim_start().trim_start_matches("- ");
            shown.push(format!(
                "{}- {}",
                " ".repeat(indent),
                first_sentence(words, LINE_CHARS)
            ));
        } else {
            spare.push(line.trim_start().trim_start_matches("- ").to_owned());
        }
    }
    (shown, spare)
}

pub(super) fn joined(paragraphs: &[String]) -> String {
    let mut text = paragraphs.join("\n");
    while text.contains("\n\n\n") {
        text = text.replace("\n\n\n", "\n\n");
    }
    text.trim().to_owned()
}
