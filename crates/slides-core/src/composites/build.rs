//! What every expansion shares: making parts with stable ids, and small
//! builders for styles, runs and paragraphs, so each kind reads as its design.

use super::geom::{round2, snap, within};
use crate::model::{
    Align, Base, Dash, Element, Extra, Fill, ImageEl, Insets, LineEl, Paragraph, Run, Stroke,
    Style, Text, VAlign,
};
use crate::resolve::Rect;

/// Collects the parts of one composite. Their ids are `<composite id>.1`, `.2`
/// and so on, in the order they are made, so an expansion has the same ids
/// every time and Morph can match parts between slides. A part that is left
/// out of a variant can `skip` its number, so the others keep theirs.
pub struct Parts {
    id: String,
    n: u32,
    out: Vec<Element>,
    bounds: Option<Rect>,
}

impl Parts {
    /// Parts kept inside `bounds`: each box is rounded to two decimals and cut to fit.
    pub fn new(id: &str, bounds: Rect) -> Parts {
        Parts {
            id: id.to_owned(),
            n: 0,
            out: Vec::new(),
            bounds: Some(bounds),
        }
    }

    /// Parts that may reach past the composite's box: for content that cannot be made to fit.
    pub fn unbounded(id: &str) -> Parts {
        Parts {
            bounds: None,
            ..Parts::new(
                id,
                Rect {
                    x: 0.0,
                    y: 0.0,
                    w: 0.0,
                    h: 0.0,
                },
            )
        }
    }

    /// Gives up the next number without making a part.
    pub fn skip(&mut self) {
        self.n += 1;
    }

    /// The base of the next part, placed at `r`.
    pub fn base(&mut self, r: Rect) -> Base {
        self.n += 1;
        let r = match self.bounds {
            Some(bounds) => snap(within(r, bounds)),
            None => snap(r),
        };
        Base::new(format!("{}.{}", self.id, self.n)).place(r.x, r.y, r.w, r.h)
    }

    /// A preset shape with a style and, if given, text inside it.
    pub fn shape(
        &mut self,
        preset: &str,
        r: Rect,
        style: Style,
        text: Option<Text>,
    ) -> &mut Element {
        let mut base = self.base(r);
        base.style = Some(style);
        self.push(Element::shape(base, preset, text))
    }

    /// A text box.
    pub fn text(&mut self, r: Rect, text: Text) -> &mut Element {
        let base = self.base(r);
        self.push(Element::text_el(base, text))
    }

    /// A picture from the host's image store.
    pub fn image(&mut self, r: Rect, src: &str, alt: Option<&str>) -> &mut Element {
        let mut base = self.base(r);
        base.alt = alt.map(str::to_owned);
        self.push(Element::Image(ImageEl {
            base,
            src: src.to_owned(),
            crop: None,
            mask: None,
            extra: Extra::new(),
        }))
    }

    /// A straight line from the top left of `r` to its bottom right.
    pub fn line(&mut self, r: Rect, style: Style) -> &mut Element {
        let mut base = self.base(r);
        base.style = Some(style);
        self.push(Element::Line(LineEl {
            base,
            route: None,
            extra: Extra::new(),
        }))
    }

    fn push(&mut self, element: Element) -> &mut Element {
        self.out.push(element);
        let last = self.out.len() - 1;
        &mut self.out[last]
    }

    pub fn is_empty(&self) -> bool {
        self.out.is_empty()
    }

    /// The parts, with every number rounded to two decimals: a file that is written and read
    /// again must come back the same, and a number of many digits does not.
    pub fn finish(mut self) -> Vec<Element> {
        self.out.iter_mut().for_each(tidy);
        self.out
    }
}

fn tidy_text(text: &mut Text) {
    for paragraph in &mut text.paragraphs {
        for run in &mut paragraph.runs {
            run.size = run.size.map(round2);
        }
        paragraph.line_spacing = paragraph.line_spacing.map(round2);
        paragraph.space_before = paragraph.space_before.map(round2);
        paragraph.space_after = paragraph.space_after.map(round2);
    }
    if let Some(space) = &mut text.insets {
        *space = insets(space.left, space.top, space.right, space.bottom);
    }
}

fn tidy(element: &mut Element) {
    let base = element.base_mut();
    base.rotation = base.rotation.map(round2);
    if let Some(style) = &mut base.style {
        style.radius = style.radius.map(round2);
        if let Some(stroke) = &mut style.stroke {
            stroke.width = stroke.width.map(round2);
            stroke.alpha = stroke.alpha.map(round2);
        }
        if let Some(fill) = &mut style.fill {
            fill.alpha = fill.alpha.map(round2);
        }
    }
    match element {
        Element::Text(t) => tidy_text(&mut t.text),
        Element::Shape(s) => {
            if let Some(text) = &mut s.text {
                tidy_text(text);
            }
        }
        _ => {}
    }
}

