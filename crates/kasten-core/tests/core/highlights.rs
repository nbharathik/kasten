//! Sources and highlights: a PDF imported into `sources/` with a sidecar of its
//! highlights, each highlight added, recoloured, commented and removed as a
//! commit, and a highlight card that links back to the exact spot.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::Kasten;
use kasten_core::history::Actor;
use kasten_core::sources::{HighlightEdit, NewHighlight};

pub(crate) fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

pub(crate) const PDF: &[u8] = b"%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n";
pub(crate) const SOURCE: &str = "sources/attention-is-all-you-need.pdf";
/// The dev vault's sample (scripts/sample-pdf.mjs) and its highlights.
pub(crate) const SAMPLE: &str = "sources/zettelkasten-primer.pdf";
/// The dev vault's other sample (scripts/figures-pdf.mjs): a paper with three figures and no highlights.
pub(crate) const PAPER: &str = "sources/paper-with-figures.pdf";
pub(crate) const PRIMER_FIRST: &str = "A note should hold one idea, written in your own words, so that it can be understood without the context it came from.";
pub(crate) const PRIMER_SECOND: &str = "Structure is the result of the work, not its precondition.";
pub(crate) const PRIMER_THIRD: &str = "Keep the reference to the source with every note, so you can always return to the page an idea came from";
pub(crate) const SIDECAR: &str = "sources/attention-is-all-you-need.highlights.json";

pub(crate) fn import(k: &Kasten) -> String {
    k.import_source(&Actor::Human, "Attention Is All You Need.pdf", PDF, NOW)
        .unwrap()
}

pub(crate) fn quote(text: &str) -> NewHighlight {
    NewHighlight {
        page: 3,
        rects: vec![[72.0, 512.25, 310.5, 524.75], [72.0, 498.0, 188.123, 510.5]],
        text: text.into(),
        color: "yellow".into(),
        comment: None,
    }
}

#[test]
fn imports_a_pdf_once_with_its_title() {
    let (t, k) = open();
    let commits = k.log(None, 500).unwrap().len();
    assert_eq!(import(&k), SOURCE);
    assert_eq!(fs::read(t.vault.root().join(SOURCE)).unwrap(), PDF);
    let sidecar = fs::read_to_string(t.vault.root().join(SIDECAR)).unwrap();
    assert_eq!(
        sidecar,
        "{\n  \"title\": \"Attention Is All You Need\",\n  \"highlights\": []\n}\n"
    );
    let log = k.log(None, 500).unwrap();
    assert_eq!(
        log.len(),
        commits + 1,
        "the PDF and its sidecar, one commit"
    );
    assert_eq!(log[0].summary, "source: attention-is-all-you-need.pdf");

    // The same bytes again: the same file, no commit.
    assert_eq!(import(&k), SOURCE);
    assert_eq!(k.log(None, 500).unwrap().len(), commits + 1);
    // Other bytes under the same name take the next one.
    let other = k
        .import_source(
            &Actor::Human,
            "attention is all you need.PDF",
            b"%PDF-1.4 other",
            NOW,
        )
        .unwrap();
    assert_eq!(other, "sources/attention-is-all-you-need-2.pdf");

    let sources = k.sources().unwrap();
    assert_eq!(
        sources
            .iter()
            .map(|s| (s.path.as_str(), s.title.as_str(), s.highlights))
            .collect::<Vec<_>>(),
        [
            (PAPER, "A sample paper with three figures", 0),
            (SAMPLE, "A Zettelkasten primer", 3),
            (SOURCE, "Attention Is All You Need", 0),
            (
                "sources/attention-is-all-you-need-2.pdf",
                "attention is all you need",
                0
            ),
        ]
    );
}

#[test]
fn refuses_what_is_not_a_pdf() {
    let (_t, k) = open();
    let not_pdf = k.import_source(&Actor::Human, "notes.pdf", b"hello", NOW);
    assert!(not_pdf.unwrap_err().to_string().contains("not a PDF"));
    let other = k.import_source(&Actor::Human, "paper.docx", PDF, NOW);
    assert!(other.unwrap_err().to_string().contains("PDF"));
    assert!(
        k.import_source(&Actor::Human, "empty.pdf", b"", NOW)
            .is_err()
    );
    let sources: Vec<String> = k.sources().unwrap().into_iter().map(|s| s.path).collect();
    assert_eq!(sources, [PAPER, SAMPLE], "only the dev vault's own");
}

