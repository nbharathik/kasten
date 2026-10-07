use std::borrow::Cow;

use serde_json::json;
use slides_core::{Deck, Element, Engine, Run};

use super::*;

/// A deck of a title slide and one slide for each number in `steps`, which has that many clicks.
fn deck_of(steps: &[u32]) -> Deck {
    let mut engine = Engine::create("Steps", "Light", 3).unwrap_or_else(|e| panic!("{e}"));
    for (n, clicks) in steps.iter().enumerate() {
        let out = engine
            .apply(
                "add_slide",
                json!({ "layout": "title-only", "content": { "title": format!("Slide {}", n + 2) } }),
            )
            .unwrap_or_else(|e| panic!("{e}"));
        let slide = out.output["slide"].as_str().unwrap_or_default().to_owned();
        engine
            .apply(
                "set_slide_steps",
                json!({ "slide": slide, "steps": clicks }),
            )
            .unwrap_or_else(|e| panic!("{e}"));
    }
    engine.into_deck()
}

fn stepped(mode: StepsMode) -> Options {
    Options {
        steps: mode,
        ..Options::default()
    }
}

fn places(pages: &[Page]) -> Vec<(usize, Option<u32>)> {
    pages.iter().map(|p| (p.slide, p.step)).collect()
}

fn title_words(slide: &Slide) -> String {
    slide
        .elements
        .iter()
        .find(|e| e.base().placeholder.as_deref() == Some("title"))
        .and_then(Element::text)
        .map(|t| t.plain_text())
        .unwrap_or_default()
}

#[test]
fn a_slide_with_steps_is_a_page_for_each_state_in_order() {
    let deck = deck_of(&[3, 0]);
    assert_eq!(
        places(&pages(&deck, &Options::default())),
        [
            (0, Some(0)),
            (1, Some(0)),
            (1, Some(1)),
            (1, Some(2)),
            (1, Some(3)),
            (2, Some(0))
        ]
    );
    assert_eq!(StepsMode::default(), StepsMode::Expand);
}

#[test]
fn final_is_one_page_a_slide_in_the_state_after_the_last_click() {
    let deck = deck_of(&[3, 0]);
    assert_eq!(
        places(&pages(&deck, &stepped(StepsMode::Final))),
        [(0, Some(0)), (1, Some(3)), (2, Some(0))]
    );
}

#[test]
fn every_page_of_a_hidden_slide_goes_with_it() {
    let mut deck = deck_of(&[2, 1]);
    deck.slides[1].hidden = true;
    deck.slides[2].backup = true;
    assert_eq!(pages(&deck, &Options::default()).len(), 1 + 3 + 2);
    let lean = Options {
        include_hidden: false,
        ..Options::default()
    };
    assert_eq!(places(&pages(&deck, &lean)), [(0, Some(0))]);
}

#[test]
fn a_file_made_by_hand_cannot_ask_for_more_pages_than_a_slide_can_have() {
    let mut deck = deck_of(&[1]);
    deck.slides[1].steps = 4_000_000_000;
    let all = pages(&deck, &Options::default());
    assert_eq!(all.len(), 1 + (slides_core::ops::MOST_STEPS as usize + 1));
    assert_eq!(
        pages(&deck, &stepped(StepsMode::Final))[1].step,
        Some(slides_core::ops::MOST_STEPS)
    );
}

#[test]
fn a_page_of_a_slide_written_as_several_names_itself_in_its_title_and_only_there() {
    let deck = deck_of(&[3]);
    let slide = &deck.slides[1];
    let before = title_words(slide);
    assert_eq!(before, "Slide 2");
    for step in 0..=3 {
        let page = Page {
            slide: 1,
            step: Some(step),
        };
        let shown = page_slide(slide, &page, StepsMode::Expand);
        assert_eq!(title_words(&shown), format!("Slide 2 ({}/4)", step + 1));
    }
    assert_eq!(title_words(slide), before, "the deck keeps its title");
}

