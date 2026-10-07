//! A text body (`p:txBody`) turned into a deck's `Text`. Every paragraph and
//! run is worked out as PowerPoint would draw it, through the chain of
//! layers below it, and then written down as only what differs from the text
//! style the box starts from, so text stays as plain in the deck as it was
//! in the theme and follows the theme where the file did.

use slides_core::{Align, Extra, ListKind, Paragraph, Run, Text, TextStyle, VAlign};

use super::body::BodyProps;
use super::chain::Chain;
use super::levels::{self, Bullet, Level, Reader, RunProps, Spacing};
use crate::import::dom::Node;
use crate::import::styles::{DEFAULT_SIZE, StyleBook, line_multiple, space_points};
use crate::import::units::{round2, round4};

/// What a text body needs from the part it is in.
pub struct TextEnv<'a> {
    pub reader: Reader<'a>,
    pub styles: &'a StyleBook,
    /// The text style the box starts from.
    pub base: &'a str,
    /// The layers below the shape's own list style.
    pub chain: &'a Chain,
    /// The box's settings, layout and master included.
    pub body: BodyProps,
    /// Where the text sits when the file does not say.
    pub default_valign: VAlign,
}

/// How a text body reaches the rest of the import.
pub trait TextSink {
    /// The address an `a:hlinkClick` stands for; None if it is not one a deck keeps.
    fn link(&mut self, click: &Node) -> Option<String>;
    /// Something in the text could not be kept.
    fn warn(&mut self, message: &str);
}

fn differs(a: f64, b: f64) -> bool {
    (a - b).abs() > 0.011
}

fn plain_base(styles: &StyleBook, name: &str) -> TextStyle {
    styles
        .get(name)
        .or_else(|| styles.get("body"))
        .cloned()
        .unwrap_or_else(|| {
            slides_core::themes::light()
                .text_styles
                .remove("body")
                .unwrap_or(TextStyle {
                    size: DEFAULT_SIZE,
                    color: "text1".to_owned(),
                    font: "body".to_owned(),
                    bold: false,
                    italic: false,
                    align: None,
                    line_spacing: None,
                    space_before: None,
                    space_after: None,
                    extra: Extra::new(),
                })
        })
}

/// A run as it is drawn: its own properties over the paragraph's.
struct Piece {
    text: String,
    props: RunProps,
    link: Option<String>,
    field: Option<String>,
}

fn is_mono(font: &str) -> bool {
    crate::fonts::kind_of(&[font]) == crate::fonts::Kind::Mono
}

fn run_of(piece: Piece, base: &TextStyle, scale: f64) -> Run {
    let props = &piece.props;
    let size = round2(props.size.unwrap_or(DEFAULT_SIZE) * scale);
    let linked = piece.link.is_some();
    let mut run = Run::plain(piece.text);
    if differs(size, base.size) {
        run.size = Some(size);
    }
    run.bold = props.bold.unwrap_or(false) && !base.bold;
    run.italic = props.italic.unwrap_or(false) && !base.italic;
    // A link is drawn underlined in the theme's link colour whatever the run says.
    run.underline = props.underline.unwrap_or(false) && !linked;
    run.strike = props.strike.unwrap_or(false);
    if let Some(paint) = &props.color
        && paint.value != base.color
        && !(linked && paint.value == "accent1")
    {
        run.color = Some(paint.value.clone());
    }
    match &props.font {
        Some(font) if props.highlight.is_some() && (is_mono(font) || font == "code") => {
            run.code = true;
        }
        Some(font) if *font != base.font => run.font = Some(font.clone()),
        _ => {}
    }
    run.link = piece.link;
    run.field = piece.field;
    run
}

fn same_look(a: &Run, b: &Run) -> bool {
    a.bold == b.bold
        && a.italic == b.italic
        && a.underline == b.underline
        && a.strike == b.strike
        && a.color == b.color
        && a.size == b.size
        && a.font == b.font
        && a.link == b.link
        && a.code == b.code
        && a.field.is_none()
        && b.field.is_none()
}

fn push_run(runs: &mut Vec<Run>, run: Run) {
    if let Some(last) = runs.last_mut()
        && same_look(last, &run)
    {
        last.t.push_str(&run.t);
        return;
    }
    runs.push(run);
}

fn pieces(p: &Node, level: &Level, env: &TextEnv, sink: &mut dyn TextSink) -> Vec<Piece> {
    let mut out = Vec::new();
    for child in p.elements() {
        let (text, field) = match child.name.as_str() {
            "a:r" => (
                child.child("a:t").map(|t| t.text()).unwrap_or_default(),
                None,
            ),
            "a:br" => ("\n".to_owned(), None),
            "a:fld" => {
                let shown = child.child("a:t").map(|t| t.text()).unwrap_or_default();
                match child.attr("type") {
                    // The sample is what a slide would show; a program's placeholder such as `<number>` is not.
                    Some("slidenum") => {
                        let sample =
                            if !shown.is_empty() && shown.chars().all(|c| c.is_ascii_digit()) {
                                shown
                            } else {
                                "1".to_owned()
                            };
                        (sample, Some("slideNumber".to_owned()))
                    }
                    Some(kind) => {
                        sink.warn(&format!("a `{kind}` field became the text it showed"));
                        (shown, None)
                    }
                    None => (shown, None),
                }
            }
            "mc:AlternateContent" => {
                sink.warn("an equation in the text was left out");
                continue;
            }
            _ => continue,
        };
        let own = child
            .child("a:rPr")
            .map(|r| levels::run_props(r, &env.reader, None))
            .unwrap_or_default();
        let link = child
            .child("a:rPr")
            .and_then(|r| r.child("a:hlinkClick"))
            .and_then(|click| sink.link(click));
        out.push(Piece {
            text,
            props: own.over(&level.run),
            link,
            field,
        });
    }
    out
}

