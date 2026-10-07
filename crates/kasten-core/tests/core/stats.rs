//! Per-note counts for the Card Library: how many notes link to each note
//! and how many boards show it.

use crate::common;

use common::dev_vault;
use kasten_core::Kasten;

#[test]
fn counts_backlinks_and_boards_for_every_note() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let stats = k.note_stats().unwrap();
    let of = |path: &str| {
        stats
            .iter()
            .find(|s| s.path == path)
            .unwrap_or_else(|| panic!("no stats for {path}"))
    };
    assert_eq!(
        of("projects/photo-organiser/cards/duplicate-score-sketch.md").boards,
        1
    );
    assert_eq!(
        of("projects/photo-organiser/cards/duplicate-score-for-photos.md").boards,
        1
    );
    assert_eq!(of("library/zettelkasten-method.md").boards, 0);
    assert!(of("projects/note-taking-study/pages/report-draft.md").backlinks >= 1);
    // Related work notes links to the paper draft.
    assert!(of("projects/note-taking-study/pages/related-work-notes.md").links >= 1);
    // Every note has a row, templates aside.
    assert_eq!(
        stats.len(),
        k.list()
            .unwrap()
            .iter()
            .filter(|n| n.kind != "template")
            .count()
    );
}
