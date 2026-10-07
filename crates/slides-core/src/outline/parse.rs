//! Reading a Markdown outline: `#` names the deck, every `##` line starts a
//! slide, the blocks after it are Markdown, and a `Notes:` line starts its
//! speaker notes.

use super::{Outline, OutlineSlide};
use crate::markdown::{self, fence_closes, fence_open, plain_inline};

pub fn parse_outline(md: &str) -> Outline {
    let mut reader = Reader::default();
    for line in md.lines() {
        reader.line(line);
    }
    reader.finish_slide();
    reader.outline
}

#[derive(Default)]
struct Reader {
    outline: Outline,
    /// The slide being read.
    slide: Option<Draft>,
    /// The deck already has its title, or its first slide has begun.
    titled: bool,
    /// The fence the reading is inside, whose lines are only text.
    fence: Option<(char, usize)>,
}

#[derive(Default)]
struct Draft {
    slide: OutlineSlide,
    /// The lines of the block being read.
    block: Vec<String>,
    /// The lines of the notes, once they have begun.
    notes: Option<Vec<String>>,
}

impl Reader {
    fn line(&mut self, line: &str) {
        let fenced = match self.fence {
            Some((ch, n)) => {
                if fence_closes(line, ch, n) {
                    self.fence = None;
                }
                true
            }
            None => {
                self.fence = fence_open(line);
                self.fence.is_some()
            }
        };
        if !fenced {
            if let Some(rest) = heading(line, 2) {
                self.start_slide(rest);
                return;
            }
            if !self.titled
                && let Some(rest) = heading(line, 1)
            {
                self.outline.title = plain_inline(rest.trim());
                self.titled = true;
                return;
            }
        }
        if let Some(draft) = &mut self.slide {
            draft.line(line, fenced);
        }
    }

    fn start_slide(&mut self, rest: &str) {
        self.finish_slide();
        self.titled = true;
        let (title, settings) = split_settings(rest.trim());
        let mut slide = OutlineSlide {
            title: plain_inline(title),
            ..OutlineSlide::default()
        };
        for item in settings.split(',').map(str::trim) {
            match item.split_once(':') {
                Some((key, name)) if key.trim().eq_ignore_ascii_case("layout") => {
                    slide.layout = Some(name.trim().to_owned()).filter(|n| !n.is_empty());
                }
                _ if item.eq_ignore_ascii_case("hidden") => slide.hidden = true,
                _ if item.eq_ignore_ascii_case("backup") => slide.backup = true,
                _ => {}
            }
        }
        self.slide = Some(Draft {
            slide,
            ..Draft::default()
        });
    }

    fn finish_slide(&mut self) {
        let Some(mut draft) = self.slide.take() else {
            return;
        };
        draft.flush();
        if let Some(lines) = &draft.notes {
            draft.slide.notes = notes_text(lines);
        }
        self.outline.slides.push(draft.slide);
    }
}

impl Draft {
    /// `fenced` says the line is part of a fence: never a blank line that ends
    /// a block, and never the `Notes:` line.
    fn line(&mut self, line: &str, fenced: bool) {
        if let Some(notes) = &mut self.notes {
            notes.push(line.to_owned());
        } else if fenced {
            self.block.push(line.to_owned());
        } else if line.trim().is_empty() {
            self.flush();
        } else if line.trim().eq_ignore_ascii_case("notes:") {
            self.flush();
            self.notes = Some(Vec::new());
        } else {
            self.block.push(line.to_owned());
        }
    }

    /// Ends the block being read. A block that is only an HTML comment, such
    /// as the count of other elements, holds nothing to keep.
    fn flush(&mut self) {
        let lines = std::mem::take(&mut self.block);
        let comment = lines.len() == 1
            && lines[0].trim().starts_with("<!--")
            && lines[0].trim().ends_with("-->");
        if comment {
            return;
        }
        let paragraphs = markdown::parse(&lines.join("\n"));
        if !paragraphs.is_empty() {
            self.slide.blocks.push(paragraphs);
        }
    }
}

/// What follows `#` marks of the given `level` on a heading line.
fn heading(line: &str, level: usize) -> Option<&str> {
    let rest = line.strip_prefix(&"#".repeat(level))?;
    (rest.is_empty() || rest.starts_with(char::is_whitespace)).then_some(rest)
}

/// Splits `Title <!-- layout: x, hidden -->` into the title and what is
/// inside the comment. A comment whose opening is escaped is text.
fn split_settings(text: &str) -> (&str, &str) {
    let Some(body) = text.strip_suffix("-->") else {
        return (text, "");
    };
    let Some(open) = body.rfind("<!--") else {
        return (text, "");
    };
    let slashes = body[..open]
        .chars()
        .rev()
        .take_while(|&c| c == '\\')
        .count();
    if slashes % 2 == 1 {
        return (text, "");
    }
    (body[..open].trim_end(), &body[open + 4..])
}

/// The notes as they were written, without the backslash that keeps a line of
/// `##` from starting a slide.
fn notes_text(lines: &[String]) -> String {
    let mut fence: Option<(char, usize)> = None;
    let mut out: Vec<&str> = Vec::new();
    for line in lines {
        let mut text = line.as_str();
        match fence {
            Some((ch, n)) => {
                if fence_closes(line, ch, n) {
                    fence = None;
                }
            }
            None => {
                fence = fence_open(line);
                let slashes = line.chars().take_while(|&c| c == '\\').count();
                if fence.is_none() && slashes > 0 && line[slashes..].starts_with("##") {
                    text = &line[1..];
                }
            }
        }
        out.push(text);
    }
    out.join("\n").trim().to_owned()
}