fn paragraph(
    p: &Node,
    own_lst: &levels::Levels,
    env: &TextEnv,
    base: &TextStyle,
    scale: (f64, f64),
    sink: &mut dyn TextSink,
) -> Paragraph {
    let ppr = p.child("a:pPr");
    let lvl = ppr
        .and_then(|n| n.int("lvl"))
        .map_or(0, |v| v.clamp(0, 8) as usize);
    let mut own = ppr
        .map(|n| levels::level(n, &env.reader, None))
        .unwrap_or_default();
    // A paragraph's own default run properties are not used by PowerPoint.
    own.run = RunProps::default();
    let level = own.over(&own_lst.level(lvl)).over(&env.chain.level(lvl));

    let mut pieces = pieces(p, &level, env, sink);
    if pieces
        .iter()
        .any(|piece| piece.props.baseline.is_some_and(|b| b != 0))
    {
        sink.warn("superscript and subscript were set as normal text");
    }
    let shown: Vec<f64> = pieces
        .iter()
        .filter(|piece| !piece.text.is_empty() || piece.field.is_some())
        .map(|piece| piece.props.size.unwrap_or(DEFAULT_SIZE) * scale.0)
        .collect();
    let size = shown
        .iter()
        .copied()
        .reduce(f64::max)
        .unwrap_or_else(|| level.run.size.unwrap_or(DEFAULT_SIZE) * scale.0);

    let mut runs: Vec<Run> = Vec::new();
    if pieces
        .iter()
        .all(|piece| piece.text.is_empty() && piece.field.is_none())
    {
        // An empty paragraph keeps the height its paragraph mark gives it.
        let mark = p
            .child("a:endParaRPr")
            .map(|r| levels::run_props(r, &env.reader, None))
            .unwrap_or_default()
            .over(&level.run);
        pieces.clear();
        pieces.push(Piece {
            text: String::new(),
            props: mark,
            link: None,
            field: None,
        });
    }
    for piece in pieces {
        let run = run_of(piece, base, scale.0);
        if run.field.is_some() {
            runs.push(run);
        } else {
            push_run(&mut runs, run);
        }
    }

    let line = level.line.map(|s| match s {
        Spacing::Percent(p) => line_multiple(Spacing::Percent(p * (1.0 - scale.1)), size),
        other => line_multiple(other, size),
    });
    let mut out = Paragraph {
        runs,
        align: None,
        list: match level.bullet {
            Some(Bullet::Char) => Some(ListKind::Bullet),
            Some(Bullet::Number) => Some(ListKind::Number),
            _ => None,
        },
        level: (lvl > 0).then_some(lvl as u8),
        style: None,
        space_before: None,
        space_after: None,
        line_spacing: None,
        step: None,
        extra: slides_core::Extra::new(),
    };
    let base_align = base.align.clone().unwrap_or(Align::Left);
    let wanted = level.align.clone().unwrap_or(Align::Left);
    if wanted != base_align {
        out.align = Some(wanted);
    }
    if let Some(value) = line
        && differs(value, base.line_spacing.unwrap_or(1.0))
    {
        out.line_spacing = Some(round4(value));
    }
    if let Some(s) = level.before {
        let value = space_points(s, size);
        if differs(value, base.space_before.unwrap_or(0.0)) {
            out.space_before = Some(value);
        }
    }
    if let Some(s) = level.after {
        let value = space_points(s, size);
        if differs(value, base.space_after.unwrap_or(0.0)) {
            out.space_after = Some(value);
        }
    }
    out
}

/// The text of a `p:txBody` or `a:txBody`, as a deck holds it.
pub fn convert(tx_body: &Node, env: &TextEnv, sink: &mut dyn TextSink) -> Text {
    let base = plain_base(env.styles, env.base);
    let own_lst = tx_body
        .child("a:lstStyle")
        .map(|l| levels::list_style(l, &env.reader, None))
        .unwrap_or_else(levels::Levels::empty);
    let scale = (
        env.body.font_scale.unwrap_or(1.0),
        env.body.line_reduction.unwrap_or(0.0),
    );
    let mut paragraphs: Vec<Paragraph> = tx_body
        .children_named("a:p")
        .map(|p| paragraph(p, &own_lst, env, &base, scale, sink))
        .collect();
    if paragraphs.is_empty() {
        paragraphs.push(Paragraph::plain(""));
    }
    let mut text = Text::from_paragraphs(paragraphs);
    text.insets = env.body.insets();
    // A body that names no anchor anywhere down its chain is anchored at the top.
    let anchor = env.body.anchor.clone().unwrap_or(VAlign::Top);
    text.valign = (anchor != env.default_valign).then_some(anchor);
    text
}

#[cfg(test)]
mod tests;