/// A style that fills with a colour token or hex value.
pub fn filled(color: &str) -> Style {
    Style {
        fill: Some(Fill {
            color: color.to_owned(),
            alpha: None,
            extra: Extra::new(),
        }),
        ..Style::default()
    }
}

/// A style that fills with a colour at `alpha` (1 is solid).
pub fn faded(color: &str, alpha: f64) -> Style {
    Style {
        fill: Some(Fill {
            color: color.to_owned(),
            alpha: Some(alpha),
            extra: Extra::new(),
        }),
        ..Style::default()
    }
}

/// A style with an outline and no fill.
pub fn outlined(color: &str, width: f64) -> Style {
    Style::default().stroke(color, width)
}

/// Looks to add to a style, one after another.
pub trait StyleExt {
    fn radius(self, radius: f64) -> Style;
    fn stroke(self, color: &str, width: f64) -> Style;
    fn stroke_alpha(self, alpha: f64) -> Style;
    fn dashed(self) -> Style;
}

impl StyleExt for Style {
    fn radius(mut self, radius: f64) -> Style {
        self.radius = Some(round2(radius));
        self
    }

    fn stroke(mut self, color: &str, width: f64) -> Style {
        self.stroke = Some(Stroke {
            color: color.to_owned(),
            width: Some(width),
            dash: None,
            alpha: None,
            extra: Extra::new(),
        });
        self
    }

    fn stroke_alpha(mut self, alpha: f64) -> Style {
        if let Some(stroke) = &mut self.stroke {
            stroke.alpha = Some(alpha);
        }
        self
    }

    fn dashed(mut self) -> Style {
        if let Some(stroke) = &mut self.stroke {
            stroke.dash = Some(Dash::Dash);
        }
        self
    }
}

/// A run of `words` at `size` points.
pub fn run(words: &str, size: f64) -> Run {
    Run {
        size: Some(size),
        ..Run::plain(words)
    }
}

/// Looks to add to a run.
pub trait RunExt {
    fn color(self, color: &str) -> Run;
    fn bold(self) -> Run;
    fn font(self, role: &str) -> Run;
}

impl RunExt for Run {
    fn color(mut self, color: &str) -> Run {
        self.color = Some(color.to_owned());
        self
    }

    fn bold(mut self) -> Run {
        self.bold = true;
        self
    }

    fn font(mut self, role: &str) -> Run {
        self.font = Some(role.to_owned());
        self
    }
}

/// A paragraph of runs.
pub fn para(runs: Vec<Run>) -> Paragraph {
    Paragraph {
        runs,
        ..Paragraph::plain("")
    }
}

/// Looks to add to a paragraph.
pub trait ParaExt {
    /// The theme text style it starts from: `code`, `caption`, `citation` ...
    fn style(self, name: &str) -> Paragraph;
    fn align(self, align: Align) -> Paragraph;
    /// The line height as a multiple of the type size.
    fn spacing(self, multiple: f64) -> Paragraph;
    /// Space after the paragraph, in points.
    fn after(self, points: f64) -> Paragraph;
}

impl ParaExt for Paragraph {
    fn style(mut self, name: &str) -> Paragraph {
        self.style = Some(name.to_owned());
        self
    }

    fn align(mut self, align: Align) -> Paragraph {
        self.align = Some(align);
        self
    }

    fn spacing(mut self, multiple: f64) -> Paragraph {
        self.line_spacing = Some(multiple);
        self
    }

    fn after(mut self, points: f64) -> Paragraph {
        self.space_after = Some(points);
        self
    }
}

/// Space between the edge of a box and its text.
pub fn insets(left: f64, top: f64, right: f64, bottom: f64) -> Insets {
    Insets {
        left: round2(left),
        top: round2(top),
        right: round2(right),
        bottom: round2(bottom),
        extra: Extra::new(),
    }
}

/// Paragraphs in a box whose text starts `valign` and keeps `space` from the edges.
pub fn text_of(paragraphs: Vec<Paragraph>, valign: VAlign, space: Insets) -> Text {
    Text {
        valign: Some(valign),
        insets: Some(space),
        ..Text::from_paragraphs(paragraphs)
    }
}

/// Words that always take up a line: an empty run would leave the paragraph
/// measured by its style's size instead of the one it is set in.
pub fn shown(words: &str) -> &str {
    if words.is_empty() { " " } else { words }
}

/// Text of one paragraph and one run.
pub fn plain_text(words: &str) -> Text {
    Text::plain(words)
}

#[cfg(test)]
mod tests;
