//! Inline Markdown to runs: `**bold**`, `*italic*`, `~~strike~~`, `<u>`,
//! `` `code` ``, `[text](url)`, `<https://autolink>`, `$math$` and backslash
//! escapes. A marker that never closes is text, and neighbours that look the
//! same become one run.

use std::iter::repeat_n;

use super::emphasis::{BOLD, Delim, ITALIC, Kind, Pair, STRIKE, UNDER, pair_up};
use super::scan::{ESCAPABLE, autolink, code_end, code_text, link_at, math_span, run_len, tag_at};
use crate::model::Run;

/// What the lexer reads: text, finished runs (code, math, links), or a marker
/// waiting to be paired (its number in `delims`).
enum Tok {
    Text(String),
    Atom(Vec<Run>),
    Delim(usize),
}

pub(super) fn inline(text: &str) -> Vec<Run> {
    let chars: Vec<char> = text.chars().collect();
    runs(&chars, None)
}

/// The runs of `c`; all of them link to `link` when it is given.
fn runs(c: &[char], link: Option<&str>) -> Vec<Run> {
    let mut lexer = Lexer {
        c,
        in_link: link.is_some(),
        toks: Vec::new(),
        delims: Vec::new(),
        text: String::new(),
    };
    let mut i = 0;
    while i < c.len() {
        i = lexer.step(i);
    }
    lexer.flush();
    let pairs = pair_up(&mut lexer.delims);
    assemble(lexer.toks, &lexer.delims, &pairs, link)
}

struct Lexer<'a> {
    c: &'a [char],
    /// Inside link text, where a link cannot start.
    in_link: bool,
    toks: Vec<Tok>,
    delims: Vec<Delim>,
    /// Text read since the last token.
    text: String,
}

impl Lexer<'_> {
    fn flush(&mut self) {
        if !self.text.is_empty() {
            self.toks.push(Tok::Text(std::mem::take(&mut self.text)));
        }
    }

    fn atom(&mut self, runs: Vec<Run>) {
        self.flush();
        self.toks.push(Tok::Atom(runs));
    }

    fn delim(&mut self, kind: Kind, n: usize, open: bool, close: bool) {
        self.flush();
        let at = self.toks.len();
        self.toks.push(Tok::Delim(self.delims.len()));
        self.delims.push(Delim {
            kind,
            n,
            left: n,
            open,
            close,
            at,
        });
    }

    /// Reads whatever starts at `i` and returns where the next thing starts.
    fn step(&mut self, i: usize) -> usize {
        let c = self.c;
        match c[i] {
            '\\' if c.get(i + 1).is_some_and(|&n| ESCAPABLE.contains(n)) => {
                self.text.push(c[i + 1]);
                i + 2
            }
            '`' => self.code(i),
            '$' => self.math(i),
            '[' if !self.in_link => self.link(i),
            '<' => self.angle(i),
            '*' | '_' | '~' => self.marks(i),
            other => {
                self.text.push(other);
                i + 1
            }
        }
    }

    fn code(&mut self, i: usize) -> usize {
        let n = run_len(self.c, i, '`');
        let Some(close) = code_end(self.c, i + n, n) else {
            self.text.extend(repeat_n('`', n));
            return i + n;
        };
        let t = code_text(&self.c[i + n..close]);
        self.atom(vec![Run {
            code: true,
            ..Run::plain(t)
        }]);
        close + n
    }

    fn math(&mut self, i: usize) -> usize {
        let Some((t, end)) = math_span(self.c, i) else {
            self.text.push('$');
            return i + 1;
        };
        self.atom(vec![Run {
            math: true,
            ..Run::plain(t)
        }]);
        end
    }

    fn link(&mut self, i: usize) -> usize {
        let Some(link) = link_at(self.c, i) else {
            self.text.push('[');
            return i + 1;
        };
        let inner = runs(&self.c[link.text], Some(&link.url));
        self.atom(inner);
        link.end
    }

    /// `<https://...>` or one of the tags.
    fn angle(&mut self, i: usize) -> usize {
        if let Some((url, end)) = autolink(self.c, i) {
            self.atom(vec![Run {
                link: Some(url.clone()),
                ..Run::plain(url)
            }]);
            return end;
        }
        if let Some((name, open, end)) = tag_at(self.c, i) {
            self.delim(Kind::Tag(name, open), 1, open, !open);
            return end;
        }
        self.text.push('<');
        i + 1
    }

    /// A run of `*`, `_` or `~`. Whether it can open or close follows
    /// CommonMark's flanking rules, which is what keeps `snake_case` whole.
    fn marks(&mut self, i: usize) -> usize {
        let ch = self.c[i];
        let n = run_len(self.c, i, ch);
        let end = i + n;
        let prev = i.checked_sub(1).map(|k| self.c[k]);
        let next = self.c.get(end).copied();
        let (left, right) = flanking(prev, next);
        let (open, close) = if ch == '_' {
            let punct = |c: Option<char>| c.is_some_and(is_punct);
            (
                left && (!right || punct(prev)),
                right && (!left || punct(next)),
            )
        } else {
            (left, right)
        };
        let kind = match ch {
            '*' => Kind::Star,
            '_' => Kind::Under,
            _ => Kind::Tilde,
        };
        if (kind == Kind::Tilde && n != 2) || !(open || close) {
            self.text.extend(repeat_n(ch, n));
        } else {
            self.delim(kind, n, open, close);
        }
        end
    }
}

