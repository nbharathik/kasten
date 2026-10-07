//! Writing a deck as an outline.

use serde_json::json;

use super::{add, engine};
use crate::model::Paragraph;
use crate::ops::Engine;
use crate::outline::{outline_of, parse_outline};

fn add_elements(e: &mut Engine, slide: &str, elements: serde_json::Value) {
    e.apply(
        "add_elements",
        json!({ "slide": slide, "elements": elements }),
    )
    .unwrap();
}

fn text_box(paragraphs: serde_json::Value) -> serde_json::Value {
    json!({ "type": "text", "x": 60, "y": 120, "w": 400, "h": 60, "text": { "paragraphs": paragraphs } })
}

#[test]
fn a_deck_is_its_title_then_a_heading_and_blocks_for_every_slide() {
    let mut e = engine();
    add(
        &mut e,
        "title-body",
        json!({ "title": "Results", "body": "- one\n- two" }),
    );
    assert_eq!(
        outline_of(e.deck()),
        "# Test deck\n\n## Test deck <!-- layout: title -->\n\n## Results\n- one\n- two\n"
    );
}

#[test]
fn layout_flags_and_notes_go_in_the_heading_and_after_the_blocks() {
    let mut e = engine();
    let a = add(
        &mut e,
        "title-body",
        json!({ "title": "Intro", "body": "Hello" }),
    );
    let b = add(
        &mut e,
        "two-columns",
        json!({ "title": "Compare", "body": "- a", "body2": "1. b\n2. c" }),
    );
    e.apply(
        "set_notes",
        json!({ "slide": b, "notes": "Pause here.\n\n- ask the room" }),
    )
    .unwrap();
    e.apply("set_slide_flags", json!({ "ids": [a], "hidden": true }))
        .unwrap();
    e.apply("set_slide_flags", json!({ "ids": [b], "backup": true }))
        .unwrap();
    assert_eq!(
        outline_of(e.deck()),
        "# Test deck\n\n\
         ## Test deck <!-- layout: title -->\n\n\
         ## Intro <!-- hidden -->\n- Hello\n\n\
         ## Compare <!-- layout: two-columns, backup -->\n- a\n\n1. b\n2. c\n\n\
         Notes:\nPause here.\n\n- ask the room\n"
    );
}

#[test]
fn pictures_are_links_tables_are_pipe_tables_and_the_rest_is_counted() {
    let mut e = engine();
    let s = add(&mut e, "title-only", json!({ "title": "Mixed" }));
    let cell = |t: &str, bold: bool| json!({ "text": { "paragraphs": [{ "runs": [{ "t": t, "b": bold }] }] } });
    add_elements(
        &mut e,
        &s,
        json!([
            text_box(json!([{ "runs": [{ "t": "A text box", "b": true }] }])),
            { "type": "image", "x": 500, "y": 120, "w": 200, "h": 120, "src": "assets/figure.png", "alt": "A figure" },
            { "type": "image", "x": 500, "y": 300, "w": 20, "h": 20, "src": "" },
            { "type": "image", "x": 500, "y": 340, "w": 20, "h": 20, "src": "assets/a b.png", "alt": "A [nice]  one" },
            { "type": "table", "x": 60, "y": 300, "w": 400, "h": 90, "columns": [200, 200], "headerRow": true,
              "rows": [
                  { "cells": [cell("Name", true), cell("Value | pipe", true)] },
                  { "cells": [cell("alpha", false), cell("1", false)] }
              ] },
            { "type": "shape", "shape": "rect", "x": 10, "y": 10, "w": 50, "h": 50 },
            { "type": "line", "x": 10, "y": 400, "w": 100, "h": 0 }
        ]),
    );
    assert_eq!(
        outline_of(e.deck()).split("## Mixed").nth(1).unwrap(),
        " <!-- layout: title-only -->\n**A text box**\n\n![A figure](assets/figure.png)\n\n\
         ![A \\[nice\\] one](assets/a%20b.png)\n\n\
         | **Name** | **Value \\| pipe** |\n| --- | --- |\n| alpha | 1 |\n\n\
         <!-- 2 other elements -->\n"
    );
}

#[test]
fn a_slide_with_no_title_slot_is_named_by_its_first_text_or_by_its_layout() {
    let mut e = engine();
    add(
        &mut e,
        "quote",
        json!({ "quote": "Make it work.", "caption": "Kent Beck" }),
    );
    let with_text = add(&mut e, "blank", json!({}));
    add_elements(
        &mut e,
        &with_text,
        json!([text_box(json!([{ "runs": [{ "t": "Free words" }] }]))]),
    );
    let with_shape = add(&mut e, "blank", json!({}));
    add_elements(
        &mut e,
        &with_shape,
        json!([{ "type": "shape", "shape": "rect", "x": 1, "y": 1, "w": 5, "h": 5 }]),
    );
    add(&mut e, "blank", json!({}));
    let outline = outline_of(e.deck());
    let after_title_slide = outline.split_once("\n\n## Make").unwrap().1;
    assert_eq!(
        after_title_slide,
        " it work. <!-- layout: quote -->\nKent Beck\n\n\
         ## Free words <!-- layout: blank -->\n\n\
         ## Blank <!-- layout: blank -->\n<!-- 1 other element -->\n\n\
         ## Blank <!-- layout: blank -->\n"
    );
}

