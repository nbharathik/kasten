//! Step label: "Step 1 / 3", kept up to date as the slide is stepped through.
//!
//! It is a text box whose one run stands for a field, `stepLabel`. The text in
//! the run is only a sample: whoever draws the slide fills in the step it is at,
//! in the words the deck asks for. The element's `format` changes the sample, so a
//! deck that words its label differently still looks right in a viewer that knows
//! nothing of fields.

use super::Ctx;
use super::build::{ParaExt, Parts, para, run};
use super::geom::sane;
use super::measure::{Face, fit_pt, width};
use crate::model::{Element, Paragraph, Run, StepLabelEl, Text, VAlign};
use crate::units::points_to_units;

/// The smallest the label is set, in points.
const FLOOR_PT: f64 = 8.0;
/// The insets a text box has when the text names none.
const SIDE: f64 = 9.6;
const TOP: f64 = 4.8;

/// The words a deck uses when nothing else is said.
pub const DEFAULT_FORMAT: &str = "Step {n} / {total}";

/// The sample: the format with step 1 of 3 filled in.
pub fn sample(format: Option<&str>) -> String {
    format
        .unwrap_or(DEFAULT_FORMAT)
        .replace("{n}", "1")
        .replace("{total}", "3")
}

pub fn expand(cx: &Ctx, element: &StepLabelEl) -> Vec<Element> {
    let rect = sane(cx.rect);
    let sample = sample(element.format.as_deref());
    let theme_size = cx.theme.text_style("caption").map_or(14.0, |s| s.size);
    // The label grows by a digit or two as steps count up, so it is measured at its widest.
    let widest = sample.replace(['1', '3'], "12");
    let (room_w, room_h) = (rect.w - 2.0 * SIDE, rect.h - 2.0 * TOP);
    let size = fit_pt(theme_size, FLOOR_PT.min(theme_size), |pt| {
        width(&widest, pt, Face::Sans, false) <= room_w
            && points_to_units(pt * 1.2) <= room_h + 1.0e-6
    });
    let mut label: Run = if size == theme_size {
        Run::plain(sample)
    } else {
        run(&sample, size)
    };
    label.field = Some("stepLabel".to_owned());
    let paragraph: Paragraph = para(vec![label]).style("caption");
    let text = Text {
        valign: Some(VAlign::Middle),
        ..Text::from_paragraphs(vec![paragraph])
    };
    let mut parts = Parts::new(cx.id, rect);
    parts.text(rect, text);
    parts.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::composites::expand as expand_element;
    use crate::model::Base;

    fn label(format: Option<&str>, w: f64, h: f64) -> StepLabelEl {
        StepLabelEl {
            base: Base::new("e-step").place(800.0, 500.0, w, h),
            format: format.map(str::to_owned),
            extra: crate::model::Extra::new(),
        }
    }

    fn parts_of(el: StepLabelEl) -> Vec<Element> {
        let theme = crate::themes::light();
        expand_element(&theme, "blank", &Element::StepLabel(el)).unwrap_or_default()
    }

    #[test]
    fn the_sample_is_step_one_of_three_in_the_decks_words_or_the_elements() {
        assert_eq!(sample(None), "Step 1 / 3");
        assert_eq!(sample(Some("{n} of {total}")), "1 of 3");
        assert_eq!(sample(Some("Slide part {n}")), "Slide part 1");
        assert_eq!(sample(Some("no numbers")), "no numbers");
    }

    #[test]
    fn a_label_is_a_text_box_of_one_run_that_stands_for_the_step_label_field() {
        let parts = parts_of(label(None, 140.0, 36.0));
        assert_eq!(parts.len(), 1);
        let text = parts[0].text().expect("text");
        assert_eq!(text.paragraphs.len(), 1);
        let run = &text.paragraphs[0].runs[0];
        assert_eq!(
            (run.t.as_str(), run.field.as_deref()),
            ("Step 1 / 3", Some("stepLabel"))
        );
        assert_eq!(text.paragraphs[0].style.as_deref(), Some("caption"));
        assert_eq!(run.size, None, "the caption size stands");
        assert_eq!(parts[0].base().rect(), Some((800.0, 500.0, 140.0, 36.0)));
    }

    #[test]
    fn the_format_only_changes_the_sample() {
        let parts = parts_of(label(Some("{n} of {total}"), 120.0, 32.0));
        let run = &parts[0].text().expect("text").paragraphs[0].runs[0];
        assert_eq!(
            (run.t.as_str(), run.field.as_deref()),
            ("1 of 3", Some("stepLabel"))
        );
    }

    #[test]
    fn a_small_box_makes_the_label_smaller_but_not_below_eight_points() {
        let size = |w: f64, h: f64| {
            parts_of(label(None, w, h))[0]
                .text()
                .expect("text")
                .paragraphs[0]
                .runs[0]
                .size
        };
        assert_eq!(size(200.0, 40.0), None);
        let narrow = size(70.0, 40.0).expect("smaller");
        assert!((8.0..14.0).contains(&narrow), "{narrow}");
        assert_eq!(size(10.0, 10.0), Some(8.0));
    }

    #[test]
    fn a_degenerate_box_gives_finite_numbers() {
        for (w, h) in [(0.0, 0.0), (f64::NAN, 5.0)] {
            let p = parts_of(label(None, w, h));
            let (x, y, pw, ph) = p[0].base().rect().expect("a box");
            assert!([x, y, pw, ph].iter().all(|v| v.is_finite() && *v >= 0.0));
        }
    }
}
