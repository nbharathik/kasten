//! Duplicating a page: a new file beside it with a new id and title, every
//! other key and the body byte for byte.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::history::Actor;
use kasten_core::{Error, Kasten, duplicate_note, frontmatter};

#[test]
fn copies_a_page_with_a_new_id_and_title() {
    let t = dev_vault();
    let path = "projects/photo-organiser/cards/duplicate-score-for-photos.md";
    let original = t.vault.read(path).unwrap();
    let copy = duplicate_note(&t.vault, path, NOW).unwrap();
    assert_eq!(
        copy.meta.path,
        "projects/photo-organiser/cards/duplicate-score-for-photos-copy.md"
    );
    assert_eq!(copy.meta.title, "Duplicate score for photos (copy)");
    assert_ne!(copy.meta.id, original.meta.id);
    assert_eq!(copy.meta.tags, original.meta.tags);
    assert_eq!(
        frontmatter::split(&copy.text).body,
        frontmatter::split(&original.text).body
    );
    let id = copy.meta.id.clone().unwrap();
    let expected = original
        .text
        .replace("id: 01M36P7ED0GK6GGSH722JARFA8", &format!("id: {id}"))
        .replace(
            "title: Duplicate score for photos",
            "title: Duplicate score for photos (copy)",
        )
        .replace(
            "created: 2026-09-23T10:31:00+02:00",
            "created: 2026-09-24T08:00:00Z",
        )
        .replace(
            "updated: 2026-09-23T10:40:00+02:00",
            "updated: 2026-09-24T08:00:00Z",
        );
    assert_eq!(copy.text, expected);
    // The original is untouched, and a second copy gets its own name.
    assert_eq!(t.vault.read(path).unwrap().text, original.text);
    assert_eq!(
        duplicate_note(&t.vault, path, NOW).unwrap().meta.path,
        "projects/photo-organiser/cards/duplicate-score-for-photos-copy-2.md"
    );
}

#[test]
fn refuses_journal_days_projects_and_templates() {
    let t = dev_vault();
    for path in [
        "journal/2026/2026-09-23.md",
        "projects/photo-organiser/_project.md",
        "templates/paper.md",
    ] {
        assert!(
            matches!(duplicate_note(&t.vault, path, NOW), Err(Error::Invalid(_))),
            "{path}"
        );
    }
}

#[test]
fn a_second_copy_keeps_links_to_the_first_going_there() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let path = "library/zettelkasten-method.md";
    let first = k.duplicate(&Actor::Human, path, NOW).unwrap();
    let linking = "library/copy-links.md";
    let link = format!("See [[{}]].\n", first.meta.title);
    fs::write(t.vault.path_of(linking).unwrap(), &link).unwrap();
    k.reindex().unwrap();

    let second = k.duplicate(&Actor::Human, path, NOW).unwrap();
    assert_eq!(second.meta.title, first.meta.title);
    let stem = first.meta.path.trim_end_matches(".md");
    let text = t.vault.read(linking).unwrap().text;
    assert!(text.contains(&format!("[[{stem}|")), "{text}");
}
