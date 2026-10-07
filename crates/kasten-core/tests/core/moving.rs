//! Moving notes between projects, the library and the inbox, sub-pages
//! included.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::{Error, Kind, NewNote, create_note, move_note};

fn page(title: &str, parent: Option<String>) -> NewNote {
    NewNote {
        kind: Kind::Page,
        title: title.to_owned(),
        date: "2026-09-24".to_owned(),
        project: None,
        parent,
        template: None,
        icon: None,
    }
}

#[test]
fn moves_an_inbox_card_into_a_project_unchanged() {
    let t = dev_vault();
    let path = "inbox/look-at-json-canvas-spec.md";
    let before = t.vault.read(path).unwrap();
    let moved = move_note(&t.vault, path, Some("photo-organiser")).unwrap();
    assert_eq!(
        moved.meta.path,
        "projects/photo-organiser/cards/look-at-json-canvas-spec.md"
    );
    assert_eq!(moved.text, before.text);
    assert!(!t.vault.exists(path));
    assert_eq!(moved.meta.project.as_deref(), Some("photo-organiser"));
}

#[test]
fn takes_sub_pages_along_and_can_move_back_to_the_library() {
    let t = dev_vault();
    let parent = create_note(&t.vault, &page("Research plan", None), NOW).unwrap();
    let child = create_note(
        &t.vault,
        &page("Chapter one", Some(parent.meta.path.clone())),
        NOW,
    )
    .unwrap();
    let grandchild = create_note(
        &t.vault,
        &page("Section 1.1", Some(child.meta.path.clone())),
        NOW,
    )
    .unwrap();

    let moved = move_note(&t.vault, &parent.meta.path, Some("note-taking-study")).unwrap();
    assert_eq!(
        moved.meta.path,
        "projects/note-taking-study/pages/research-plan.md"
    );
    for old in [&parent, &child, &grandchild] {
        assert!(!t.vault.exists(&old.meta.path), "{}", old.meta.path);
    }
    assert!(
        t.vault
            .exists("projects/note-taking-study/pages/chapter-one.md")
    );
    assert!(
        t.vault
            .exists("projects/note-taking-study/pages/section-1-1.md")
    );

    let back = move_note(&t.vault, &moved.meta.path, None).unwrap();
    assert_eq!(back.meta.path, "library/research-plan.md");
    assert!(t.vault.exists("library/chapter-one.md"));
    // Moving to where it already is changes nothing.
    assert_eq!(
        move_note(&t.vault, &back.meta.path, None)
            .unwrap()
            .meta
            .path,
        "library/research-plan.md"
    );
}

#[test]
fn a_sub_page_moved_on_its_own_leaves_its_parent() {
    let t = dev_vault();
    let parent = create_note(&t.vault, &page("Trip notes", None), NOW).unwrap();
    let child = create_note(
        &t.vault,
        &page("Packing list", Some(parent.meta.path.clone())),
        NOW,
    )
    .unwrap();
    let shoes = create_note(&t.vault, &page("Shoes", Some(child.meta.path.clone())), NOW).unwrap();
    assert_eq!(child.meta.parent, parent.meta.id);

    let moved = move_note(&t.vault, &child.meta.path, Some("photo-organiser")).unwrap();
    assert_eq!(
        moved.meta.path,
        "projects/photo-organiser/pages/packing-list.md"
    );
    // A page of its own in the project: only its parent key went.
    assert_eq!(moved.meta.parent, None);
    let parent_line = child
        .text
        .lines()
        .find(|line| line.starts_with("parent:"))
        .unwrap();
    assert_eq!(
        moved.text,
        child.text.replacen(&format!("{parent_line}\n"), "", 1)
    );
    // Its own sub-page came along, still under it; the parent stayed.
    let shoes = t
        .vault
        .read(&format!(
            "projects/photo-organiser/pages/{}",
            file_name(&shoes.meta.path)
        ))
        .unwrap();
    assert_eq!(shoes.meta.parent, child.meta.id);
    assert!(t.vault.exists(&parent.meta.path));
}

