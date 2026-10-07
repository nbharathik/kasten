//! Where an asset came from beyond the file: a figure clipped from a paper,
//! and a picture of an imported PowerPoint deck.

use crate::asset_support::fixture;
use crate::common;

use common::{NOW, dev_vault};
use kasten_core::Kasten;
use kasten_core::assets::{AssetSource, NewAsset, PdfClip};
use kasten_core::history::Actor;

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

#[test]
fn a_clipped_figure_lists_the_paper_it_came_from() {
    let (_t, k) = open();
    let clip = PdfClip {
        pdf: "sources/zettelkasten-primer.pdf".into(),
        page: 2,
        rect: [72.0, 300.5, 400.0, 520.25],
    };
    let meta = NewAsset {
        source: Some(AssetSource::PdfClip),
        clip: Some(clip.clone()),
        citation_key: Some("luhmann1992".into()),
        ..NewAsset::default()
    };
    let added = k
        .add_asset(
            &Actor::Human,
            "Figure 2.png",
            &fixture("wide.png"),
            &meta,
            NOW,
        )
        .unwrap();
    let info = k.asset(&added.path).unwrap();
    assert_eq!(info.source.as_deref(), Some("pdf-clip"));
    assert_eq!(info.clip, Some(clip));
    assert_eq!(info.citation_key.as_deref(), Some("luhmann1992"));
    assert_eq!(info.paper.as_deref(), Some("A Zettelkasten primer"));
    assert_eq!(
        k.assets().unwrap()[0].paper.as_deref(),
        Some("A Zettelkasten primer")
    );
}

#[test]
fn a_clip_needs_its_paper_page_and_a_rectangle() {
    let (_t, k) = open();
    let clip = |pdf: &str, page: u32, rect: [f64; 4]| NewAsset {
        source: Some(AssetSource::PdfClip),
        clip: Some(PdfClip {
            pdf: pdf.into(),
            page,
            rect,
        }),
        ..NewAsset::default()
    };
    let bytes = fixture("wide.png");
    let try_add = |meta: &NewAsset| k.add_asset(&Actor::Human, "clip.png", &bytes, meta, NOW);
    let pdf = "sources/zettelkasten-primer.pdf";
    assert!(
        try_add(&NewAsset {
            source: Some(AssetSource::PdfClip),
            ..NewAsset::default()
        })
        .is_err()
    );
    assert!(try_add(&clip(pdf, 0, [0.0, 0.0, 10.0, 10.0])).is_err());
    assert!(try_add(&clip(pdf, 1, [10.0, 0.0, 10.0, 10.0])).is_err());
    assert!(try_add(&clip(pdf, 1, [0.0, 0.0, f64::NAN, 10.0])).is_err());
    assert!(try_add(&clip("sources/missing.pdf", 1, [0.0, 0.0, 10.0, 10.0])).is_err());
    assert!(try_add(&clip("notes/welcome.md", 1, [0.0, 0.0, 10.0, 10.0])).is_err());
    // A clip given for another way in is refused too.
    let mixed = NewAsset {
        source: Some(AssetSource::Pasted),
        clip: Some(PdfClip {
            pdf: pdf.into(),
            page: 1,
            rect: [0.0, 0.0, 10.0, 10.0],
        }),
        ..NewAsset::default()
    };
    assert!(try_add(&mixed).is_err());
    assert!(try_add(&clip(pdf, 1, [0.0, 0.0, 10.0, 10.0])).is_ok());
}

/// What the reader's clip tool sends for a figure of the dev vault's second sample paper
/// (scripts/figures-pdf.mjs): a name made of the paper's file, the page and a number.
#[test]
fn a_figure_clipped_from_the_sample_paper_is_named_for_its_page() {
    let (_t, k) = open();
    let clip = |page: u32, rect: [f64; 4]| NewAsset {
        source: Some(AssetSource::PdfClip),
        clip: Some(PdfClip {
            pdf: "sources/paper-with-figures.pdf".into(),
            page,
            rect,
        }),
        citation_key: Some("sample2026figures".into()),
        caption: Some("Accuracy by model size.".into()),
        ..NewAsset::default()
    };
    let figure_two = [72.0, 480.0, 300.0, 690.0];
    let first = k
        .add_asset(
            &Actor::Human,
            "paper-with-figures-p2-1.png",
            &fixture("wide.png"),
            &clip(2, figure_two),
            NOW,
        )
        .unwrap();
    assert_eq!(
        (first.path.as_str(), first.created),
        ("assets/paper-with-figures-p2-1.png", true)
    );
    // The paper is listed by the title its sidecar gives, and the clip keeps where it was cut.
    assert_eq!(
        first.asset.paper.as_deref(),
        Some("A sample paper with three figures")
    );
    assert_eq!(
        first.asset.citation_key.as_deref(),
        Some("sample2026figures")
    );
    assert_eq!(
        first.asset.clip,
        Some(PdfClip {
            pdf: "sources/paper-with-figures.pdf".into(),
            page: 2,
            rect: figure_two
        })
    );
    // The next figure of the page is the next number; the same picture again is the first.
    let second = k
        .add_asset(
            &Actor::Human,
            "paper-with-figures-p2-2.png",
            &fixture("pixel.png"),
            &clip(2, [320.0, 480.0, 523.0, 690.0]),
            NOW,
        )
        .unwrap();
    assert_eq!(second.path, "assets/paper-with-figures-p2-2.png");
    let again = k
        .add_asset(
            &Actor::Human,
            "paper-with-figures-p2-3.png",
            &fixture("wide.png"),
            &clip(2, figure_two),
            NOW,
        )
        .unwrap();
    assert_eq!(
        (again.path.as_str(), again.created),
        (first.path.as_str(), false)
    );
}

#[test]
fn a_powerpoint_import_records_the_deck_it_came_from() {
    let (_t, k) = open();
    let meta = NewAsset {
        source: Some(AssetSource::PptxImport),
        deck: Some("Lecture 4".into()),
        ..NewAsset::default()
    };
    let added = k
        .add_asset(
            &Actor::Human,
            "image1.png",
            &fixture("pixel.png"),
            &meta,
            NOW,
        )
        .unwrap();
    assert_eq!(added.asset.source.as_deref(), Some("pptx-import"));
    assert_eq!(added.asset.deck.as_deref(), Some("Lecture 4"));
}
