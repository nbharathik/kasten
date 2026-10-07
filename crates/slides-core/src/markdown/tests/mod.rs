//! Tests of the Markdown dialect: the inline parser, the block parser, the
//! serializer, and that the serializer undoes the parser.

mod blocks;
mod general;
mod inline;
mod render;
mod roundtrip;

use crate::model::{ListKind, Paragraph, Run};

/// A short description of a value, so a failing table stays readable.
pub(super) trait Show {
    fn show(&self) -> String;
}

impl Show for Run {
    fn show(&self) -> String {
        let looks: String = [
            (self.bold, 'b'),
            (self.italic, 'i'),
            (self.strike, 's'),
            (self.underline, 'u'),
            (self.code, 'c'),
            (self.math, 'm'),
        ]
        .iter()
        .filter(|(on, _)| *on)
        .map(|(_, c)| *c)
        .collect();
        let mut out = format!("{:?}", self.t);
        if !looks.is_empty() {
            out += &format!("[{looks}]");
        }
        if let Some(url) = &self.link {
            out += &format!("->{url}");
        }
        let plain = Run {
            t: self.t.clone(),
            ..Run::plain("")
        };
        let bare = Run {
            bold: false,
            italic: false,
            strike: false,
            underline: false,
            code: false,
            math: false,
            link: None,
            ..self.clone()
        };
        if bare != plain {
            out += "+other";
            out += &format!("{bare:?}");
        }
        out
    }
}

impl Show for Vec<Run> {
    fn show(&self) -> String {
        format!(
            "[{}]",
            self.iter().map(Show::show).collect::<Vec<_>>().join(", ")
        )
    }
}

impl Show for Paragraph {
    fn show(&self) -> String {
        let mut head = String::new();
        if let Some(style) = &self.style {
            head += &format!("({style})");
        }
        match self.list {
            Some(ListKind::Bullet) => head += "-",
            Some(ListKind::Number) => head += "1.",
            None => {}
        }
        if let Some(level) = self.level {
            head += &format!("@{level}");
        }
        let bare = Paragraph {
            runs: Vec::new(),
            list: None,
            level: None,
            style: None,
            ..self.clone()
        };
        let other = Paragraph {
            runs: Vec::new(),
            ..Paragraph::plain("")
        };
        if bare != other {
            head += "+other";
        }
        format!("{head} {}", self.runs.show())
    }
}

impl Show for Vec<Paragraph> {
    fn show(&self) -> String {
        format!(
            "\n      {}",
            self.iter()
                .map(Show::show)
                .collect::<Vec<_>>()
                .join("\n      ")
        )
    }
}

pub(super) fn r(t: &str) -> Run {
    Run::plain(t)
}

/// A run with looks named by letters: `b`old, `i`talic, `s`trike,
/// `u`nderline, `c`ode and `m`ath.
pub(super) fn look(t: &str, looks: &str) -> Run {
    let mut run = Run::plain(t);
    for c in looks.chars() {
        match c {
            'b' => run.bold = true,
            'i' => run.italic = true,
            's' => run.strike = true,
            'u' => run.underline = true,
            'c' => run.code = true,
            'm' => run.math = true,
            other => panic!("no look `{other}`"),
        }
    }
    run
}

pub(super) fn b(t: &str) -> Run {
    look(t, "b")
}

pub(super) fn i(t: &str) -> Run {
    look(t, "i")
}

pub(super) fn code(t: &str) -> Run {
    look(t, "c")
}

pub(super) fn math(t: &str) -> Run {
    look(t, "m")
}

/// A paragraph with no list and no style.
pub(super) fn para(runs: Vec<Run>) -> Paragraph {
    Paragraph {
        runs,
        ..Paragraph::plain("")
    }
}

pub(super) fn plain(t: &str) -> Paragraph {
    Paragraph::plain(t)
}

/// A list item at `level`; the top level is `None`, as slots make it.
fn item(list: ListKind, level: u8, runs: Vec<Run>) -> Paragraph {
    Paragraph {
        list: Some(list),
        level: (level > 0).then_some(level),
        ..para(runs)
    }
}

pub(super) fn bullet(level: u8, runs: Vec<Run>) -> Paragraph {
    item(ListKind::Bullet, level, runs)
}

pub(super) fn number(level: u8, runs: Vec<Run>) -> Paragraph {
    item(ListKind::Number, level, runs)
}

/// A paragraph that starts from the theme style `style`.
pub(super) fn styled(style: &str, runs: Vec<Run>) -> Paragraph {
    Paragraph {
        style: Some(style.to_owned()),
        ..para(runs)
    }
}

/// One line of a code block.
pub(super) fn line(t: &str) -> Paragraph {
    styled("code", vec![r(t)])
}

/// `run` as the text of a link to `url`.
pub(super) fn linked(mut run: Run, url: &str) -> Run {
    run.link = Some(url.to_owned());
    run
}

/// Runs `f` on every input and reports all the mismatches at once, so one
/// run of a table shows everything that is wrong.
pub(super) fn table<T: PartialEq + Show>(cases: Vec<(&str, T)>, f: impl Fn(&str) -> T) {
    let wrong: Vec<String> = cases
        .iter()
        .filter_map(|(input, want)| {
            let got = f(input);
            (&got != want)
                .then(|| format!("{input:?}\n   want {}\n   got  {}", want.show(), got.show()))
        })
        .collect();
    assert!(
        wrong.is_empty(),
        "{} of {} cases differ:\n{}",
        wrong.len(),
        cases.len(),
        wrong.join("\n")
    );
}

/// Like `table`, for inputs that are not text and outputs that are.
pub(super) fn table_of<I: Show>(cases: Vec<(I, &str)>, f: impl Fn(&I) -> String) {
    let wrong: Vec<String> = cases
        .iter()
        .filter_map(|(input, want)| {
            let got = f(input);
            (got != *want).then(|| format!("{}\n   want {want:?}\n   got  {got:?}", input.show()))
        })
        .collect();
    assert!(
        wrong.is_empty(),
        "{} of {} cases differ:\n{}",
        wrong.len(),
        cases.len(),
        wrong.join("\n")
    );
}
