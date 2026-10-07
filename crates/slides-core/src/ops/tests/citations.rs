//! Citing works on a slide, and what the engine does with a bibliography.

use std::sync::Arc;

use serde_json::{Value, json};

use super::{add, bytes, engine, text_box};
use crate::citations::Refs;
use crate::error::Error;
use crate::model::{CitationStyle, Element};
use crate::ops::Engine;

fn cite(e: &mut Engine, slide: &str, keys: &[&str]) -> Value {
    e.apply("add_citation", json!({ "slide": slide, "keys": keys }))
        .unwrap()
        .output
}

fn citations(e: &Engine, slide: &str) -> Vec<(String, Vec<String>)> {
    e.deck()
        .slide(slide)
        .unwrap()
        .elements
        .iter()
        .filter_map(|el| match el {
            Element::Citation(c) => Some((c.base.id.clone(), c.keys.clone())),
            _ => None,
        })
        .collect()
}

fn add_citation_element(e: &mut Engine, slide: &str, element: Value) {
    e.apply(
        "add_elements",
        json!({ "slide": slide, "elements": [element] }),
    )
    .unwrap();
}

#[test]
fn a_slide_with_no_citation_gets_one_in_the_footer() {
    let mut e = engine();
    let s = add(&mut e, "blank", json!({}));
    let out = cite(&mut e, &s, &["vaswani2017attention"]);
    assert_eq!(out["created"], true);
    assert_eq!(out["added"], json!(["vaswani2017attention"]));
    let id = out["id"].as_str().unwrap();
    let Element::Citation(c) = e.deck().slide(&s).unwrap().element(id).unwrap() else {
        panic!("a citation")
    };
    assert_eq!(c.keys, ["vaswani2017attention"]);
    assert_eq!(c.format, None, "short unless it is told otherwise");
    assert_eq!(c.base.name.as_deref(), Some("citations"));
    let (x, y, w, h) = c.base.rect().unwrap();
    assert_eq!((x, y, h), (64.0, 492.0, 24.0));
    assert!(
        x + w <= 860.0 - 8.0,
        "it stops short of the slide number, which starts at 860: {}",
        x + w
    );
    assert!(
        y + h <= 540.0 - 24.0,
        "lint keeps 24 units clear of the edge"
    );
    crate::canonical::check_structure(e.deck()).unwrap();
}

#[test]
fn a_new_footer_is_something_lint_has_nothing_to_say_about() {
    for (layout, content) in [
        ("blank", json!({})),
        (
            "title-body",
            json!({ "title": "A title", "body": "- a point" }),
        ),
        ("title", json!({ "title": "A title" })),
    ] {
        let mut e = engine();
        let s = add(&mut e, layout, content);
        cite(&mut e, &s, &["vaswani2017attention", "devlin2019bert"]);
        let report = crate::lint::lint_slide(e.deck(), &s, None).unwrap();
        let about_it: Vec<_> = report
            .issues
            .iter()
            .filter(|i| i.element.is_some() && i.message.contains("citations"))
            .map(|i| format!("{}: {}", i.rule, i.message))
            .collect();
        assert!(about_it.is_empty(), "{layout}: {about_it:?}");
        // And one line of it is set at the theme's size, not shrunk to fit.
        let slide = e.deck().slide(&s).unwrap();
        let footer = slide
            .elements
            .iter()
            .find(|el| el.base().name.as_deref() == Some("citations"))
            .unwrap();
        let parts = crate::composites::expand(&e.deck().theme, &slide.layout, footer).unwrap();
        let size = parts[0].text().unwrap().paragraphs[0].runs[0].size;
        assert_eq!(size, None, "{layout}: the citation style's own size");
    }
}

#[test]
fn a_second_call_appends_the_keys_the_footer_does_not_have() {
    let mut e = engine();
    let s = add(&mut e, "blank", json!({}));
    let first = cite(&mut e, &s, &["a"]);
    let second = cite(&mut e, &s, &["b", "a", "c", "b"]);
    assert_eq!(second["created"], false);
    assert_eq!(second["id"], first["id"]);
    assert_eq!(second["added"], json!(["b", "c"]));
    assert_eq!(
        citations(&e, &s),
        [(
            first["id"].as_str().unwrap().to_owned(),
            vec!["a".to_owned(), "b".to_owned(), "c".to_owned()]
        )],
        "one footer, the keys once each and in the order they came"
    );
}

