//! How a page draws the state of its step: what is dimmed, what is outlined, the paragraphs
//! of a list that have not come yet, and the step label.

mod common;

use serde_json::{Value, json};
use slides_core::Deck;
use slides_pptx::{Options, StepsMode};

use common::inspect::{self, Package, package_with};
use common::{Builder, Files};

fn card(label: &str, x: f64) -> Value {
    json!({
        "type": "shape", "shape": "roundRect", "x": x, "y": 200, "w": 240, "h": 120,
        "style": { "fill": { "color": "accent2" } },
        "text": { "paragraphs": [{ "runs": [{ "t": label }] }], "valign": "middle" }
    })
}

fn export(deck: &Deck, options: &Options) -> Package {
    package_with(deck, &Files::default(), options)
}

/// The XML of the slide at `number` in the file.
fn page(package: &Package, number: usize) -> String {
    String::from_utf8_lossy(&package.parts[&format!("ppt/slides/slide{number}.xml")]).into_owned()
}

/// A title slide, then a blank slide with the given elements and the recipe built on them.
fn built(elements: Value, recipe: &str) -> Deck {
    let mut b = Builder::new("Light", "States", 33);
    let slide = b.slide("blank", json!({}));
    let ids = b.add(&slide.id, elements);
    b.apply(
        "build_steps",
        json!({ "slide": slide.id, "ids": ids, "recipe": recipe }),
    );
    b.deck()
}

