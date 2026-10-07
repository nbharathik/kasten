//! Runs to inline Markdown. Spans open and close as the looks change from
//! run to run, so a stretch of bold that holds some italic is written once,
//! not once per run.

use std::cmp::Reverse;

use super::escape::{Esc, ISO, autolinkable, code_span, escape, math_text, url_text};
use crate::model::Run;

/// A run reduced to what Markdown can say.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Seg {
    pub t: String,
    pub bold: bool,
    pub italic: bool,
    pub strike: bool,
    pub underline: bool,
    pub code: bool,
    pub math: bool,
    pub link: Option<String>,
}

impl Seg {
    fn same_look(&self, o: &Seg) -> bool {
        (
            self.bold,
            self.italic,
            self.strike,
            self.underline,
            self.code,
            self.math,
        ) == (o.bold, o.italic, o.strike, o.underline, o.code, o.math)
            && self.link == o.link
    }
}

/// The runs without what Markdown cannot say (colour, size, font), without
/// empty ones, and with neighbours that look alike joined.
pub(super) fn segments(runs: &[Run]) -> Vec<Seg> {
    let mut out: Vec<Seg> = Vec::new();
    for run in runs.iter().filter(|r| !r.t.is_empty()) {
        let seg = Seg {
            t: run.t.clone(),
            bold: run.bold,
            italic: run.italic,
            strike: run.strike,
            underline: run.underline,
            code: run.code,
            math: run.math && !run.code,
            link: run.link.clone().filter(|url| !url.is_empty()),
        };
        match out.last_mut() {
            Some(last) if last.same_look(&seg) => last.t.push_str(&seg.t),
            _ => out.push(seg),
        }
    }
    out
}

pub(super) fn runs_of(segs: &[Seg]) -> Vec<Run> {
    segs.iter()
        .map(|s| Run {
            bold: s.bold,
            italic: s.italic,
            strike: s.strike,
            underline: s.underline,
            code: s.code,
            math: s.math,
            link: s.link.clone(),
            ..Run::plain(s.t.clone())
        })
        .collect()
}

/// How the runs are written.
#[derive(Clone, Copy)]
pub(super) struct Style {
    /// `<b>`-style tags for every span, which nothing can misread.
    pub tags: bool,
    /// Escape every character that could be markup.
    pub full: bool,
    /// The text starts a line.
    pub start: bool,
}

/// One thing a run can have around it, outermost first in this order.
#[derive(Clone, Debug, PartialEq)]
enum Attr {
    Link(String),
    Strike,
    Under,
    Bold,
    Italic,
}

/// A span that is open, and whether it was written with tags.
struct Open {
    attr: Attr,
    tag: bool,
}

/// A link whose text is its address goes in angle brackets.
fn is_auto(seg: &Seg) -> bool {
    !seg.code
        && !seg.math
        && seg
            .link
            .as_deref()
            .is_some_and(|u| u == seg.t && autolinkable(u))
}

fn attrs(seg: &Seg, auto: bool) -> Vec<Attr> {
    let mut out = Vec::new();
    if let Some(url) = seg.link.as_ref().filter(|_| !auto) {
        out.push(Attr::Link(url.clone()));
    }
    for (on, attr) in [
        (seg.strike, Attr::Strike),
        (seg.underline, Attr::Under),
        (seg.bold, Attr::Bold),
        (seg.italic, Attr::Italic),
    ] {
        if on {
            out.push(attr);
        }
    }
    out
}

/// How many runs from `k` on have `attr`.
fn extent(wants: &[Vec<Attr>], k: usize, attr: &Attr) -> usize {
    wants[k..].iter().take_while(|w| w.contains(attr)).count()
}

