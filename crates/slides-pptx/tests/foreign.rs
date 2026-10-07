//! Files that other programs made, in `fixtures/decks/pptx`: this crate's own export of the sample
//! deck and the same file saved again by LibreOffice. They are made once and committed; a test
//! only reads them. Everything imports, and nothing is dropped.

mod common;

use slides_core::{Deck, Element, Slide};
use slides_pptx::Options;

use common::compare;
use common::foreign::{all, fixture, sample, title, words};

#[test]
fn our_own_export_of_the_sample_deck_comes_back_as_the_sample_deck() {
    let imported = fixture("exported.pptx");
    assert!(
        imported.report.warnings.is_empty(),
        "{:?}",
        imported.report.warnings
    );
    assert!(imported.report.raw.is_empty());
    let diff = compare::compare(&sample(), &Options::default(), &imported, &|_| None);
    assert!(diff.is_empty(), "{}", diff.join("\n"));
}

#[test]
fn the_libreoffice_copy_keeps_every_slide_word_shape_and_join() {
    let (a, b) = (sample(), fixture("libreoffice.pptx"));
    assert!(
        b.report.raw.is_empty() && b.report.warnings.is_empty(),
        "{:?}",
        b.report
    );
    let deck = &b.deck;
    assert_eq!(deck.slides.len(), a.slides.len());
    assert_eq!((deck.size.w, deck.size.h), (a.size.w, a.size.h));
    for (want, got) in a.slides.iter().zip(&deck.slides) {
        assert_eq!(title(got), title(want), "slide titles");
        assert_eq!(
            got.notes.trim(),
            want.notes.trim(),
            "notes of {}",
            title(want)
        );
        // The same words, shape for shape, in the same order.
        let said = |s: &Slide| {
            all(s)
                .iter()
                .map(|e| words(e))
                .filter(|w| !w.is_empty())
                .collect::<Vec<_>>()
        };
        assert_eq!(said(got), said(want), "words on {}", title(want));
        let kinds = |s: &Slide| {
            let mut k: Vec<&str> = all(s).iter().map(|e| e.kind()).collect();
            k.sort_unstable();
            k
        };
        assert_eq!(kinds(got), kinds(want), "elements on {}", title(want));
    }
    // Both arrows still join the boxes they joined.
    let joined = |deck: &Deck| {
        deck.slides
            .iter()
            .flat_map(all)
            .filter(|e| matches!(e, Element::Connector(c) if c.from.is_some() && c.to.is_some()))
            .count()
    };
    assert_eq!(joined(deck), joined(&a));
    assert!(joined(deck) >= 2);
    // The table keeps its shape.
    let table = |deck: &Deck| {
        deck.slides.iter().flat_map(all).find_map(|e| match e {
            Element::Table(t) => Some((t.columns.len(), t.rows.len())),
            _ => None,
        })
    };
    assert_eq!(table(deck), table(&a));
}
