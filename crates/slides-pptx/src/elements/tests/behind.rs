//! What words are mixed toward when a step dims them: the shape they lie on, else the page.

use slides_core::{Base, Element, Extra, GroupEl, StepState, Text};

use super::{at_step, group_of, stepped};
use crate::elements::xml_of;
use crate::testing::with_cx;

/// A dark panel with words on it in a group, the way a code block is laid out.
fn on_a_panel(panel_states: &[(u32, StepState)], words: Vec<Element>) -> Element {
    let mut base = Base::new("panel").place(0.0, 0.0, 300.0, 100.0);
    base.style = Some(slides_core::Style {
        fill: Some(slides_core::Fill {
            color: "#101820".into(),
            alpha: None,
            extra: Extra::new(),
        }),
        ..slides_core::Style::default()
    });
    let panel = stepped(Element::shape(base, "roundRect", None), panel_states);
    let mut children = vec![panel];
    children.extend(words);
    Element::Group(GroupEl {
        base: Base::new("code"),
        children,
        extra: Extra::new(),
    })
}

/// A line of words in `color`, at `x` and `w` across the panel and 10 down.
fn words(id: &str, color: &str, x: f64, w: f64) -> Element {
    let mut text = Text::plain("t");
    text.paragraphs[0].runs[0].color = Some(color.into());
    Element::text_el(Base::new(id).place(x, 10.0, w, 20.0), text)
}

#[test]
fn words_a_step_dims_are_mixed_toward_the_shape_they_lie_on() {
    let line = stepped(
        words("l", "#000000", 10.0, 200.0),
        &[(1, StepState::Dimmed)],
    );
    let out = at_step(&on_a_panel(&[], vec![line]), Some(1));
    // A quarter black over #101820 is 12, 18 and 24; over the white page it would be BFBFBF.
    assert!(out.contains(r#"<a:srgbClr val="0C1218"/>"#), "{out}");
    assert!(!out.contains("BFBFBF"), "{out}");
    let before = at_step(
        &on_a_panel(
            &[],
            vec![stepped(
                words("l", "#000000", 10.0, 200.0),
                &[(1, StepState::Dimmed)],
            )],
        ),
        Some(0),
    );
    assert!(before.contains(r#"<a:srgbClr val="000000"/>"#), "{before}");
}

#[test]
fn words_off_the_shape_are_mixed_toward_the_page() {
    // 250 to 350 across a panel that ends at 300.
    let line = stepped(
        words("l", "#000000", 250.0, 100.0),
        &[(1, StepState::Dimmed)],
    );
    let out = at_step(&on_a_panel(&[], vec![line]), Some(1));
    assert!(out.contains(r#"<a:srgbClr val="BFBFBF"/>"#), "{out}");
}

#[test]
fn a_panel_that_is_dimmed_shows_as_the_faded_colour_and_words_on_it_mix_toward_that() {
    let line = stepped(
        words("l", "#000000", 10.0, 200.0),
        &[(1, StepState::Dimmed)],
    );
    let out = at_step(&on_a_panel(&[(1, StepState::Dimmed)], vec![line]), Some(1));
    // The panel is a quarter of #101820 over white: 195, 197 and 199. The words are a quarter black over that.
    assert!(out.contains(r#"<a:srgbClr val="929495"/>"#), "{out}");
}

#[test]
fn a_group_that_is_dimmed_mixes_what_it_holds_toward_what_lies_behind_the_group() {
    let inside = words("l", "#000000", 10.0, 200.0);
    let group = group_of(on_a_panel(&[], vec![inside]), &[(1, StepState::Dimmed)]);
    let out = at_step(&group, Some(1));
    // As one picture a quarter strong on the white page, the words are not over the panel's colour.
    assert!(out.contains(r#"<a:srgbClr val="BFBFBF"/>"#), "{out}");
    assert!(!out.contains("0C1218"), "{out}");
}

/// Words with a paragraph that comes at step 2.
fn later_words(x: f64) -> Element {
    let mut text = Text::plain("later");
    text.paragraphs[0].step = Some(2);
    Element::text_el(Base::new("w").place(x, 10.0, 200.0, 20.0), text)
}

#[test]
fn words_that_are_not_there_yet_take_the_colour_of_what_they_lie_on() {
    let hidden = r#"<a:srgbClr val="101820"><a:alpha val="0"/></a:srgbClr>"#;
    let out = at_step(&on_a_panel(&[], vec![later_words(10.0)]), Some(1));
    assert!(out.contains(hidden), "{out}");
    let shown = at_step(&on_a_panel(&[], vec![later_words(10.0)]), Some(2));
    assert!(!shown.contains(hidden), "{shown}");
}

#[test]
fn words_that_are_not_there_yet_in_a_filled_shape_take_the_fill() {
    let mut text = Text::plain("later");
    text.paragraphs[0].step = Some(2);
    let mut base = Base::new("a").place(0.0, 0.0, 100.0, 40.0);
    base.style = Some(slides_core::Style {
        fill: Some(slides_core::Fill {
            color: "accent2".into(),
            alpha: None,
            extra: Extra::new(),
        }),
        ..slides_core::Style::default()
    });
    let card = Element::shape(base, "rect", Some(text));
    let (out, fill) = with_cx(|cx| {
        cx.step = Some(1);
        let fill = cx.deck.theme.resolve_color("accent2").unwrap_or_default();
        (
            xml_of(cx, &card),
            fill.trim_start_matches('#').to_uppercase(),
        )
    });
    let hidden = format!(r#"<a:srgbClr val="{fill}"><a:alpha val="0"/></a:srgbClr>"#);
    assert!(out.contains(&hidden), "{out}");
}
