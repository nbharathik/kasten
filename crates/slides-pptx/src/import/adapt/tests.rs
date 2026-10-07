use slides_core::{Base, Element, Size, Slide, Text, themes};

use super::*;

fn theme() -> Theme {
    themes::by_name("Light").unwrap_or_else(|| panic!("the Light theme"))
}

fn slide_with(layout: &str, roles: &[&str]) -> Slide {
    let mut slide = Slide::new("s-1", layout);
    for (i, role) in roles.iter().enumerate() {
        let mut base = Base::new(format!("e-{i}"));
        base.placeholder = Some((*role).to_owned());
        slide
            .elements
            .push(Element::text_el(base, Text::plain(*role)));
    }
    slide
}

static SIZE: std::sync::LazyLock<Size> = std::sync::LazyLock::new(|| Size {
    w: 960.0,
    h: 540.0,
    extra: slides_core::Extra::new(),
});

#[test]
fn a_layout_the_other_deck_has_with_all_the_slots_is_kept() {
    let t = theme();
    let slide = slide_with("title-body", &["title", "body"]);
    assert_eq!(choose_layout(&slide, &t, &t), "title-body");
    let out = adapt_slide(
        slide.clone(),
        Frame {
            theme: &t,
            size: &SIZE,
        },
        Frame {
            theme: &t,
            size: &SIZE,
        },
    );
    assert_eq!(out, slide, "nothing changes when nothing differs");
}

#[test]
fn a_layout_the_other_deck_lacks_is_replaced_by_the_one_with_the_most_alike_slots() {
    let from = theme();
    let mut to = theme();
    to.layouts
        .retain(|l| matches!(l.name.as_str(), "title" | "title-only" | "blank"));
    let slide = slide_with("title-body", &["title", "body"]);
    // No layout there has a body slot; the one with the title stands in, and the body keeps its box.
    let out = adapt_slide(
        slide,
        Frame {
            theme: &from,
            size: &SIZE,
        },
        Frame {
            theme: &to,
            size: &SIZE,
        },
    );
    assert_eq!(out.layout, "title-only");
    let title = &out.elements[0];
    assert_eq!(title.base().placeholder.as_deref(), Some("title"));
    let body = &out.elements[1];
    assert_eq!(body.base().placeholder, None);
    let slot = from
        .layout("title-body")
        .and_then(|l| l.placeholder("body"))
        .map(|p| (p.x, p.y, p.w, p.h));
    assert_eq!(body.base().rect(), slot, "the box the slot gave it");
}

#[test]
fn a_slot_of_the_wrong_kind_is_not_filled() {
    let t = theme();
    let mut slide = slide_with("title-image", &["title"]);
    let mut base = Base::new("e-9");
    base.placeholder = Some("image".to_owned());
    slide.elements.push(Element::text_el(
        base,
        Text::plain("words in a picture slot"),
    ));
    let out = adapt_slide(
        slide,
        Frame {
            theme: &t,
            size: &SIZE,
        },
        Frame {
            theme: &t,
            size: &SIZE,
        },
    );
    assert_eq!(out.elements[1].base().placeholder, None);
    assert!(out.elements[1].base().rect().is_some());
}

#[test]
fn a_narrower_slide_is_centred_on_a_wider_one_and_a_wider_one_is_shrunk_to_fit() {
    let t = theme();
    let four_three = Size {
        w: 720.0,
        h: 540.0,
        extra: slides_core::Extra::new(),
    };
    let mut slide = Slide::new("s-1", "blank");
    let mut base = Base::new("e-1").place(100.0, 50.0, 200.0, 40.0);
    base.style = Some(slides_core::Style {
        radius: Some(8.0),
        ..slides_core::Style::default()
    });
    let mut text = Text::plain("hello");
    text.paragraphs[0].runs[0].size = Some(30.0);
    slide.elements.push(Element::text_el(base, text));

    let wide = adapt_slide(
        slide.clone(),
        Frame {
            theme: &t,
            size: &four_three,
        },
        Frame {
            theme: &t,
            size: &SIZE,
        },
    );
    assert_eq!(
        wide.elements[0].base().rect(),
        Some((220.0, 50.0, 200.0, 40.0)),
        "moved 120 units to the right, same size"
    );

    let narrow = adapt_slide(
        wide,
        Frame {
            theme: &t,
            size: &SIZE,
        },
        Frame {
            theme: &t,
            size: &four_three,
        },
    );
    let (x, y, w, h) = narrow.elements[0].base().rect().unwrap_or_default();
    assert_eq!(
        (x, y, w, h),
        (165.0, 105.0, 150.0, 30.0),
        "three quarters of the size, centred"
    );
    let run = &narrow.elements[0]
        .text()
        .map(|t| t.paragraphs[0].runs[0].size);
    assert_eq!(*run, Some(Some(22.5)));
    assert_eq!(
        narrow.elements[0]
            .base()
            .style
            .as_ref()
            .and_then(|s| s.radius),
        Some(6.0)
    );
}
