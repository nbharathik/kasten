//! Code: a rounded panel of monospace text coloured by syntax.
//!
//! Without a focus list the code is one text box with a paragraph for each line,
//! so it stays fully editable in PowerPoint. With one, each line is a text box of
//! its own, so a line can be dimmed at the steps it is not the focus of. Line
//! numbers are a text box beside the code and stay bright. Text is never wrapped:
//! the size shrinks, down to 10 pt, until the longest line and every line fit.

mod focus;
mod highlight;
mod lexer;
mod palette;

use super::Ctx;
use super::build::{ParaExt, Parts, RunExt, StyleExt, filled, insets, para, run, shown, text_of};
use super::geom::{inset, right, sane};
use super::measure::{MONO_EM, columns, fit_pt, size_or};
use crate::model::{Align, CodeEl, Element, Paragraph, VAlign};
use crate::resolve::Rect;
use crate::units::points_to_units;
use highlight::{Tok, highlight};
use palette::{Kind, Palette, palette};

/// The smallest size code is shrunk to, in points.
const FLOOR_PT: f64 = 10.0;

/// The line height as a multiple of the type size.
const LINE: f64 = 1.35;

/// The space between the line numbers and the code, in em.
const GAP_EM: f64 = 1.4;

/// The most lines that get a text box of their own for a focus list; more are one box.
const MAX_FOCUS_LINES: usize = 200;

/// The lines of the code as a person sees them: no carriage returns, and no empty
/// line for the newline that ends the last one.
fn source_lines(code: &str) -> Vec<&str> {
    let mut lines: Vec<&str> = code
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect();
    if lines.len() > 1 && lines.last() == Some(&"") {
        lines.pop();
    }
    lines
}

/// How many digits the number `n` is written with.
fn digits(n: u64) -> usize {
    n.max(1).ilog10() as usize + 1
}

/// Where everything goes and how big it is set.
struct Plan {
    /// Points.
    size: f64,
    /// The same, in slide units.
    unit: f64,
    line_h: f64,
    inner: Rect,
    code_x: f64,
    code_w: f64,
    radius: f64,
}

fn plan(rect: Rect, wanted: f64, cols: usize, lines: usize, number_digits: usize) -> Plan {
    let pad_x = (rect.w * 0.03).clamp(8.0, 20.0);
    let pad_y = (rect.h * 0.05).clamp(6.0, 16.0);
    let inner = inset(rect, pad_x, pad_y, pad_x, pad_y);
    let gutter_of = |unit: f64| {
        if number_digits == 0 {
            0.0
        } else {
            (number_digits as f64 * MONO_EM + GAP_EM) * unit
        }
    };
    let fits = |pt: f64| {
        let unit = points_to_units(pt);
        cols as f64 * MONO_EM * unit * 1.01 + gutter_of(unit) <= inner.w
            && lines as f64 * unit * LINE <= inner.h
    };
    let size = fit_pt(wanted, FLOOR_PT.min(wanted), fits);
    let unit = points_to_units(size);
    let gutter = gutter_of(unit);
    let code_x = inner.x + gutter;
    Plan {
        size,
        unit,
        line_h: unit * LINE,
        inner,
        code_x,
        // The right padding is spare room for a line that measures a little wider than it was guessed.
        code_w: (right(rect) - pad_x * 0.5 - code_x).max(0.0),
        radius: if rect.w.min(rect.h) >= 96.0 {
            12.0
        } else {
            10.0
        },
    }
}

/// One line as a paragraph of coloured runs.
fn line_paragraph(tokens: &[Tok], size: f64, palette: &Palette) -> Paragraph {
    let runs = if tokens.is_empty() {
        vec![run(shown(""), size).color(palette.color(Kind::Plain))]
    } else {
        tokens
            .iter()
            .map(|t| run(&t.text, size).color(palette.color(t.kind)))
            .collect()
    };
    para(runs).style("code").spacing(LINE)
}

