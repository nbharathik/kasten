//! End to end inside the crate: a deck exported by the exporter and imported again.

use serde_json::json;
use slides_core::{Element, Engine};

use super::*;
use crate::Options;
use crate::testing::MapMedia;

fn small_deck() -> Deck {
    let mut engine = Engine::create("Small", "Light", 5).unwrap_or_else(|e| panic!("{e}"));
    engine
        .apply(
            "add_slide",
            json!({ "layout": "title-body", "content": { "title": "Results", "body": "- one\n- two" }, "notes": "Say it slowly." }),
        )
        .unwrap_or_else(|e| panic!("{e}"));
    engine.into_deck()
}

fn round(deck: &Deck) -> Imported {
    let exported = crate::export(deck, &MapMedia::default(), &Options::default())
        .unwrap_or_else(|e| panic!("{e}"));
    import(&exported.bytes, &ImportOptions::default()).unwrap_or_else(|e| panic!("{e}"))
}

#[test]
fn an_exported_deck_comes_back_with_its_slides_text_and_notes() {
    let deck = small_deck();
    let back = round(&deck);
    assert_eq!(back.deck.slides.len(), 2);
    assert_eq!(back.deck.size, deck.size);
    let second = &back.deck.slides[1];
    assert_eq!(second.layout, "title-body");
    assert_eq!(second.notes, "Say it slowly.");
    let texts: Vec<String> = second
        .elements
        .iter()
        .filter_map(Element::text)
        .map(|t| t.plain_text())
        .collect();
    assert_eq!(texts, ["Results", "one\ntwo"]);
}

fn titled(options: &ImportOptions, core: Option<&str>) -> String {
    let deck = small_deck();
    let exported = crate::export(&deck, &MapMedia::default(), &Options::default())
        .unwrap_or_else(|e| panic!("{e}"));
    let mut entries = crate::import::package::tests::entries_of(&exported.bytes);
    for (name, bytes) in &mut entries {
        if name == "docProps/core.xml" {
            let text = String::from_utf8_lossy(bytes).into_owned();
            let text = match core {
                Some(t) => text.replace(
                    "<dc:title>Small</dc:title>",
                    &format!("<dc:title>{t}</dc:title>"),
                ),
                None => text.replace("<dc:title>Small</dc:title>", "<dc:title/>"),
            };
            *bytes = text.into_bytes();
        }
    }
    let bytes = crate::import::package::tests::zip_of(
        &entries
            .iter()
            .map(|(n, b)| (n.as_str(), b.as_slice()))
            .collect::<Vec<_>>(),
    );
    import(&bytes, options)
        .unwrap_or_else(|e| panic!("{e}"))
        .deck
        .title
}

#[test]
fn the_title_is_the_one_asked_for_then_the_files_own_then_its_name_then_its_first_slide() {
    let asked = ImportOptions {
        title: Some("Asked".into()),
        name: Some("file".into()),
        ..ImportOptions::default()
    };
    let named = ImportOptions {
        name: Some("file".into()),
        ..ImportOptions::default()
    };
    assert_eq!(titled(&asked, Some("Its own")), "Asked");
    assert_eq!(titled(&named, Some("Its own")), "Its own");
    // A title a program gave a file whose author gave it none is not a title.
    assert_eq!(titled(&named, Some("PowerPoint Presentation")), "file");
    assert_eq!(titled(&named, Some("Presentation1")), "file");
    assert_eq!(titled(&named, None), "file");
    assert_eq!(titled(&ImportOptions::default(), None), "Small");
}
