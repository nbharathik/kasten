use slides_core::{Base, Element, Extra, GroupEl, StepState, Text};

use super::*;
use crate::testing::with_cx;

mod behind;

fn text(id: &str) -> Element {
    Element::text_el(Base::new(id).place(0.0, 0.0, 100.0, 40.0), Text::plain("t"))
}

fn stepped(mut el: Element, states: &[(u32, StepState)]) -> Element {
    for (step, state) in states {
        el.base_mut().step_states.insert(*step, state.clone());
    }
    el
}

fn group_of(child: Element, states: &[(u32, StepState)]) -> Element {
    let group = Element::Group(GroupEl {
        base: Base::new("g"),
        children: vec![child],
        extra: Extra::new(),
    });
    stepped(group, states)
}

fn at_step(el: &Element, step: Option<u32>) -> String {
    with_cx(|cx| {
        cx.step = step;
        xml_of(cx, el)
    })
}

#[test]
fn a_hidden_element_is_left_out_of_its_steps_and_comes_back_after_them() {
    let el = stepped(text("a"), &[(1, StepState::Hidden), (3, StepState::Normal)]);
    for shown in [None, Some(0), Some(3), Some(9)] {
        assert!(at_step(&el, shown).contains("<p:sp>"), "{shown:?}");
    }
    for hidden in [Some(1), Some(2)] {
        assert_eq!(at_step(&el, hidden), "", "{hidden:?}");
    }
}

/// A filled box with words in the theme's text colour, so both its fill and its words can fade.
fn card(id: &str) -> Element {
    let mut base = Base::new(id).place(0.0, 0.0, 100.0, 40.0);
    base.style = Some(slides_core::Style {
        fill: Some(slides_core::Fill {
            color: "accent2".into(),
            alpha: None,
            extra: Extra::new(),
        }),
        ..slides_core::Style::default()
    });
    Element::shape(base, "rect", Some(Text::plain("t")))
}

