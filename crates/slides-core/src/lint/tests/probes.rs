//! What a host is asked to measure: exactly the texts the overflow rule looks at.

use std::fs;
use std::path::PathBuf;

use serde_json::json;

use super::{bench, of_rule, shape, text};
use crate::canonical;
use crate::lint::estimate::{self, text_size};
use crate::lint::{Measure, Measures, Options, Probe, Refs, lint_deck_with, probes, probes_with};
use crate::model::Deck;

#[test]
fn every_element_that_carries_words_is_listed_with_the_room_its_words_are_set_in() {
    let mut b = bench();
    b.add(json!([
        text("plain", 64.0, 100.0, 400.0, 60.0, "Some words"),
        text("blank", 64.0, 180.0, 400.0, 60.0, "   "),
        json!({ "type": "shape", "id": "bubble", "shape": "ellipse", "x": 500, "y": 100, "w": 200, "h": 100,
            "text": { "paragraphs": [{ "runs": [{ "t": "Inside" }] }] } }),
        shape("empty-box", "rect", 500.0, 260.0, 100.0, 60.0, "accent1"),
        json!({ "type": "table", "id": "grid", "x": 64, "y": 300, "w": 400, "h": 90, "columns": [200, 200],
            "rows": [{ "cells": [
                { "text": { "paragraphs": [{ "runs": [{ "t": "Name" }] }] } },
                { "text": { "paragraphs": [{ "runs": [{ "t": "" }] }] } }] }] }),
    ]));
    let listed = probes(b.deck(), &b.slide).unwrap();
    let ids: Vec<&str> = listed.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(ids, ["plain", "bubble", "grid"]);

    let plain = &listed[0];
    assert_eq!((plain.area_width, plain.area_height), (400.0, 60.0));
    assert_eq!(plain.parts.len(), 1);
    assert_eq!(plain.parts[0].base, "body");

    // An ellipse keeps its words in the rectangle that fits inside it.
    let bubble = &listed[1];
    let side = std::f64::consts::FRAC_1_SQRT_2;
    assert!(
        (bubble.area_width - 200.0 * side).abs() < 1e-9,
        "{bubble:?}"
    );
    assert!(
        (bubble.area_height - 100.0 * side).abs() < 1e-9,
        "{bubble:?}"
    );

    // A table gives the words of each cell that has some.
    assert_eq!(listed[2].parts.len(), 1);
    assert_eq!(listed[2].parts[0].text.plain_text(), "Name");
}

#[test]
fn a_slide_that_is_not_there_is_refused_by_name() {
    let error = probes(bench().deck(), "s-nowhere").unwrap_err();
    assert!(error.to_string().contains("s-nowhere"), "{error}");
}

/// Measures made from the probes as an estimate would: one for each probe.
fn measured_from(deck: &Deck) -> Measures {
    let mut measures = Measures::default();
    for slide in &deck.slides {
        let mut sizes = std::collections::BTreeMap::new();
        for probe in probes(deck, &slide.id).unwrap() {
            let part = &probe.parts[0];
            let size = text_size(&deck.theme, &part.base, &part.text, probe.area_width);
            sizes.insert(
                probe.id.clone(),
                Measure {
                    text_width: size.width,
                    text_height: size.height,
                    area_width: Some(probe.area_width),
                    area_height: Some(probe.area_height),
                },
            );
        }
        measures.slides.insert(slide.id.clone(), sizes);
    }
    measures
}

#[test]
fn measuring_every_probe_leaves_nothing_for_the_rule_to_find_unmeasured() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/decks");
    let mut checked = 0;
    for entry in fs::read_dir(dir).unwrap().flatten() {
        if entry.path().extension().is_none_or(|x| x != "deck") {
            continue;
        }
        let deck = canonical::parse(&fs::read_to_string(entry.path()).unwrap()).unwrap();
        let measures = measured_from(&deck);
        let report = lint_deck_with(
            &deck,
            &Options {
                measures: Some(&measures),
                refs: None,
            },
        );
        let name = entry.file_name();
        assert!(
            report.skipped.iter().all(|s| s.rule != "text-overflow"),
            "{name:?}: the rule found texts nobody was asked to measure: {:?}",
            report.skipped
        );
        checked += 1;
    }
    assert!(checked >= 5, "the fixture decks were found");
}

const BIB: &str = "@inproceedings{vaswani2017attention, title={Attention is all you need}, author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob}, booktitle={Advances in Neural Information Processing Systems}, year={2017}}";

/// The words of every piece of every probe.
fn words_of(list: &[Probe]) -> Vec<String> {
    list.iter()
        .flat_map(|p| p.parts.iter())
        .map(|part| part.text.plain_text())
        .collect()
}

/// A slide whose footer cites a work.
fn cited() -> super::Bench {
    let mut b = bench();
    b.add(json!([
        { "type": "citation", "id": "cite", "x": 64, "y": 480, "w": 700, "h": 30, "keys": ["vaswani2017attention"] },
    ]));
    b
}

#[test]
fn a_citation_is_measured_as_the_words_the_slide_draws_when_the_bibliography_is_known() {
    let b = cited();
    let refs = Refs::from_bibtex(BIB);

    // Without the bibliography the slide draws the key, so the key is what there is to measure.
    let bare = words_of(&probes(b.deck(), &b.slide).unwrap());
    assert!(
        bare.iter().any(|w| w.contains("vaswani2017attention")),
        "{bare:?}"
    );

    // With it the slide draws the work as a reader knows it, and that is what is measured.
    let known = words_of(&probes_with(b.deck(), &b.slide, Some(&refs)).unwrap());
    assert!(
        known
            .iter()
            .any(|w| w.contains("Vaswani et al., 2017 (NeurIPS)")),
        "{known:?}"
    );
    assert!(
        known.iter().all(|w| !w.contains("vaswani2017attention")),
        "{known:?}"
    );
}

#[test]
fn the_estimate_is_of_the_words_the_slide_draws_and_leaves_nothing_for_the_rules_to_find_unmeasured()
 {
    let b = cited();
    let refs = Refs::from_bibtex(BIB);
    let slide = b.deck().slide(&b.slide).unwrap();
    let bare = estimate::slide_measures(b.deck(), slide);
    let known = estimate::slide_measures_with(b.deck(), slide, Some(&refs));
    assert_ne!(bare, known, "the label is not the key");
    assert_eq!(
        known.keys().collect::<Vec<_>>(),
        bare.keys().collect::<Vec<_>>(),
        "the same parts, measured with other words"
    );

    let measures = estimate::measures_with(b.deck(), Some(&refs));
    let report = lint_deck_with(
        b.deck(),
        &Options {
            measures: Some(&measures),
            refs: Some(&refs),
        },
    );
    assert!(
        report.skipped.iter().all(|s| s.rule != "text-overflow"),
        "{:?}",
        report.skipped
    );
    assert!(of_rule(&report, "unresolved-citation").is_empty());
}
