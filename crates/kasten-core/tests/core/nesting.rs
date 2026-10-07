//! Putting a page inside another, as in Notion, and taking it out again.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::history::Actor;
use kasten_core::{Error, Kasten, Kind, NewNote, create_note, frontmatter, nest_note};

fn page(title: &str, project: Option<&str>, parent: Option<String>) -> NewNote {
    NewNote {
        kind: Kind::Page,
        title: title.to_owned(),
        date: "2026-09-24".to_owned(),
        project: project.map(str::to_owned),
        parent,
        template: None,
        icon: None,
    }
}

#[test]
fn nests_a_page_under_another_and_takes_it_out_again() {
    let t = dev_vault();
    let outer = create_note(&t.vault, &page("Trip notes", None, None), NOW).unwrap();
    let inner = create_note(&t.vault, &page("Packing list", None, None), NOW).unwrap();

    let nested = nest_note(&t.vault, &inner.meta.path, Some(&outer.meta.path), NOW).unwrap();
    // Beside it already: it stays, and only gains its parent.
    assert_eq!(nested.meta.path, inner.meta.path);
    assert_eq!(nested.meta.parent, outer.meta.id);
    let id = outer.meta.id.clone().unwrap();
    let parts = frontmatter::split(&inner.text);
    assert_eq!(
        nested.text,
        format!(
            "{}parent: {id}\n---\n{}",
            parts.prefix.strip_suffix("---\n").unwrap(),
            parts.body
        )
    );

    let out = nest_note(&t.vault, &nested.meta.path, None, NOW).unwrap();
    assert_eq!(out.meta.parent, None);
    assert_eq!(out.text, inner.text);
    // Taking out a page that is in nothing changes nothing.
    assert_eq!(
        nest_note(&t.vault, &out.meta.path, None, NOW).unwrap().text,
        inner.text
    );
}

#[test]
fn a_page_put_in_one_elsewhere_moves_there_with_its_sub_pages() {
    let t = dev_vault();
    let outer = create_note(
        &t.vault,
        &page("Roadmap notes", Some("photo-organiser"), None),
        NOW,
    )
    .unwrap();
    let ideas = create_note(&t.vault, &page("Ideas", None, None), NOW).unwrap();
    let one = create_note(
        &t.vault,
        &page("Idea one", None, Some(ideas.meta.path.clone())),
        NOW,
    )
    .unwrap();

    let nested = nest_note(&t.vault, &ideas.meta.path, Some(&outer.meta.path), NOW).unwrap();
    assert_eq!(nested.meta.path, "projects/photo-organiser/pages/ideas.md");
    assert_eq!(nested.meta.parent, outer.meta.id);
    let moved = t
        .vault
        .read("projects/photo-organiser/pages/idea-one.md")
        .unwrap();
    assert_eq!(moved.meta.parent, one.meta.parent);
    assert!(!t.vault.exists(&ideas.meta.path));
}

#[test]
fn gives_a_page_without_an_id_one_to_hold_its_sub_page() {
    let t = dev_vault();
    fs::write(
        t.vault.path_of("library/plain.md").unwrap(),
        "---\ntitle: Plain\n---\nBody\n",
    )
    .unwrap();
    let inner = create_note(&t.vault, &page("Inside", None, None), NOW).unwrap();
    let nested = nest_note(&t.vault, &inner.meta.path, Some("library/plain.md"), NOW).unwrap();
    let plain = t.vault.read("library/plain.md").unwrap();
    assert!(plain.meta.id.is_some());
    assert_eq!(nested.meta.parent, plain.meta.id);
}

#[test]
fn refuses_what_cannot_hold_or_be_held() {
    let t = dev_vault();
    let outer = create_note(&t.vault, &page("Outer", None, None), NOW).unwrap();
    let inner = create_note(
        &t.vault,
        &page("Inner", None, Some(outer.meta.path.clone())),
        NOW,
    )
    .unwrap();
    for (path, into) in [
        (outer.meta.path.as_str(), outer.meta.path.as_str()),
        // Not inside its own sub-page.
        (outer.meta.path.as_str(), inner.meta.path.as_str()),
        // Only a page holds pages.
        (inner.meta.path.as_str(), "journal/2026/2026-09-23.md"),
        (
            inner.meta.path.as_str(),
            "projects/photo-organiser/_project.md",
        ),
        (
            inner.meta.path.as_str(),
            "projects/photo-organiser/cards/duplicate-score-sketch.md",
        ),
        // Journal days and projects stay where they are.
        ("journal/2026/2026-09-23.md", outer.meta.path.as_str()),
        (
            "projects/photo-organiser/_project.md",
            outer.meta.path.as_str(),
        ),
    ] {
        assert!(
            matches!(
                nest_note(&t.vault, path, Some(into), NOW),
                Err(Error::Invalid(_))
            ),
            "{path} into {into}"
        );
    }
}