#[test]
fn a_sub_page_moved_to_its_parent_s_folder_stays_under_it() {
    let t = dev_vault();
    let parent = create_note(&t.vault, &page("Trip notes", None), NOW).unwrap();
    let parent = move_note(&t.vault, &parent.meta.path, Some("photo-organiser")).unwrap();
    // A sub-page left in the library, as an edit outside the app can leave it.
    let id = parent.meta.id.clone().unwrap();
    std::fs::write(
        t.vault.root().join("library/packing-list.md"),
        format!("---\ntitle: Packing list\nparent: {id}\n---\nSocks.\n"),
    )
    .unwrap();
    let moved = move_note(&t.vault, "library/packing-list.md", Some("photo-organiser")).unwrap();
    assert_eq!(moved.meta.parent.as_deref(), Some(id.as_str()));
    assert_eq!(
        moved.text,
        format!("---\ntitle: Packing list\nparent: {id}\n---\nSocks.\n")
    );
}

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

#[test]
fn refuses_what_cannot_move() {
    let t = dev_vault();
    for (path, to) in [
        ("journal/2026/2026-09-23.md", None),
        (
            "projects/photo-organiser/_project.md",
            Some("note-taking-study"),
        ),
        ("templates/paper.md", None),
        ("library/zettelkasten-method.md", Some("no-such-project")),
        ("library/zettelkasten-method.md", Some("../escape")),
    ] {
        assert!(
            matches!(move_note(&t.vault, path, to), Err(Error::Invalid(_))),
            "{path} to {to:?}"
        );
    }
    // A name already taken in the destination gets a free one.
    let clash = create_note(&t.vault, &page("Photo organiser roadmap", None), NOW).unwrap();
    let moved = move_note(&t.vault, &clash.meta.path, Some("photo-organiser")).unwrap();
    assert_eq!(
        moved.meta.path,
        "projects/photo-organiser/pages/photo-organiser-roadmap-2.md"
    );
}

#[test]
fn a_move_that_cannot_finish_moves_nothing() {
    let t = dev_vault();
    let parent = create_note(&t.vault, &page("Field notes", None), NOW).unwrap();
    let card = NewNote {
        kind: Kind::Card,
        ..page("Sample one", Some(parent.meta.path.clone()))
    };
    let child = create_note(&t.vault, &card, NOW).unwrap();
    let lab = t.vault.root().join("projects/lab");
    fs::create_dir_all(lab.join("pages")).unwrap();
    // Where the card would go is a file, not a folder.
    fs::write(lab.join("cards"), "").unwrap();
    assert!(move_note(&t.vault, &parent.meta.path, Some("lab")).is_err());
    assert!(t.vault.exists(&parent.meta.path), "{}", parent.meta.path);
    assert!(t.vault.exists(&child.meta.path), "{}", child.meta.path);
    assert!(!lab.join("pages/field-notes.md").exists());
}

#[test]
fn a_card_moved_out_of_the_inbox_can_go_back() {
    use kasten_core::Kasten;
    use kasten_core::history::Actor;

    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let path = "inbox/look-at-json-canvas-spec.md";
    let before = t.vault.read(path).unwrap();
    let out = k
        .move_placed(&Actor::Human, path, Some("photo-organiser"))
        .unwrap();
    assert_ne!(out.note.meta.path, path);

    let back = k.move_to_inbox(&Actor::Human, &out.note.meta.path).unwrap();
    assert_eq!(back.note.meta.path, path);
    assert_eq!(back.note.text, before.text);
    assert_eq!(back.note.meta.project, None);
    assert_eq!(
        back.moves,
        vec![(out.note.meta.path.clone(), path.to_owned())]
    );

    // Already there, nothing moves; a project page stays where it is.
    assert!(
        k.move_to_inbox(&Actor::Human, path)
            .unwrap()
            .moves
            .is_empty()
    );
    assert!(matches!(
        k.move_to_inbox(&Actor::Human, "projects/photo-organiser/_project.md"),
        Err(Error::Invalid(_))
    ));

    // A sub-page that goes back on its own leaves its parent.
    let parent = k.create(&Actor::Human, &page("Plan", None), NOW).unwrap();
    let child = k
        .create(
            &Actor::Human,
            &page("Step", Some(parent.meta.path.clone())),
            NOW,
        )
        .unwrap();
    let alone = k.move_to_inbox(&Actor::Human, &child.meta.path).unwrap();
    assert_eq!(alone.note.meta.path, "inbox/step.md");
    assert_eq!(alone.note.meta.parent, None);
    assert!(t.vault.exists(&parent.meta.path));
}