/// Not a letter, a digit, a space or a control character.
pub(super) fn is_punct(c: char) -> bool {
    !c.is_alphanumeric() && !c.is_whitespace() && !c.is_control()
}

/// Whether a run of markers between `prev` and `next` is left- and
/// right-flanking. The edges of the text count as spaces.
fn flanking(prev: Option<char>, next: Option<char>) -> (bool, bool) {
    let space = |c: Option<char>| c.is_none_or(char::is_whitespace);
    let punct = |c: Option<char>| c.is_some_and(is_punct);
    let left = !space(next) && (!punct(next) || space(prev) || punct(prev));
    let right = !space(prev) && (!punct(prev) || space(next) || punct(next));
    (left, right)
}

/// The looks each token gets: those of the pairs that open before it and
/// close after it.
fn looks_by_token(len: usize, pairs: &[Pair]) -> Vec<u8> {
    const FLAGS: [u8; 4] = [BOLD, ITALIC, STRIKE, UNDER];
    let mut delta = vec![[0i32; 4]; len + 1];
    for p in pairs {
        if let Some(k) = FLAGS.iter().position(|&f| f == p.flag) {
            delta[p.open + 1][k] += 1;
            delta[p.close][k] -= 1;
        }
    }
    let mut live = [0i32; 4];
    delta[..len]
        .iter()
        .map(|d| {
            let mut flags = 0;
            for k in 0..4 {
                live[k] += d[k];
                if live[k] > 0 {
                    flags |= FLAGS[k];
                }
            }
            flags
        })
        .collect()
}

/// Turns the tokens into runs: what lies between a pair gets its look, what
/// no pair used is text again.
fn assemble(toks: Vec<Tok>, delims: &[Delim], pairs: &[Pair], link: Option<&str>) -> Vec<Run> {
    let looks = looks_by_token(toks.len(), pairs);
    let mut out: Vec<Run> = Vec::new();
    for (tok, flags) in toks.into_iter().zip(looks) {
        let pieces = match tok {
            Tok::Text(text) => vec![Run::plain(text)],
            Tok::Atom(runs) => runs,
            Tok::Delim(k) => vec![Run::plain(delims[k].literal())],
        };
        for mut run in pieces {
            run.bold |= flags & BOLD != 0;
            run.italic |= flags & ITALIC != 0;
            run.strike |= flags & STRIKE != 0;
            run.underline |= flags & UNDER != 0;
            if let Some(url) = link {
                run.link = Some(url.to_owned());
            }
            push_merged(&mut out, run);
        }
    }
    out
}

/// Whether two runs look alike, so they can be one.
pub(super) fn same_look(a: &Run, b: &Run) -> bool {
    (a.bold, a.italic, a.strike, a.underline, a.code, a.math)
        == (b.bold, b.italic, b.strike, b.underline, b.code, b.math)
        && a.link == b.link
}

/// Adds `run` to `out`, joining it to the last one when they look alike.
pub(super) fn push_merged(out: &mut Vec<Run>, run: Run) {
    if run.t.is_empty() {
        return;
    }
    if let Some(last) = out.last_mut()
        && same_look(last, &run)
    {
        last.t.push_str(&run.t);
        return;
    }
    out.push(run);
}