#[test]
fn a_walkthrough_page_outlines_the_element_in_turn_and_dims_the_others() {
    let deck = built(
        json!([card("one", 40.0), card("two", 340.0), card("three", 640.0)]),
        "walkthrough",
    );
    let package = export(&deck, &Options::default());
    assert_eq!(inspect::slide_names(&package).len(), 1 + 4);
    // Page 2 is how the slide arrives: nothing dimmed, nothing outlined.
    let arrival = page(&package, 2);
    assert!(
        !arrival.contains("Highlight") && !arrival.contains("alpha"),
        "{arrival}"
    );
    for step in 1..=3 {
        let xml = page(&package, 2 + step);
        assert_eq!(xml.matches(r#"name="Highlight "#).count(), 1, "step {step}");
        assert_eq!(
            xml.matches(r#"<a:schemeClr val="accent2"><a:alpha val="25000"/>"#)
                .count(),
            2,
            "two fills are dimmed at step {step}"
        );
        // Two dimmed cards, each with the words and the paragraph mark in the mixed colour.
        assert_eq!(
            xml.matches(r#"<a:srgbClr val="C7C8C8"/>"#).count(),
            4,
            "step {step}"
        );
        assert!(
            !xml.contains(r#"<a:schemeClr val="tx1"><a:alpha"#),
            "words are mixed, not see-through"
        );
    }
    assert_eq!(inspect::problems(&package), Vec::<String>::new());
}

#[test]
fn a_spotlight_page_dims_the_others_and_outlines_nothing() {
    let deck = built(json!([card("one", 40.0), card("two", 340.0)]), "spotlight");
    let xml = page(&export(&deck, &Options::default()), 3);
    assert!(!xml.contains("Highlight"), "{xml}");
    assert_eq!(xml.matches(r#"<a:alpha val="25000"/>"#).count(), 1, "{xml}");
}

#[test]
fn the_items_of_a_list_that_have_not_come_yet_keep_their_place_and_show_nothing() {
    let list = json!([{
        "type": "text", "x": 60, "y": 100, "w": 600, "h": 300,
        "text": { "paragraphs": [
            { "runs": [{ "t": "Heading" }] },
            { "list": "bullet", "runs": [{ "t": "first" }] },
            { "list": "bullet", "runs": [{ "t": "second" }] },
            { "list": "bullet", "runs": [{ "t": "third" }] }
        ] }
    }]);
    let deck = built(list, "reveal");
    let package = export(&deck, &Options::default());
    assert_eq!(inspect::slide_names(&package).len(), 1 + 4);
    for step in 0..=3 {
        let xml = page(&package, 2 + step);
        // The bullet, the words and the paragraph mark of each item still to come.
        assert_eq!(
            xml.matches(r#"<a:alpha val="0"/>"#).count(),
            3 * (3 - step),
            "step {step}"
        );
        for words in ["Heading", "first", "second", "third"] {
            assert!(
                xml.contains(&format!("<a:t>{words}</a:t>")),
                "{words} keeps its room"
            );
        }
    }
    assert_eq!(inspect::problems(&package), Vec::<String>::new());
}

#[test]
fn the_step_label_says_the_step_of_the_page_it_is_on() {
    let mut b = Builder::new("Light", "Label", 9);
    let slide = b.slide("blank", json!({}));
    b.add(
        &slide.id,
        json!([{
            "type": "text", "x": 700, "y": 480, "w": 200, "h": 40,
            "text": { "paragraphs": [{ "runs": [{ "t": "Step 1 / 3", "field": "stepLabel" }] }] }
        }]),
    );
    b.apply("set_slide_steps", json!({ "slide": slide.id, "steps": 3 }));
    let deck = b.deck();
    let package = export(&deck, &Options::default());
    for step in 0..=3 {
        let xml = page(&package, 2 + step);
        assert!(
            xml.contains(&format!("<a:t>Step {step} / 3</a:t>")),
            "step {step}: {xml}"
        );
    }
    let last = export(
        &deck,
        &Options {
            steps: StepsMode::Final,
            ..Options::default()
        },
    );
    assert!(page(&last, 2).contains("<a:t>Step 3 / 3</a:t>"));
}

/// The colour of the run that says `words`: the last `srgbClr` before it.
fn ink_of(xml: &str, words: &str) -> String {
    let at = xml
        .find(&format!("<a:t>{words}</a:t>"))
        .unwrap_or_else(|| panic!("{words} in {xml}"));
    let key = r#"<a:srgbClr val=""#;
    let start = xml[..at]
        .rfind(key)
        .unwrap_or_else(|| panic!("a colour before {words}"))
        + key.len();
    xml[start..start + 6].to_owned()
}

/// The fill of the first shape of the given geometry.
fn fill_of(xml: &str, geometry: &str) -> String {
    let key = r#"<a:srgbClr val=""#;
    let from = xml
        .find(&format!(r#"prst="{geometry}""#))
        .unwrap_or_else(|| panic!("a {geometry} in {xml}"));
    let start = from + xml[from..].find(key).unwrap_or_else(|| panic!("a fill")) + key.len();
    xml[start..start + 6].to_owned()
}

/// `top` a quarter over `under`, as the hex a file holds.
fn quarter(top: &str, under: &str) -> String {
    let channel =
        |hex: &str, at: usize| f64::from(u8::from_str_radix(&hex[at..at + 2], 16).unwrap_or(0));
    [0, 2, 4]
        .iter()
        .map(|at| {
            let (over, below) = (channel(top, *at), channel(under, *at));
            format!("{:02X}", (below + (over - below) * 0.25).round() as u8)
        })
        .collect()
}

#[test]
fn the_lines_of_code_out_of_focus_dim_toward_the_panel_they_are_on_and_not_the_page() {
    let mut b = Builder::new("Light", "Code", 4);
    let slide = b.slide("blank", json!({}));
    b.add(
        &slide.id,
        json!([{
            "type": "code", "x": 60, "y": 100, "w": 500, "h": 200, "language": "text",
            "code": "alpha\nbeta", "focus": ["1", "2"]
        }]),
    );
    let deck = b.deck();
    let package = export(&deck, &Options::default());
    assert_eq!(
        inspect::slide_names(&package).len(),
        1 + 3,
        "a slide with two steps"
    );
    let (start, first) = (page(&package, 2), page(&package, 3));
    let panel = fill_of(&start, "roundRect");
    let ink = ink_of(&start, "beta");
    assert_eq!(
        ink_of(&first, "alpha"),
        ink_of(&start, "alpha"),
        "the focus is as it was"
    );
    // Line 2 is out of focus at step 1: a quarter of its colour over the panel, which is dark.
    let dimmed = ink_of(&first, "beta");
    assert_eq!(dimmed, quarter(&ink, &panel), "panel {panel}, ink {ink}");
    assert_ne!(dimmed, quarter(&ink, "FFFFFF"), "not toward the white page");
    assert_eq!(inspect::problems(&package), Vec::<String>::new());
}

#[test]
fn a_list_that_builds_on_a_card_hides_the_items_to_come_in_the_colour_of_the_card() {
    let mut b = Builder::new("Light", "Card", 5);
    let slide = b.slide("blank", json!({}));
    b.add(
        &slide.id,
        json!([
            { "type": "shape", "shape": "roundRect", "x": 60, "y": 100, "w": 420, "h": 250,
              "style": { "fill": { "color": "#1F2A44" } } },
            { "type": "text", "x": 90, "y": 120, "w": 360, "h": 200, "text": { "paragraphs": [
                { "list": "bullet", "runs": [{ "t": "now", "color": "#FFFFFF" }] },
                { "list": "bullet", "step": 1, "runs": [{ "t": "later", "color": "#FFFFFF" }] }
            ] } }
        ]),
    );
    b.apply("set_slide_steps", json!({ "slide": slide.id, "steps": 1 }));
    let package = export(&b.deck(), &Options::default());
    let start = page(&package, 2);
    assert_eq!(ink_of(&start, "now"), "FFFFFF");
    assert_eq!(
        ink_of(&start, "later"),
        "1F2A44",
        "the words are the card's colour"
    );
    assert!(
        start.contains(r#"<a:buClr><a:srgbClr val="1F2A44">"#),
        "and so is the bullet: {start}"
    );
    let shown = page(&package, 3);
    assert_eq!(ink_of(&shown, "later"), "FFFFFF");
}
