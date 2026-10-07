mod contracts;
mod props;
mod samples;

use super::*;
use crate::model::{Base, CodeEl, Element, Extra};

fn code() -> Element {
    Element::Code(CodeEl {
        base: Base::new("e-code").place(40.0, 60.0, 400.0, 200.0),
        language: "python".to_owned(),
        code: "print(1)".to_owned(),
        theme: None,
        line_numbers: false,
        first_line: None,
        focus: vec!["1".to_owned()],
        font_size: None,
        extra: Extra::new(),
    })
}

fn theme() -> crate::model::Theme {
    crate::themes::by_name("Light").unwrap()
}

#[test]
fn only_composites_expand_and_they_need_a_box() {
    let theme = theme();
    let text = Element::text_el(
        Base::new("e-1").place(0.0, 0.0, 10.0, 10.0),
        plain_text("x"),
    );
    assert!(expand(&theme, "blank", &text).is_none());
    let mut no_box = code();
    no_box.base_mut().w = None;
    assert!(expand(&theme, "blank", &no_box).is_none());
    assert!(expand(&theme, "blank", &code()).is_some());
}

#[test]
fn the_parts_have_the_same_ids_every_time() {
    let theme = theme();
    let ids = |e: &Element| -> Vec<String> {
        expand(&theme, "blank", e)
            .unwrap()
            .iter()
            .map(|p| p.id().to_owned())
            .collect()
    };
    assert_eq!(ids(&code()), ids(&code()));
    assert!(ids(&code()).iter().all(|id| id.starts_with("e-code.")));
}

#[test]
fn a_group_stands_where_the_composite_stood() {
    let theme = theme();
    let group = expanded_group(&theme, "blank", &code()).unwrap();
    assert_eq!(group.id(), "e-code");
    assert_eq!(group.base().rect(), Some((40.0, 60.0, 400.0, 200.0)));
    assert!(!group.children().is_empty());
}

#[test]
fn a_deck_expands_composites_wherever_they_are() {
    let mut deck = crate::Engine::create("Deck", "Light", 1)
        .unwrap()
        .deck()
        .clone();
    deck.slides[0].elements.push(code());
    let expanded = expand_deck(&deck);
    assert!(
        expanded.slides[0]
            .elements
            .iter()
            .all(|e| !e.is_composite())
    );
    assert_eq!(
        expanded.slides[0].elements.len(),
        deck.slides[0].elements.len()
    );
}

#[test]
fn code_with_focus_asks_for_a_step_for_each_entry() {
    assert_eq!(steps_needed(&code()), 1);
    assert_eq!(
        steps_needed(&Element::text_el(Base::new("e-1"), plain_text("x"))),
        0
    );
}

#[test]
fn every_kind_has_something_to_tell_an_agent() {
    for kind in [
        "code",
        "math",
        "chat",
        "token-probs",
        "card-grid",
        "citation",
        "step-label",
        "embed",
        "video",
    ] {
        assert!(guidance(kind).is_some(), "{kind}");
    }
    assert!(guidance("text").is_none());
}