#[test]
fn citing_what_is_already_cited_changes_nothing_and_leaves_no_step_to_undo() {
    let mut e = engine();
    let s = add(&mut e, "blank", json!({}));
    cite(&mut e, &s, &["a", "b"]);
    let before = bytes(e.deck());
    let steps = e.undo_label().map(str::to_owned);
    let out = cite(&mut e, &s, &["b", "a"]);
    assert_eq!(out["added"], json!([]));
    assert_eq!(bytes(e.deck()), before);
    assert_eq!(e.undo_label().map(str::to_owned), steps);
}

#[test]
fn it_appends_to_the_citation_named_citations_first_and_never_to_a_list() {
    let mut e = engine();
    let s = add(&mut e, "blank", json!({}));
    add_citation_element(
        &mut e,
        &s,
        json!({ "type": "citation", "id": "refs", "x": 64, "y": 100, "w": 800, "h": 300, "format": "list", "keys": ["x"] }),
    );
    add_citation_element(
        &mut e,
        &s,
        json!({ "type": "citation", "id": "low", "x": 64, "y": 480, "w": 400, "h": 28, "keys": ["low"] }),
    );
    add_citation_element(
        &mut e,
        &s,
        json!({ "type": "citation", "id": "mine", "name": "citations", "x": 64, "y": 200, "w": 400, "h": 28, "keys": ["mine"] }),
    );
    let out = cite(&mut e, &s, &["new"]);
    assert_eq!(out["id"], "mine", "the one named citations");

    let mut e = engine();
    let s = add(&mut e, "blank", json!({}));
    add_citation_element(
        &mut e,
        &s,
        json!({ "type": "citation", "id": "refs", "x": 64, "y": 500, "w": 800, "h": 28, "format": "list", "keys": [] }),
    );
    add_citation_element(
        &mut e,
        &s,
        json!({ "type": "citation", "id": "high", "x": 64, "y": 100, "w": 400, "h": 28, "keys": ["high"] }),
    );
    add_citation_element(
        &mut e,
        &s,
        json!({ "type": "citation", "id": "low", "x": 64, "y": 470, "w": 400, "h": 28, "keys": ["low"] }),
    );
    let out = cite(&mut e, &s, &["new"]);
    assert_eq!(
        out["id"], "low",
        "the lowest on the slide, and not the list"
    );

    let mut e = engine();
    let s = add(&mut e, "blank", json!({}));
    add_citation_element(
        &mut e,
        &s,
        json!({ "type": "citation", "id": "refs", "x": 64, "y": 100, "w": 800, "h": 300, "format": "list", "keys": [] }),
    );
    let out = cite(&mut e, &s, &["new"]);
    assert_eq!(out["created"], true, "a list is not a footer");
    assert_ne!(out["id"], "refs");
}

#[test]
fn a_citation_inside_a_group_is_found() {
    let mut e = engine();
    let s = add(&mut e, "blank", json!({}));
    add_citation_element(
        &mut e,
        &s,
        json!({ "type": "citation", "id": "inner", "x": 64, "y": 480, "w": 400, "h": 28, "keys": ["a"] }),
    );
    text_box(&mut e, &s, 64.0, 440.0, 100.0, 20.0, "caption");
    let caption = e.deck().slide(&s).unwrap().elements[1].id().to_owned();
    e.apply(
        "group_elements",
        json!({ "slide": s, "ids": ["inner", caption] }),
    )
    .unwrap();
    let out = cite(&mut e, &s, &["b"]);
    assert_eq!(out["created"], false);
    assert_eq!(out["id"], "inner");
}

#[test]
fn format_is_given_to_a_new_footer_and_changes_an_old_one_only_when_asked() {
    let mut e = engine();
    let s = add(&mut e, "blank", json!({}));
    let out = e
        .apply(
            "add_citation",
            json!({ "slide": s, "keys": ["a"], "format": "numbered" }),
        )
        .unwrap()
        .output;
    let id = out["id"].as_str().unwrap().to_owned();
    let format = |e: &Engine| match e.deck().slide(&s).unwrap().element(&id).unwrap() {
        Element::Citation(c) => c.format.clone(),
        _ => panic!("a citation"),
    };
    assert_eq!(format(&e), Some(CitationStyle::Numbered));
    cite(&mut e, &s, &["b"]);
    assert_eq!(format(&e), Some(CitationStyle::Numbered), "left as it was");
    e.apply(
        "add_citation",
        json!({ "slide": s, "keys": ["c"], "format": "full" }),
    )
    .unwrap();
    assert_eq!(format(&e), Some(CitationStyle::Full));
}