#[test]
fn nests_in_one_commit_through_the_engine_and_keeps_links() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let h = Actor::Human;
    let outer = k.create(&h, &page("Reading", None, None), NOW).unwrap();
    k.create(&h, &page("Plan", Some("note-taking-study"), None), NOW)
        .unwrap();
    let plan = k
        .create(&h, &page("Plan", Some("photo-organiser"), None), NOW)
        .unwrap();
    let notes = k
        .create(&h, &page("Photo notes", Some("photo-organiser"), None), NOW)
        .unwrap();
    k.save_body(&h, &notes.meta.path, "See [[Plan]].\n", &notes.hash, NOW)
        .unwrap();

    // Photo organiser's Plan goes into a library page: its link follows it.
    let nested = k
        .nest(&h, &plan.meta.path, Some(&outer.meta.path), NOW)
        .unwrap();
    assert_eq!(nested.meta.path, "library/plan.md");
    assert_eq!(nested.meta.parent, outer.meta.id);
    let body = frontmatter::split(&k.read(&notes.meta.path).unwrap().text)
        .body
        .to_owned();
    assert_eq!(body, "See [[library/plan|Plan]].\n");
    let log = k.log(None, 1).unwrap();
    assert_eq!(log[0].summary, "nest: Plan in Reading");

    let out = k.nest(&h, &nested.meta.path, None, NOW).unwrap();
    assert_eq!(out.meta.parent, None);
    assert_eq!(k.log(None, 1).unwrap()[0].summary, "unnest: Plan");
}

#[test]
fn moving_or_nesting_says_where_every_sub_page_went() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let h = Actor::Human;
    let trip = k.create(&h, &page("Trip", None, None), NOW).unwrap();
    let packing = k
        .create(
            &h,
            &page("Packing", None, Some(trip.meta.path.clone())),
            NOW,
        )
        .unwrap();

    let moved = k
        .move_placed(&h, &trip.meta.path, Some("photo-organiser"))
        .unwrap();
    assert_eq!(
        moved.note.meta.path,
        "projects/photo-organiser/pages/trip.md"
    );
    assert_eq!(
        moved.moves,
        vec![
            (
                trip.meta.path.clone(),
                "projects/photo-organiser/pages/trip.md".to_owned()
            ),
            (
                packing.meta.path.clone(),
                "projects/photo-organiser/pages/packing.md".to_owned()
            ),
        ]
    );

    let home = k.create(&h, &page("Holidays", None, None), NOW).unwrap();
    let nested = k
        .nest_placed(&h, &moved.note.meta.path, Some(&home.meta.path), NOW)
        .unwrap();
    assert_eq!(nested.note.meta.path, "library/trip.md");
    assert_eq!(nested.moves.len(), 2);
    assert!(nested.moves.contains(&(
        "projects/photo-organiser/pages/packing.md".to_owned(),
        "library/packing.md".to_owned()
    )));

    // Other notes whose links the move rewrote are named.
    let notes = k.create(&h, &page("Notes", None, None), NOW).unwrap();
    k.save_body(
        &h,
        &notes.meta.path,
        "See [[library/packing|Packing]].\n",
        &notes.hash,
        NOW,
    )
    .unwrap();
    let back = k
        .move_placed(&h, "library/trip.md", Some("photo-organiser"))
        .unwrap();
    assert_eq!(back.relinked, vec![notes.meta.path.clone()]);

    // A note that stays where it is moves nothing.
    let same = k
        .convert_placed(&h, &back.note.meta.path, "page", NOW)
        .unwrap();
    assert!(same.moves.is_empty());
}
