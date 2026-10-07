//! Citations are written from the bibliography beside the deck: "Vaswani et al., 2017 (NeurIPS)", not the key.
//! What is asserted is the text the browser drew (the web page and the PDF's text), never pixels.

mod common;

use std::fs;
use std::path::PathBuf;

use common::{deck, one_at_a_time, poppler, renderer};
use serde_json::json;
use slides_core::Engine;
use slides_render::{Draw, HtmlOptions, Options, PdfOptions};

const BIB: &str = "% A sample bibliography.
@inproceedings{vaswani2017attention,
  title     = {Attention is all you need},
  author    = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob},
  booktitle = {Advances in Neural Information Processing Systems},
  volume    = {30},
  year      = {2017}
}
";

const WRITTEN: &str = "Vaswani et al., 2017 (NeurIPS)";

fn scratch(name: &str) -> PathBuf {
    let dir =
        std::env::temp_dir().join(format!("slides-render-refs-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap_or_else(|e| panic!("{e}"));
    dir
}

/// A deck with a blank slide that cites one work the bibliography has and one it has not.
fn citing_deck() -> slides_core::Deck {
    let mut engine = Engine::new(deck("minimal.deck"), 21);
    let slide = engine
        .apply("add_slide", json!({ "layout": "blank" }))
        .unwrap_or_else(|e| panic!("{e}"))
        .output["slide"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    let cite = json!({ "type": "citation", "id": "cite", "x": 64, "y": 400, "w": 832, "h": 32, "keys": ["vaswani2017attention", "nobody2000"], "format": "short" });
    engine
        .apply(
            "add_elements",
            json!({ "slide": slide, "elements": [cite] }),
        )
        .unwrap_or_else(|e| panic!("{e}"));
    engine.deck().clone()
}

fn html_of(renderer: &slides_render::Renderer, deck: &slides_core::Deck) -> String {
    renderer
        .html(deck, &HtmlOptions::default())
        .unwrap_or_else(|e| panic!("{e}"))
        .text
}

#[test]
fn a_citation_is_written_from_the_bibliography_and_is_its_keys_without_one() {
    let _one = one_at_a_time();
    let dir = scratch("beside");
    fs::write(dir.join("refs.bib"), BIB).unwrap_or_else(|e| panic!("{e}"));
    let options = Options {
        references: slides_render::references::in_folder(&dir),
        ..Options::default()
    };
    let Some(renderer) = renderer(options) else {
        let _ = fs::remove_dir_all(&dir);
        return;
    };
    let deck = citing_deck();

    // The text of the page the browser made, and of the PDF it printed.
    let html = html_of(&renderer, &deck);
    assert!(html.contains(WRITTEN), "the work is written out");
    assert!(
        html.contains("nobody2000?"),
        "a key the bibliography does not have is marked"
    );
    assert!(
        !html.contains("(vaswani2017attention;"),
        "the key is not what is drawn"
    );
    let pdf = renderer
        .pdf(&deck, &PdfOptions::default())
        .unwrap_or_else(|e| panic!("{e}"));
    match poppler("pdftotext", &["-", "-"], &pdf.bytes).filter(|t| !t.trim().is_empty()) {
        Some(text) => assert!(
            text.contains(WRITTEN) && text.contains("nobody2000?"),
            "the PDF's text: {text}"
        ),
        None => eprintln!("NOTE: pdftotext is not installed; the PDF's text was not read back"),
    }

    // No bibliography: the keys are drawn as they are. The deck is the same, so only the bibliography is given again.
    renderer.set_references(None);
    let html = html_of(&renderer, &deck);
    assert!(
        html.contains("(vaswani2017attention; nobody2000)"),
        "the keys are drawn"
    );
    assert!(!html.contains("Vaswani et al."));
    // An empty bibliography is a bibliography with nothing in it: every key is unknown.
    renderer.set_references(Some(String::new()));
    let html = html_of(&renderer, &deck);
    assert!(
        html.contains("vaswani2017attention?") && html.contains("nobody2000?"),
        "every key is marked"
    );
    // And back.
    renderer.set_references(Some(BIB.to_owned()));
    assert!(html_of(&renderer, &deck).contains(WRITTEN));
    assert_eq!(renderer.references().as_deref(), Some(BIB));
    drop(renderer);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn the_folder_a_deck_is_drawn_from_gives_its_bib_files_to_the_shared_host() {
    let _one = one_at_a_time();
    match slides_render::shared_with(common::options()) {
        Ok(_) => {}
        Err(e @ (slides_render::Error::NoBrowser { .. } | slides_render::Error::NoPage)) => {
            eprintln!("SKIPPED: {e}");
            return;
        }
        Err(e) => panic!("{e}"),
    }
    let deck = citing_deck();
    let with = scratch("draw-with");
    fs::write(with.join("refs.bib"), BIB).unwrap_or_else(|e| panic!("{e}"));
    let without = scratch("draw-without");
    let slide = Draw::Slide {
        slide: 1,
        step: None,
        scale: 1.0,
    };
    let png = slides_render::draw(&deck, &with, slide).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!((png.width, png.height), (960, 540));
    let host = slides_render::shared().unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(
        host.references()
            .as_deref()
            .map(|r| r.contains("vaswani2017attention")),
        Some(true)
    );
    // A folder with no .bib file takes the bibliography away, so it cannot leak into another folder's deck.
    slides_render::draw(&deck, &without, slide).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(host.references(), None);
    let html = html_of(&host, &deck);
    assert!(!html.contains(WRITTEN), "nothing to write it from");
    // Measuring for lint is done with the folder's bibliography too, so a written citation is measured as long as it is.
    slides_render::measure(&deck, &with).unwrap_or_else(|e| panic!("{e}"));
    assert!(host.references().is_some());
    slides_render::measure(&deck, &without).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(host.references(), None);
    drop(host);
    slides_render::shutdown();
    let _ = fs::remove_dir_all(&with);
    let _ = fs::remove_dir_all(&without);
}