#[test]
fn a_slide_written_as_one_is_drawn_as_it_is() {
    let deck = deck_of(&[3, 0]);
    let page = |slide, step| Page {
        slide,
        step: Some(step),
    };
    let plain = page_slide(&deck.slides[2], &page(2, 0), StepsMode::Expand);
    assert!(matches!(plain, Cow::Borrowed(_)), "no steps, no suffix");
    let last = page_slide(&deck.slides[1], &page(1, 3), StepsMode::Final);
    assert!(
        matches!(last, Cow::Borrowed(_)),
        "the last state has the plain title"
    );
    assert_eq!(title_words(&last), "Slide 2");
}

#[test]
fn the_suffix_takes_the_look_of_the_last_words_and_a_blank_or_missing_title_gets_none() {
    let mut deck = deck_of(&[2]);
    let slide = &mut deck.slides[1];
    let Some(Element::Text(title)) = slide
        .elements
        .iter_mut()
        .find(|e| e.base().placeholder.as_deref() == Some("title"))
    else {
        panic!("a title")
    };
    title.text.paragraphs[0].runs = vec![
        Run::plain("Plain "),
        Run {
            bold: true,
            link: Some("https://example.com".into()),
            ..Run::plain("linked")
        },
        Run::plain(""),
    ];
    let page = Page {
        slide: 1,
        step: Some(1),
    };
    let shown = page_slide(&deck.slides[1], &page, StepsMode::Expand);
    let words = |s: &Slide| -> Vec<Run> {
        s.elements
            .iter()
            .find_map(|e| match e {
                Element::Text(t) if t.base.placeholder.as_deref() == Some("title") => {
                    Some(t.text.paragraphs[0].runs.clone())
                }
                _ => None,
            })
            .unwrap_or_default()
    };
    let runs = words(&shown);
    let suffix = runs.iter().find(|r| r.t == " (2/3)");
    assert!(
        suffix.is_some_and(|r| r.bold && r.link.is_none()),
        "{runs:?}"
    );
    assert_eq!(title_words(&shown), "Plain linked (2/3)");

    let mut blank = deck.slides[1].clone();
    for element in &mut blank.elements {
        if let Element::Text(t) = element {
            t.text = slides_core::Text::plain("");
        }
    }
    assert_eq!(
        title_words(&page_slide(&blank, &page, StepsMode::Expand)),
        ""
    );
    blank.elements.clear();
    assert!(
        page_slide(&blank, &page, StepsMode::Expand)
            .elements
            .is_empty()
    );
}

#[test]
fn the_notes_of_each_page_end_with_a_marker_that_names_the_slide_and_the_page() {
    let mut deck = deck_of(&[3, 0]);
    let id = deck.slides[1].id.clone();
    let page = |step| Page {
        slide: 1,
        step: Some(step),
    };
    assert_eq!(
        page_notes(&deck.slides[1], &page(1), StepsMode::Expand),
        [format!("[kasten {id} step 2/4]")],
        "a slide with no notes has just the marker"
    );
    deck.slides[1].notes = "Say this first.\n\nThen this.".to_owned();
    for step in 0..=3 {
        assert_eq!(
            page_notes(&deck.slides[1], &page(step), StepsMode::Expand),
            [
                "Say this first.".to_owned(),
                String::new(),
                "Then this.".to_owned(),
                String::new(),
                format!("[kasten {id} step {}/4]", step + 1)
            ]
        );
    }
    let plain = |slide: usize, mode| {
        page_notes(
            &deck.slides[slide],
            &Page {
                slide,
                step: Some(0),
            },
            mode,
        )
    };
    assert_eq!(
        plain(1, StepsMode::Final),
        ["Say this first.", "", "Then this."]
    );
    assert!(
        plain(2, StepsMode::Expand).is_empty(),
        "a slide with no steps has no marker"
    );
}