#[test]
fn it_is_one_step_of_undo_and_undo_gives_back_the_same_bytes() {
    let mut e = engine();
    let s = add(&mut e, "blank", json!({}));
    let empty = bytes(e.deck());
    cite(&mut e, &s, &["a"]);
    let one = bytes(e.deck());
    cite(&mut e, &s, &["b"]);
    assert_eq!(e.undo_label(), Some("add_citation"));
    e.undo().unwrap();
    assert_eq!(bytes(e.deck()), one);
    e.undo().unwrap();
    assert_eq!(bytes(e.deck()), empty);
    e.redo().unwrap();
    e.redo().unwrap();
    assert_eq!(citations(&e, &s)[0].1, ["a", "b"]);
}

#[test]
fn keys_that_cannot_be_keys_and_slides_that_are_not_there_are_refused() {
    let mut e = engine();
    let s = add(&mut e, "blank", json!({}));
    let before = bytes(e.deck());
    for keys in [
        json!([]),
        json!([""]),
        json!(["  "]),
        json!(["two words"]),
        json!(["a,b"]),
        json!(["{a}"]),
        json!(["ok", "bad key"]),
    ] {
        let error = e
            .apply("add_citation", json!({ "slide": s, "keys": keys }))
            .unwrap_err();
        assert!(matches!(error, Error::BadInput { .. }), "{keys}: {error:?}");
    }
    assert!(matches!(
        e.apply("add_citation", json!({ "slide": "s-none", "keys": ["a"] })),
        Err(Error::NoSuchSlide { .. })
    ));
    let list = e
        .apply(
            "add_citation",
            json!({ "slide": s, "keys": ["a"], "format": "list" }),
        )
        .unwrap_err();
    assert!(list.to_string().contains("add_elements"), "{list}");
    assert_eq!(bytes(e.deck()), before);
}

#[test]
fn a_key_is_trimmed() {
    let mut e = engine();
    let s = add(&mut e, "blank", json!({}));
    cite(&mut e, &s, &["  a  ", "a"]);
    assert_eq!(citations(&e, &s)[0].1, ["a"]);
}

#[test]
fn the_operation_is_described_for_agents_and_the_editor() {
    let specs = crate::ops::specs();
    let spec = specs
        .iter()
        .find(|s| s.name == "add_citation")
        .expect("registered");
    assert!(spec.about.contains("footer"), "{}", spec.about);
    assert!(spec.input["properties"]["slide"].is_object());
    assert!(spec.input["properties"]["keys"].is_object());
    assert!(spec.input["properties"]["format"].is_object());
}

const BIB: &str = "@inproceedings{vaswani2017attention, title={Attention is all you need}, author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki}, booktitle={Advances in Neural Information Processing Systems}, year={2017}}";

fn first_text(e: &Engine, slide: &str, id: &str) -> String {
    let Element::Group(g) = e.deck().slide(slide).unwrap().element(id).unwrap() else {
        panic!("a group")
    };
    g.children[0].text().unwrap().plain_text()
}

#[test]
fn ungrouping_a_citation_writes_it_as_the_editor_shows_it() {
    let mut e = engine();
    let s = add(&mut e, "blank", json!({}));
    let out = cite(&mut e, &s, &["vaswani2017attention"]);
    let id = out["id"].as_str().unwrap().to_owned();
    let other = add(&mut e, "blank", json!({}));
    add_citation_element(
        &mut e,
        &other,
        json!({ "type": "citation", "id": "n", "x": 64, "y": 480, "w": 400, "h": 28, "format": "numbered", "keys": ["z", "vaswani2017attention"] }),
    );

    assert!(e.references().is_none());
    e.apply("expand_composite", json!({ "slide": s, "id": id }))
        .unwrap();
    assert_eq!(
        first_text(&e, &s, &id),
        "(vaswani2017attention)",
        "no bibliography: the keys"
    );
    e.undo().unwrap();

    e.set_references(Some(Arc::new(Refs::from_bibtex(BIB))));
    assert_eq!(e.references().map(Refs::len), Some(1));
    // The numbered one first, while the footer of the first slide still cites the work first.
    e.apply("expand_composite", json!({ "slide": other, "id": "n" }))
        .unwrap();
    assert_eq!(
        first_text(&e, &other, "n"),
        "[z?][1]",
        "numbered by the deck: the work cited on the first slide is [1]; a key the bibliography lacks is marked"
    );
    e.apply("expand_composite", json!({ "slide": s, "id": id }))
        .unwrap();
    assert_eq!(first_text(&e, &s, &id), "Vaswani et al., 2017 (NeurIPS)");
}

#[test]
fn giving_the_engine_a_bibliography_is_not_a_change_to_the_deck() {
    let mut e = engine();
    let before = bytes(e.deck());
    e.set_references(Some(Arc::new(Refs::from_bibtex(BIB))));
    assert_eq!(bytes(e.deck()), before);
    assert!(!e.can_undo());
    e.set_references(None);
    assert!(e.references().is_none());
}
