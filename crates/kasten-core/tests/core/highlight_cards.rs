//! Highlight cards and reading sources back: a card that links to the
//! exact spot in its PDF, and every source listed with its highlights.

use std::fs;

use crate::common::NOW;
use crate::highlights::{
    PDF, PRIMER_FIRST, PRIMER_SECOND, PRIMER_THIRD, SAMPLE, SIDECAR, SOURCE, import, open, quote,
};
use kasten_core::history::Actor;
use kasten_core::sources::HighlightEdit;

#[test]
fn makes_a_highlight_card_that_links_back_to_the_spot() {
    let (t, k) = open();
    import(&k);
    let mut new = quote(
        "We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.",
    );
    new.comment = Some("The core claim.".into());
    let h = k.add_highlight(&Actor::Human, SOURCE, &new, NOW).unwrap();
    let commits = k.log(None, 500).unwrap().len();

    let card = k
        .highlight_card(&Actor::Human, SOURCE, &h.id, "2026-09-24", NOW)
        .unwrap();
    assert!(card.meta.path.starts_with("inbox/"), "{}", card.meta.path);
    assert_eq!(card.meta.kind, "highlight");
    assert_eq!(
        card.meta.title,
        "We propose a new simple network architecture, the…"
    );
    assert!(
        card.text.contains(&format!(
            "source: {{file: {SOURCE}, page: 3, highlight: {}}}\n",
            h.id
        )),
        "{}",
        card.text
    );
    let body = card.text.split("---\n").nth(2).unwrap();
    assert_eq!(
        body,
        format!(
            "> We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.\n\nThe core claim.\n\n[Attention Is All You Need, page 3](../{SOURCE}#page=3&highlight={})\n",
            h.id
        )
    );
    // The sidecar knows its card, and the listing finds it.
    let listed = k.highlights(SOURCE).unwrap();
    assert_eq!(listed[0].card_id, card.meta.id);
    assert_eq!(listed[0].card.as_deref(), Some(card.meta.path.as_str()));
    let log = k.log(None, 500).unwrap();
    assert_eq!(
        log.len(),
        commits + 1,
        "the card and the sidecar, one commit"
    );
    assert_eq!(log[0].summary, format!("create: {}", card.meta.title));

    // Asked again: the same card, and nothing written.
    let again = k
        .highlight_card(&Actor::Human, SOURCE, &h.id, "2026-09-24", NOW)
        .unwrap();
    assert_eq!(again.meta.path, card.meta.path);
    assert_eq!(k.log(None, 500).unwrap().len(), commits + 1);

    // A highlight card files into a project's cards, as a card does.
    let moved = k
        .move_note(&Actor::Human, &card.meta.path, Some("photo-organiser"))
        .unwrap();
    assert!(
        moved
            .meta
            .path
            .starts_with("projects/photo-organiser/cards/"),
        "{}",
        moved.meta.path
    );
    assert_eq!(
        k.highlights(SOURCE).unwrap()[0].card.as_deref(),
        Some(moved.meta.path.as_str())
    );
    assert!(t.vault.root().join(&moved.meta.path).exists());
}

#[test]
fn a_card_links_back_to_a_pdf_whatever_its_name() {
    let (t, k) = open();
    // A PDF put in sources/ by hand keeps the name it came with, commas,
    // brackets and all; its card's frontmatter still reads back.
    let odd = "sources/My paper (v2), draft {final} #3.pdf";
    fs::write(t.vault.root().join(odd), PDF).unwrap();
    let h = k
        .add_highlight(&Actor::Human, odd, &quote("Odd names too."), NOW)
        .unwrap();
    let card = k
        .highlight_card(&Actor::Human, odd, &h.id, "2026-09-24", NOW)
        .unwrap();
    assert_eq!(card.meta.kind, "highlight", "{}", card.text);
    assert!(
        card.text.contains(&format!(
            "source: {{file: \"{odd}\", page: 3, highlight: {}}}\n",
            h.id
        )),
        "{}",
        card.text
    );
    assert!(
        card.text.ends_with(&format!(
            "[My paper (v2), draft {{final}} #3, page 3](../sources/My%20paper%20%28v2%29,%20draft%20%7Bfinal%7D%20%233.pdf#page=3&highlight={})\n",
            h.id
        )),
        "{}",
        card.text
    );
    assert_eq!(
        k.highlights(odd).unwrap()[0].card.as_deref(),
        Some(card.meta.path.as_str())
    );
}