pub(super) fn render(segs: &[Seg], style: Style) -> String {
    let autos: Vec<bool> = segs.iter().map(|s| !style.tags && is_auto(s)).collect();
    let wants: Vec<Vec<Attr>> = segs.iter().zip(&autos).map(|(s, &a)| attrs(s, a)).collect();
    let mut w = Writer::default();
    let mut stack: Vec<Open> = Vec::new();
    for (k, seg) in segs.iter().enumerate() {
        let want = &wants[k];
        // Keep the spans still wanted, from the outside in; close the rest,
        // and open what is missing, the longest-lasting outermost.
        let keep = stack.iter().take_while(|o| want.contains(&o.attr)).count();
        for open in stack.drain(keep..).rev() {
            w.close(&open);
        }
        let mut missing: Vec<&Attr> = want
            .iter()
            .filter(|a| !stack.iter().any(|o| &o.attr == *a))
            .collect();
        missing.sort_by_key(|a| Reverse(extent(&wants, k, a)));
        for attr in missing {
            let tag = style.tags || uses_tag(attr, segs, &wants, k, &w);
            w.open(attr, tag);
            stack.push(Open {
                attr: attr.clone(),
                tag,
            });
        }
        let in_link = stack.iter().any(|o| matches!(o.attr, Attr::Link(_)));
        w.body(seg, autos[k], in_link, style);
    }
    for open in stack.drain(..).rev() {
        w.close(&open);
    }
    w.out
}

/// Whether the span of `attr` that starts at `k` needs tags: its markers
/// would touch a space inside it, or the marker just closed before it.
fn uses_tag(attr: &Attr, segs: &[Seg], wants: &[Vec<Attr>], k: usize, w: &Writer) -> bool {
    let mark = match attr {
        Attr::Under => return true,
        Attr::Link(_) => return false,
        Attr::Strike => '~',
        Attr::Bold | Attr::Italic => '*',
    };
    let last = k + extent(wants, k, attr) - 1;
    let space_at = |seg: &Seg, first: bool| {
        let c = if first {
            seg.t.chars().next()
        } else {
            seg.t.chars().last()
        };
        !seg.code && !seg.math && c.is_some_and(char::is_whitespace)
    };
    w.closer == Some(mark) || space_at(&segs[k], true) || space_at(&segs[last], false)
}

#[derive(Default)]
struct Writer {
    out: String,
    /// The marker character just closed, when the last thing written was a
    /// closing marker.
    closer: Option<char>,
    /// The last thing written was math, which a digit must not follow.
    math_end: bool,
}

impl Writer {
    fn push(&mut self, s: &str) {
        if self.math_end && s.starts_with(|c: char| c.is_ascii_digit()) {
            self.out.push_str(ISO);
        }
        self.math_end = false;
        self.closer = None;
        self.out.push_str(s);
    }

    fn open(&mut self, attr: &Attr, tag: bool) {
        self.push(match (attr, tag) {
            (Attr::Link(_), _) => "[",
            (Attr::Under, _) => "<u>",
            (Attr::Strike, false) => "~~",
            (Attr::Strike, true) => "<s>",
            (Attr::Bold, false) => "**",
            (Attr::Bold, true) => "<b>",
            (Attr::Italic, false) => "*",
            (Attr::Italic, true) => "<i>",
        });
    }

    fn close(&mut self, open: &Open) {
        let (text, mark) = match (&open.attr, open.tag) {
            (Attr::Link(url), _) => (format!("]({})", url_text(url)), None),
            (Attr::Under, _) => ("</u>".to_owned(), None),
            (Attr::Strike, false) => ("~~".to_owned(), Some('~')),
            (Attr::Strike, true) => ("</s>".to_owned(), None),
            (Attr::Bold, false) => ("**".to_owned(), Some('*')),
            (Attr::Bold, true) => ("</b>".to_owned(), None),
            (Attr::Italic, false) => ("*".to_owned(), Some('*')),
            (Attr::Italic, true) => ("</i>".to_owned(), None),
        };
        self.push(&text);
        self.closer = mark;
    }

    fn body(&mut self, seg: &Seg, auto: bool, in_link: bool, style: Style) {
        if auto {
            self.push(&format!("<{}>", seg.t));
        } else if seg.code {
            self.push(&code_span(&seg.t));
        } else if let Some(math) = seg.math.then(|| math_text(&seg.t)).flatten() {
            self.push(&math);
            self.math_end = true;
        } else {
            let esc = Esc {
                full: style.full,
                in_link,
                line_start: style.start && self.out.is_empty(),
            };
            self.push(&escape(&seg.t, esc));
        }
    }
}