#[test]
fn what_would_read_as_structure_is_kept_from_it() {
    let mut e = Engine::create("A *deck* <!-- x -->", "Light", 2).unwrap();
    let s = add(
        &mut e,
        "title-only",
        json!({ "title": "Fast \\*and\\* loose" }),
    );
    add_elements(
        &mut e,
        &s,
        json!([text_box(json!([
            { "runs": [{ "t": "Notes:" }] },
            { "runs": [{ "t": "## Not a slide" }] },
            { "style": "title", "runs": [{ "t": "A big line" }] },
            { "style": "subtitle", "runs": [{ "t": "A smaller one" }] }
        ]))]),
    );
    e.apply(
        "set_notes",
        json!({ "slide": s, "notes": "## Questions\n\\## slash\nplain\n```\n## in code\n```" }),
    )
    .unwrap();
    let outline = outline_of(e.deck());
    assert!(
        outline.starts_with("# A \\*deck\\* \\<!-- x --\\>\n"),
        "{outline}"
    );
    assert!(
        outline.contains("\n## Fast \\*and\\* loose <!-- layout: title-only -->\n"),
        "{outline}"
    );
    assert!(
        outline.contains("\nNotes:<u></u>\n\\## Not a slide\nA big line\nA smaller one\n\n"),
        "{outline}"
    );
    assert!(
        outline.ends_with("Notes:\n\\## Questions\n\\\\## slash\nplain\n```\n## in code\n```\n"),
        "{outline}"
    );
    let got = parse_outline(&outline);
    assert_eq!(got.title, "A *deck* <!-- x -->");
    assert_eq!(got.slides.len(), 2);
    assert_eq!(got.slides[1].title, "Fast *and* loose");
    let words: Vec<String> = got.slides[1].blocks[0]
        .iter()
        .map(Paragraph::text)
        .collect();
    assert_eq!(
        words,
        ["Notes:", "## Not a slide", "A big line", "A smaller one"]
    );
    assert_eq!(
        got.slides[1].notes,
        "## Questions\n\\## slash\nplain\n```\n## in code\n```"
    );
}

#[test]
fn a_line_after_a_hard_break_is_not_taken_for_structure() {
    for source in [
        "\\\n## x\n",
        "a```  \n## ```\n",
        "a  \nNotes:\nb",
        "a  \n~~~\nb\n~~~",
        "x  \n<!-- c -->",
        "a  \n$x  \n## y$",
        "- a  \n## b",
    ] {
        let mut e = engine();
        let s = add(&mut e, "title-only", json!({ "title": "T" }));
        let paragraphs = crate::markdown::parse(source);
        add_elements(&mut e, &s, json!([text_box(json!(paragraphs))]));
        let md = outline_of(e.deck());
        let got = parse_outline(&md);
        assert_eq!(got.slides.len(), 2, "{source:?}\n{md}");
        let words: Vec<String> = got.slides[1].blocks[0]
            .iter()
            .map(Paragraph::text)
            .collect();
        let want: Vec<String> = paragraphs.iter().map(Paragraph::text).collect();
        assert_eq!(words, want, "{source:?}\n{md}");
        assert_eq!(got.slides[1].blocks.len(), 1, "{source:?}\n{md}");
    }
}

#[test]
fn headings_keep_ordinary_punctuation_plain() {
    let mut e = Engine::create("Q&A (Part 1) #3", "Light", 5).unwrap();
    add(
        &mut e,
        "title-only",
        json!({ "title": "Results (2025): use x_y, not \\*z\\* or \\`c\\`" }),
    );
    assert_eq!(
        outline_of(e.deck()),
        "# Q&A (Part 1) #3\n\n\
         ## Q&A (Part 1) #3 <!-- layout: title -->\n\n\
         ## Results (2025): use x_y, not \\*z\\* or \\`c\\` <!-- layout: title-only -->\n"
    );
}

#[test]
fn an_empty_deck_title_and_empty_slides_are_written_bare() {
    let mut e = Engine::create("", "Light", 3).unwrap();
    add(&mut e, "title-only", json!({}));
    assert_eq!(
        outline_of(e.deck()),
        "#\n\n## <!-- layout: title -->\n\n## <!-- layout: title-only -->\n"
    );
}