#[test]
fn adds_edits_and_removes_highlights_as_commits() {
    let (t, k) = open();
    import(&k);
    let commits = k.log(None, 500).unwrap().len();
    let added = k
        .add_highlight(
            &Actor::Human,
            SOURCE,
            &quote("Attention is all\nyou need."),
            NOW,
        )
        .unwrap();
    assert_eq!(added.page, 3);
    assert_eq!(added.color, "yellow");
    assert_eq!(added.text, "Attention is all\nyou need.");
    assert_eq!(added.created.as_deref(), Some("2026-09-24T08:00:00Z"));
    assert_eq!(
        added.rects[1],
        [72.0, 498.0, 188.12, 510.5],
        "rounded to 0.01 pt"
    );
    assert!(added.card.is_none());
    // One highlight per line in the sidecar.
    let sidecar = fs::read_to_string(t.vault.root().join(SIDECAR)).unwrap();
    assert!(
        sidecar.contains(&format!(
            "  \"highlights\": [\n    {{\"id\": \"{}\", \"page\": 3, ",
            added.id
        )),
        "{sidecar}"
    );

    let edited = k
        .edit_highlight(
            &Actor::Human,
            SOURCE,
            &added.id,
            &HighlightEdit {
                color: Some("blue".into()),
                comment: Some("The paper's thesis.".into()),
            },
            NOW,
        )
        .unwrap();
    assert_eq!(
        (edited.color.as_str(), edited.comment.as_deref()),
        ("blue", Some("The paper's thesis."))
    );
    let bad = HighlightEdit {
        color: Some("chartreuse".into()),
        comment: None,
    };
    assert!(
        k.edit_highlight(&Actor::Human, SOURCE, &added.id, &bad, NOW)
            .is_err()
    );
    let cleared = HighlightEdit {
        color: None,
        comment: Some("  ".into()),
    };
    let edited = k
        .edit_highlight(&Actor::Human, SOURCE, &added.id, &cleared, NOW)
        .unwrap();
    assert_eq!(
        (edited.color.as_str(), edited.comment.as_deref()),
        ("blue", None)
    );

    assert_eq!(k.highlights(SOURCE).unwrap(), std::slice::from_ref(&edited));
    let listed = k.sources().unwrap();
    assert_eq!(
        listed.iter().find(|s| s.path == SOURCE).unwrap().highlights,
        1
    );
    k.remove_highlight(&Actor::Human, SOURCE, &added.id, NOW)
        .unwrap();
    assert!(k.highlights(SOURCE).unwrap().is_empty());
    assert!(
        k.remove_highlight(&Actor::Human, SOURCE, &added.id, NOW)
            .is_err()
    );

    let log = k.log(None, 500).unwrap();
    assert_eq!(log.len(), commits + 4);
    assert_eq!(
        log[3].summary,
        "highlight: “Attention is all you need.” in Attention Is All You Need"
    );
    assert_eq!(
        log[0].summary,
        "highlight: remove from Attention Is All You Need"
    );
}

#[test]
fn refuses_highlights_that_do_not_fit() {
    let (_t, k) = open();
    import(&k);
    let bad = |edit: fn(&mut NewHighlight)| {
        let mut new = quote("A passage.");
        edit(&mut new);
        k.add_highlight(&Actor::Human, SOURCE, &new, NOW).is_err()
    };
    assert!(bad(|n| n.page = 0));
    assert!(bad(|n| n.rects.clear()));
    assert!(bad(|n| n.rects[0][2] = f64::NAN));
    assert!(bad(|n| n.text = "   ".into()));
    assert!(bad(|n| n.color = "red".into()));
    let elsewhere = k.add_highlight(&Actor::Human, "sources/missing.pdf", &quote("x"), NOW);
    assert!(elsewhere.is_err());
    assert!(k.highlights(SOURCE).unwrap().is_empty());
}

#[test]
fn keeps_keys_it_does_not_know() {
    let (t, k) = open();
    import(&k);
    fs::write(
        t.vault.root().join(SIDECAR),
        r#"{"version": 2, "title": "Attention", "highlights": [{"id": "h1", "page": 1, "rects": [[1, 2, 3, 4]], "text": "Old", "color": "green", "from": "zotero"}], "tool": {"name": "other"}}"#,
    )
    .unwrap();
    let added = k
        .add_highlight(&Actor::Human, SOURCE, &quote("New"), NOW)
        .unwrap();
    let edit = HighlightEdit {
        color: Some("pink".into()),
        comment: None,
    };
    k.edit_highlight(&Actor::Human, SOURCE, "h1", &edit, NOW)
        .unwrap();
    let text = fs::read_to_string(t.vault.root().join(SIDECAR)).unwrap();
    assert!(
        text.starts_with(
            "{\n  \"version\": 2,\n  \"title\": \"Attention\",\n  \"highlights\": [\n"
        ),
        "{text}"
    );
    assert!(text.contains(r#"{"id": "h1", "page": 1, "rects": [[1, 2, 3, 4]], "text": "Old", "color": "pink", "from": "zotero"}"#), "{text}");
    assert!(
        text.ends_with("  ],\n  \"tool\": {\"name\": \"other\"}\n}\n"),
        "{text}"
    );
    let ids: Vec<String> = k
        .highlights(SOURCE)
        .unwrap()
        .into_iter()
        .map(|h| h.id)
        .collect();
    assert_eq!(ids, ["h1".to_owned(), added.id]);
}