#[test]
fn a_card_whose_note_is_gone_is_made_again() {
    let (_t, k) = open();
    import(&k);
    let h = k
        .add_highlight(&Actor::Human, SOURCE, &quote("Short."), NOW)
        .unwrap();
    let card = k
        .highlight_card(&Actor::Human, SOURCE, &h.id, "2026-09-24", NOW)
        .unwrap();
    assert_eq!(card.meta.title, "Short.");
    k.trash(&Actor::Human, &card.meta.path, NOW).unwrap();
    assert!(k.highlights(SOURCE).unwrap()[0].card.is_none());
    let fresh = k
        .highlight_card(&Actor::Human, SOURCE, &h.id, "2026-09-24", NOW)
        .unwrap();
    assert_ne!(fresh.meta.id, card.meta.id);
    assert_eq!(
        k.highlights(SOURCE).unwrap()[0].card.as_deref(),
        Some(fresh.meta.path.as_str())
    );
}

#[test]
fn lists_every_highlight_by_source() {
    let (_t, k) = open();
    import(&k);
    let other = k
        .import_source(&Actor::Human, "BERT.pdf", b"%PDF-1.5 bert", NOW)
        .unwrap();
    k.add_highlight(&Actor::Human, SOURCE, &quote("One"), NOW)
        .unwrap();
    k.add_highlight(&Actor::Human, &other, &quote("Two"), NOW)
        .unwrap();
    k.add_highlight(&Actor::Human, &other, &quote("Three"), NOW)
        .unwrap();
    let all = k.all_highlights().unwrap();
    assert_eq!(
        all.iter()
            .map(|s| (
                s.source.title.as_str(),
                s.highlights
                    .iter()
                    .map(|h| h.text.as_str())
                    .collect::<Vec<_>>()
            ))
            .collect::<Vec<_>>(),
        [
            ("A sample paper with three figures", vec![]),
            (
                "A Zettelkasten primer",
                vec![PRIMER_FIRST, PRIMER_SECOND, PRIMER_THIRD]
            ),
            ("Attention Is All You Need", vec!["One"]),
            ("BERT", vec!["Two", "Three"])
        ]
    );
}

#[test]
fn reads_a_source_back_and_nothing_else() {
    let (_t, k) = open();
    import(&k);
    assert_eq!(k.read_source(SOURCE).unwrap(), PDF);
    assert!(k.read_source("inbox/look-at-json-canvas-spec.md").is_err());
    assert!(k.read_source("sources/missing.pdf").is_err());
    assert!(k.read_source("sources/../../secret.pdf").is_err());
}

#[test]
fn the_dev_vault_has_a_sample_to_read_and_highlight() {
    let (_t, k) = open();
    let bytes = k.read_source(SAMPLE).unwrap();
    assert!(bytes.starts_with(b"%PDF-1.7"));
    let highlights = k.highlights(SAMPLE).unwrap();
    assert_eq!(
        highlights
            .iter()
            .map(|h| (h.page, h.color.as_str(), h.card.is_none()))
            .collect::<Vec<_>>(),
        [(1, "yellow", true), (1, "purple", true), (2, "green", true)]
    );
    assert_eq!(highlights[0].rects.len(), 2, "a sentence over two lines");
    let card = k
        .highlight_card(&Actor::Human, SAMPLE, &highlights[2].id, "2026-09-24", NOW)
        .unwrap();
    assert!(card.text.contains("[A Zettelkasten primer, page 2](../sources/zettelkasten-primer.pdf#page=2&highlight=01K5ZK00000000000000000003)"), "{}", card.text);
}

#[test]
fn a_hand_edited_highlight_fails_its_edit_with_a_reason() {
    let (t, k) = open();
    import(&k);
    // Another tool wrote the page as text.
    fs::write(
        t.vault.root().join(SIDECAR),
        r#"{"version": 2, "title": "Attention", "highlights": [{"id": "h1", "page": "3", "rects": [[1, 2, 3, 4]], "text": "Old", "color": "green"}]}"#,
    )
    .unwrap();
    let edit = HighlightEdit {
        color: Some("pink".into()),
        comment: None,
    };
    assert!(
        k.edit_highlight(&Actor::Human, SOURCE, "h1", &edit, NOW)
            .is_err()
    );
}

#[test]
fn a_pdf_copied_in_by_hand_opens_whatever_the_case_of_its_extension() {
    let (t, k) = open();
    let path = "sources/hand-copied.Pdf";
    fs::write(t.vault.root().join(path), PDF).unwrap();
    assert!(k.sources().unwrap().iter().any(|s| s.path == path));
    assert_eq!(k.read_source(path).unwrap(), PDF);
    assert!(k.highlights(path).unwrap().is_empty());
}
