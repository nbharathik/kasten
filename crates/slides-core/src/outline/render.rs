//! A deck as a Markdown outline: the deck's title, then for every slide a
//! heading, a block for each thing on it, and its notes.

use crate::markdown::{self, escape_inline, fence_closes, fence_open, to_markdown};
use crate::model::{Deck, Element, Paragraph, Slide, TableEl, Text};

/// The layout a slide has unless the heading says otherwise.
const DEFAULT_LAYOUT: &str = "title-body";

pub fn outline_of(deck: &Deck) -> String {
    let mut out = heading("#", &escape_inline(deck.title.trim(), false), "");
    for slide in &deck.slides {
        out.push('\n');
        out.push_str(&section(deck, slide));
    }
    out
}

/// `marks`, the title and the comment on one line, leaving out what is empty.
fn heading(marks: &str, title: &str, comment: &str) -> String {
    let mut line = marks.to_owned();
    for part in [title, comment].into_iter().filter(|p| !p.is_empty()) {
        line.push(' ');
        line.push_str(part);
    }
    line.push('\n');
    line
}

fn section(deck: &Deck, slide: &Slide) -> String {
    let (title, title_at) = title_of(deck, slide);
    let mut blocks: Vec<String> = Vec::new();
    let mut others = 0;
    for (i, element) in slide.elements.iter().enumerate() {
        if Some(i) == title_at {
            continue;
        }
        match element {
            Element::Text(t) => blocks.extend(text_block(&t.text)),
            Element::Image(image) if !image.src.is_empty() => {
                let alt = image.base.alt.as_deref().unwrap_or_default();
                blocks.push(markdown::image_markdown(alt, &image.src));
            }
            Element::Image(_) => {}
            Element::Table(t) => blocks.extend(table_block(t)),
            _ => others += 1,
        }
    }
    if others > 0 {
        let s = if others == 1 { "" } else { "s" };
        blocks.push(format!("<!-- {others} other element{s} -->"));
    }
    let notes = slide.notes.trim();
    if !notes.is_empty() {
        blocks.push(format!("Notes:\n{}", escape_note_headings(notes)));
    }
    let mut out = heading("##", &escape_inline(&title, false), &settings(slide));
    if !blocks.is_empty() {
        out.push_str(&blocks.join("\n\n"));
        out.push('\n');
    }
    out
}

/// The comment after a slide's title: its layout, unless it is the usual
/// one, and whether it is hidden or a backup.
fn settings(slide: &Slide) -> String {
    let mut items: Vec<String> = Vec::new();
    if slide.layout != DEFAULT_LAYOUT {
        items.push(format!("layout: {}", slide.layout));
    }
    if slide.hidden {
        items.push("hidden".to_owned());
    }
    if slide.backup {
        items.push("backup".to_owned());
    }
    if items.is_empty() {
        String::new()
    } else {
        format!("<!-- {} -->", items.join(", "))
    }
}

/// The words of a text on one line.
fn one_line(text: &Text) -> String {
    let lines: Vec<String> = text
        .paragraphs
        .iter()
        .map(|p| p.text().replace('\n', " ").trim().to_owned())
        .filter(|line| !line.is_empty())
        .collect();
    lines.join(" ")
}

/// The title of a slide and which of its elements says it: what is in the
/// title slot, else the first text, else the name of the layout.
fn title_of(deck: &Deck, slide: &Slide) -> (String, Option<usize>) {
    let slot = slide
        .elements
        .iter()
        .position(|e| e.base().placeholder.as_deref() == Some("title") && e.text().is_some());
    let first = || {
        slide
            .elements
            .iter()
            .position(|e| matches!(e, Element::Text(t) if !t.text.is_blank()))
    };
    match slot.or_else(first) {
        Some(i) => (
            slide.elements[i].text().map(one_line).unwrap_or_default(),
            Some(i),
        ),
        None => {
            let layout = deck.theme.layout(&slide.layout);
            let label = layout.map_or(slide.layout.clone(), |l| l.label.clone());
            (label, None)
        }
    }
}