pub fn expand(cx: &Ctx, element: &CodeEl) -> Vec<Element> {
    let rect = sane(cx.rect);
    let palette = palette(element.theme.as_ref());
    let source = source_lines(&element.code);
    let tokens = highlight(&element.language, &source);
    let widest = tokens
        .iter()
        .map(|line| line.iter().map(|t| columns(&t.text)).sum::<usize>())
        .max()
        .unwrap_or(0)
        .max(1);

    let first = u64::from(element.first_line.unwrap_or(1));
    let last = first + source.len() as u64 - 1;
    let number_digits = if element.line_numbers {
        digits(last)
    } else {
        0
    };
    let theme_size = cx.theme.text_style("code").map_or(16.0, |s| s.size);
    let wanted = size_or(element.font_size, size_or(Some(theme_size), 16.0));
    let plan = plan(rect, wanted, widest, source.len(), number_digits);

    let mut parts = Parts::new(cx.id, rect);
    let panel = filled(palette.panel)
        .radius(plan.radius)
        .stroke(palette.border, 1.0);
    parts.shape("roundRect", rect, panel, None);

    // The numbers keep their place in the numbering when there are none, so the code's parts keep theirs.
    if number_digits > 0 {
        let numbers = (0..source.len() as u64)
            .map(|i| {
                para(vec![
                    run(&(first + i).to_string(), plan.size).color(palette.gutter),
                ])
                .style("code")
                .spacing(LINE)
                .align(Align::Right)
            })
            .collect();
        let width = number_digits as f64 * MONO_EM * plan.unit * 1.02 + 1.0;
        let r = Rect {
            x: plan.inner.x,
            y: plan.inner.y,
            w: width,
            h: plan.line_h * source.len() as f64,
        };
        parts.text(r, text_of(numbers, VAlign::Top, insets(0.0, 0.0, 0.0, 0.0)));
    } else {
        parts.skip();
    }

    let paragraphs: Vec<Paragraph> = tokens
        .iter()
        .map(|line| line_paragraph(line, plan.size, palette))
        .collect();
    let flat = insets(0.0, 0.0, 0.0, 0.0);
    if element.focus.is_empty() || source.len() > MAX_FOCUS_LINES {
        let r = Rect {
            x: plan.code_x,
            y: plan.inner.y,
            w: plan.code_w,
            h: plan.line_h * source.len() as f64,
        };
        parts.text(r, text_of(paragraphs, VAlign::Top, flat.clone()));
    } else {
        let states = focus::states(&element.focus, source.len());
        for (i, (paragraph, states)) in paragraphs.into_iter().zip(states).enumerate() {
            let r = Rect {
                x: plan.code_x,
                y: plan.inner.y + plan.line_h * i as f64,
                w: plan.code_w,
                h: plan.line_h,
            };
            parts
                .text(r, text_of(vec![paragraph], VAlign::Top, flat.clone()))
                .base_mut()
                .step_states = states;
        }
    }
    parts.finish()
}

/// The language a new code block starts in, and so the one whose colouring [`warm_up`] gets ready.
const WARM: &str = "python";

/// Python with the kinds of thing a block has in it (a decorator, a class, a comment, an f-string,
/// numbers, a comprehension, a lambda): a grammar builds each part of itself the first time
/// something needs it, so a snippet with little in it leaves the first real block to build the rest.
const WARM_SNIPPET: &str = "from dataclasses import dataclass\n\n@dataclass\nclass Card:\n    title: str\n    body: str = \"\"\n\n    def shout(self) -> str:\n        # loud, on purpose\n        return f\"{self.title.upper()}!\" + str(42)\n\ndef fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nif __name__ == '__main__':\n    print([fib(i) for i in range(10)], 3.5e-2, None, True)\n    square = lambda x: x ** 2\n    table = {k: v for k, v in zip('abc', [1, 2, 3])}\n";

/// Does the slow first-use work of colouring code (reading the syntax definitions, building the
/// colours and the grammar of the language a new block starts in) on a throw-away snippet, so that
/// the first slide with a code block does not wait for it. It keeps only what the next block would
/// have loaded itself. It is done once for the process; asking again costs nothing.
pub fn warm_up() {
    static DONE: std::sync::Once = std::sync::Once::new();
    DONE.call_once(|| {
        let lines: Vec<&str> = WARM_SNIPPET.lines().collect();
        let _ = highlight(WARM, &lines);
    });
}

#[cfg(test)]
mod tests;