#[test]
fn a_dimmed_element_is_faded_by_the_share_the_theme_names() {
    let el = stepped(card("a"), &[(0, StepState::Dimmed)]);
    let (out, share) = with_cx(|cx| {
        cx.step = Some(0);
        (xml_of(cx, &el), cx.deck.theme.dimmed_opacity)
    });
    let alpha = format!(r#"<a:alpha val="{}"/>"#, (share * 100_000.0).round() as i64);
    assert_eq!(
        out.matches(&alpha).count(),
        1,
        "the fill is see-through, and nothing else is: {out}"
    );
    assert!(
        out.contains(r#"<a:schemeClr val="accent2">"#) && out.contains(&alpha),
        "{out}"
    );
    assert!(
        out.contains(r#"<a:srgbClr val="C7C8C8"/>"#),
        "the words are mixed toward the page, so a program that ignores transparency dims them too: {out}"
    );
    assert!(!at_step(&el, None).contains("alpha"));
}

#[test]
fn a_highlighted_element_is_drawn_as_it_is_styled_and_the_outline_comes_after_it() {
    let el = stepped(text("a"), &[(0, StepState::Highlighted)]);
    let out = at_step(&el, Some(0));
    let plain = at_step(&text("a"), None);
    assert!(
        out.starts_with(&plain),
        "the element itself is as it is styled: {out}"
    );
    assert!(out.len() > plain.len());
}

/// The theme's outline: its colour token and its width.
fn outline() -> (String, f64) {
    with_cx(|cx| {
        let h = cx.deck.theme.highlight.clone();
        (h.color, h.width)
    })
}

/// The `p:sp` that follows the element, when it is highlighted.
fn ring_of(el: &Element) -> String {
    let out = at_step(
        &stepped(el.clone(), &[(0, StepState::Highlighted)]),
        Some(0),
    );
    let plain = at_step(el, Some(0));
    assert!(out.starts_with(&plain), "{out}");
    out[plain.len()..].to_owned()
}

fn placed(mut el: Element, x: f64, y: f64, w: f64, h: f64) -> Element {
    let base = el.base_mut();
    base.x = Some(x);
    base.y = Some(y);
    base.w = Some(w);
    base.h = Some(h);
    el
}

#[test]
fn the_outline_of_a_highlight_is_the_themes_colour_and_width_a_little_off_the_element() {
    let (color, width) = outline();
    assert_eq!((color.as_str(), width), ("accent1", 2.0), "the Light theme");
    let ring = ring_of(&placed(text("a"), 100.0, 50.0, 200.0, 40.0));
    // Stands 2 units off, and its line is centred half its width further out.
    let pad = 2.0 + width / 2.0;
    assert!(ring.starts_with(r#"<p:sp><p:nvSpPr><p:cNvPr id="3" name="Highlight 3"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>"#), "{ring}");
    let (x, y, w, h) = (100.0 - pad, 50.0 - pad, 200.0 + 2.0 * pad, 40.0 + 2.0 * pad);
    let place = format!(
        r#"<a:xfrm><a:off x="{}" y="{}"/><a:ext cx="{}" cy="{}"/></a:xfrm>"#,
        (x * 9525.0).round(),
        (y * 9525.0).round(),
        (w * 9525.0).round(),
        (h * 9525.0).round()
    );
    assert!(ring.contains(&place), "{ring}");
    assert!(
        ring.contains(r#"<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>"#),
        "{ring}"
    );
    assert!(
        ring.contains(r#"<a:ln w="19050" cap="flat" cmpd="sng"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:prstDash val="solid"/><a:round/></a:ln>"#),
        "{ring}"
    );
    assert!(!ring.contains("txBody"), "{ring}");
}

#[test]
fn the_outline_follows_a_rounded_shape_and_an_ellipse_and_turns_with_the_element() {
    let rounded = Element::shape(
        Base::new("r").place(0.0, 0.0, 200.0, 100.0),
        "roundRect",
        None,
    );
    let ring = ring_of(&rounded);
    // The corner is a sixth of the shorter side, 100 / 6 = 16.67, and the ring is that plus the gap and half the line.
    let radius = 100.0 / 6.0 + 3.0;
    let adjust = (radius / 106.0 * 100_000.0_f64).round() as i64;
    assert!(
        ring.contains(&format!(
            r#"<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val {adjust}"/>"#
        )),
        "{ring}"
    );

    let ellipse = Element::shape(
        Base::new("o").place(0.0, 0.0, 200.0, 100.0),
        "ellipse",
        None,
    );
    assert!(ring_of(&ellipse).contains(r#"prst="ellipse""#));

    let triangle = Element::shape(
        Base::new("t").place(0.0, 0.0, 200.0, 100.0),
        "triangle",
        None,
    );
    assert!(
        ring_of(&triangle).contains(r#"prst="rect""#),
        "other shapes get a plain frame"
    );

    let mut turned = Element::shape(Base::new("s").place(0.0, 0.0, 200.0, 100.0), "rect", None);
    turned.base_mut().rotation = Some(30.0);
    turned.base_mut().flip_h = true;
    assert!(ring_of(&turned).contains(r#"<a:xfrm rot="1800000" flipH="1">"#));
}

#[test]
fn a_highlighted_group_is_outlined_as_a_whole_and_what_is_hidden_has_no_outline() {
    let inside = vec![
        placed(text("a"), 100.0, 100.0, 50.0, 20.0),
        placed(text("b"), 300.0, 200.0, 50.0, 20.0),
    ];
    let group = Element::Group(GroupEl {
        base: Base::new("g"),
        children: inside,
        extra: Extra::new(),
    });
    let ring = ring_of(&group);
    assert_eq!(
        ring.matches("<p:sp>").count(),
        1,
        "one outline for the group: {ring}"
    );
    let pad: f64 = 3.0;
    let place = format!(
        r#"<a:off x="{}" y="{}"/><a:ext cx="{}" cy="{}"/>"#,
        ((100.0 - pad) * 9525.0).round(),
        ((100.0 - pad) * 9525.0).round(),
        ((250.0 + 2.0 * pad) * 9525.0).round(),
        ((120.0 + 2.0 * pad) * 9525.0).round()
    );
    assert!(ring.contains(&place), "{ring}");

    let hidden = stepped(text("a"), &[(0, StepState::Hidden)]);
    assert_eq!(at_step(&hidden, Some(0)), "");
    assert!(
        !at_step(&stepped(text("a"), &[(0, StepState::Normal)]), Some(0)).contains("Highlight")
    );
}

#[test]
fn an_outline_inside_a_dimmed_group_is_dimmed_with_it() {
    let inside = stepped(
        placed(text("a"), 10.0, 10.0, 50.0, 20.0),
        &[(0, StepState::Highlighted)],
    );
    let group = group_of(inside, &[(0, StepState::Dimmed)]);
    let out = at_step(&group, Some(0));
    let ring = &out[out.find("Highlight").unwrap_or(0)..];
    assert!(
        ring.contains(r#"<a:schemeClr val="accent1"><a:alpha val="25000"/>"#),
        "{ring}"
    );
}

#[test]
fn a_group_hidden_at_a_step_hides_what_it_holds_and_a_dimmed_one_fades_it() {
    let hidden = group_of(text("a"), &[(0, StepState::Hidden)]);
    assert_eq!(at_step(&hidden, Some(0)), "");
    let dimmed = group_of(card("a"), &[(0, StepState::Dimmed)]);
    let out = at_step(&dimmed, Some(0));
    assert!(
        out.contains("<p:grpSp>")
            && out.contains(r#"<a:schemeClr val="accent2"><a:alpha val="25000"/>"#),
        "{out}"
    );
    assert!(
        out.contains(r#"<a:srgbClr val="C7C8C8"/>"#),
        "what the group holds is dimmed: {out}"
    );
    assert!(!at_step(&dimmed, None).contains("alpha"));
}

#[test]
fn a_dimmed_element_in_a_dimmed_group_is_dimmed_twice() {
    let inner = stepped(card("a"), &[(0, StepState::Dimmed)]);
    let group = group_of(inner, &[(0, StepState::Dimmed)]);
    let out = at_step(&group, Some(0));
    // A quarter of a quarter is a sixteenth: 6250 of 100000.
    assert!(out.contains(r#"<a:alpha val="6250"/>"#), "{out}");
    // Mixed twice toward white: 255 - (255 - 32) / 16 = 241.06, 241.19 and 241.25.
    assert!(out.contains(r#"<a:srgbClr val="F1F1F1"/>"#), "{out}");
}

#[test]
fn an_element_with_no_position_is_left_out_and_reported() {
    let el = Element::text_el(Base::new("floating"), Text::plain("t"));
    let (out, warnings) = with_cx(|cx| (xml_of(cx, &el), cx.shared.warnings.clone()));
    assert_eq!(out, "");
    assert_eq!(warnings.len(), 1, "{warnings:?}");
    assert_eq!(warnings[0].element.as_deref(), Some("floating"));
    assert_eq!(warnings[0].slide.as_deref(), Some("s-test"));
    assert!(warnings[0].message.contains("no position"), "{warnings:?}");
}

#[test]
fn an_empty_placeholder_is_kept_so_that_its_prompt_shows_while_editing() {
    let mut base = Base::new("t");
    base.placeholder = Some("title".into());
    let el = Element::text_el(base, Text::plain(""));
    let out = with_cx(|cx| {
        cx.layout = "title".into();
        xml_of(cx, &el)
    });
    assert!(out.contains(r#"<p:ph type="ctrTitle"/>"#), "{out}");
    assert!(out.contains("<a:xfrm>"), "{out}");
}