/// A text as Markdown, or nothing if it is empty. Headings become plain
/// paragraphs, since a heading line here would start a slide. Code or math
/// that runs over a line break becomes plain text, since a line inside it
/// could not be told from the structure around it.
fn text_block(text: &Text) -> Option<String> {
    let paragraphs: Vec<Paragraph> = text
        .paragraphs
        .iter()
        .cloned()
        .map(|mut p| {
            if matches!(p.style.as_deref(), Some("title" | "subtitle")) {
                p.style = None;
            }
            for run in p.runs.iter_mut().filter(|r| r.t.contains('\n')) {
                (run.code, run.math) = (false, false);
            }
            p
        })
        .collect();
    let md = to_markdown(&paragraphs);
    let md = md.trim_end_matches('\n');
    if md.trim().is_empty() {
        return None;
    }
    Some(keep_notes_marker_unique(md))
}

/// Keeps the lines of a block from being taken for the structure around
/// it: a line that is only `Notes:` gets an empty span after it, and one that
/// is a whole HTML comment a backslash, which the reader would drop as the
/// count of other elements.
fn keep_notes_marker_unique(md: &str) -> String {
    let mut fence: Option<(char, usize)> = None;
    let mut lines: Vec<String> = Vec::new();
    for line in md.lines() {
        let mut line = line.to_owned();
        match fence {
            Some((ch, n)) => {
                if fence_closes(&line, ch, n) {
                    fence = None;
                }
            }
            None => {
                fence = fence_open(&line);
                let text = line.trim();
                if fence.is_none() && text.eq_ignore_ascii_case("notes:") {
                    line.push_str("<u></u>");
                } else if fence.is_none() && text.starts_with("<!--") && text.ends_with("-->") {
                    line.insert(line.len() - line.trim_start().len(), '\\');
                }
            }
        }
        lines.push(line);
    }
    lines.join("\n")
}

/// A table as a GitHub-style pipe table. Its first row is the header.
fn table_block(table: &TableEl) -> Option<String> {
    let width = table.rows.iter().map(|r| r.cells.len()).max()?;
    if width == 0 {
        return None;
    }
    let line = |cells: Vec<String>| format!("| {} |", cells.join(" | "));
    let mut lines: Vec<String> = Vec::new();
    for (k, row) in table.rows.iter().enumerate() {
        let mut cells: Vec<String> = row.cells.iter().map(|c| cell_text(&c.text)).collect();
        cells.resize(width, String::new());
        lines.push(line(cells));
        if k == 0 {
            lines.push(line(vec!["---".to_owned(); width]));
        }
    }
    Some(lines.join("\n"))
}

/// A table cell on one line, its pipes escaped.
fn cell_text(text: &Text) -> String {
    let lines: Vec<String> = text
        .paragraphs
        .iter()
        .map(|p| {
            let mut plain = p.clone();
            (plain.list, plain.level, plain.style) = (None, None, None);
            for run in &mut plain.runs {
                run.t = run.t.replace('\n', " ");
            }
            to_markdown(&[plain]).replace('|', "\\|")
        })
        .filter(|line| !line.is_empty())
        .collect();
    lines.join(" ")
}

/// Notes with a backslash in front of any line that starts with `##` (and
/// lines that already had backslashes there), outside fences, so that none
/// of them starts a slide.
fn escape_note_headings(notes: &str) -> String {
    let mut fence: Option<(char, usize)> = None;
    let mut lines: Vec<String> = Vec::new();
    for line in notes.lines() {
        let mut escaped = line.to_owned();
        match fence {
            Some((ch, n)) => {
                if fence_closes(line, ch, n) {
                    fence = None;
                }
            }
            None => {
                fence = fence_open(line);
                let slashes = line.chars().take_while(|&c| c == '\\').count();
                if fence.is_none() && line[slashes..].starts_with("##") {
                    escaped.insert(0, '\\');
                }
            }
        }
        lines.push(escaped);
    }
    lines.join("\n")
}
