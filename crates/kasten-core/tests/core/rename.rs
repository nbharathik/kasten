//! Renaming a page: the title key, the file name when it follows the title,
//! and every link to the page.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::{Error, Kind, NewNote, create_note, rename_note};

fn page(title: &str) -> NewNote {
    NewNote {
        kind: Kind::Page,
        title: title.to_owned(),
        date: "2026-09-24".to_owned(),
        project: None,
        parent: None,
        template: None,
        icon: None,
    }
}

#[test]
fn renames_the_title_moves_the_file_and_relinks_every_note() {
    let t = dev_vault();
    let path = "projects/photo-organiser/cards/duplicate-score-for-photos.md";
    let before = t.vault.read(path).unwrap();
    let journal = t.vault.read("journal/2026/2026-09-23.md").unwrap().text;
    let zettel = t.vault.read("library/zettelkasten-method.md").unwrap().text;

    let renamed = rename_note(&t.vault, path, "Edit distance metric", NOW).unwrap();
    assert_eq!(
        renamed.note.meta.path,
        "projects/photo-organiser/cards/edit-distance-metric.md"
    );
    assert_eq!(renamed.note.meta.title, "Edit distance metric");
    assert_eq!(renamed.note.meta.id, before.meta.id);
    assert!(!t.vault.exists(path));
    assert_eq!(
        renamed.note.text,
        before
            .text
            .replace(
                "title: Duplicate score for photos",
                "title: Edit distance metric"
            )
            .replace(
                "updated: 2026-09-23T10:40:00+02:00",
                "updated: 2026-09-24T08:00:00Z"
            ),
    );

    let mut relinked = renamed.relinked.clone();
    relinked.sort();
    assert_eq!(
        relinked,
        [
            "journal/2026/2026-09-23.md",
            "library/zettelkasten-method.md",
            "projects/photo-organiser/pages/photo-organiser-roadmap.md",
        ]
    );
    assert_eq!(
        t.vault.read("journal/2026/2026-09-23.md").unwrap().text,
        journal.replace(
            "![[Duplicate score for photos]]",
            "![[Edit distance metric]]"
        )
    );
    assert_eq!(
        t.vault.read("library/zettelkasten-method.md").unwrap().text,
        zettel.replace(
            "[[Duplicate score for photos|a worked example]]",
            "[[Edit distance metric|a worked example]]"
        )
    );
}

#[test]
fn rewrites_only_real_links_to_the_old_title() {
    let t = dev_vault();
    let target = create_note(&t.vault, &page("Old name"), NOW).unwrap();
    let other = create_note(&t.vault, &page("Other"), NOW).unwrap();
    let body = "See [[Old name#Part|here]], [[old NAME]], ![[ Old name ]].\r\nNot \\[[Old name]], [[Old names]] or `code`.\r\n";
    let text = format!("{}{body}", other.text);
    fs::write(t.vault.path_of(&other.meta.path).unwrap(), &text).unwrap();

    let renamed = rename_note(&t.vault, &target.meta.path, "New name", NOW).unwrap();
    assert_eq!(renamed.relinked, std::slice::from_ref(&other.meta.path));
    assert_eq!(
        t.vault.read(&other.meta.path).unwrap().text,
        format!(
            "{}See [[New name#Part|here]], [[New name]], ![[New name]].\r\nNot \\[[Old name]], [[Old names]] or `code`.\r\n",
            other.text
        )
    );
}

#[test]
fn keeps_file_names_that_do_not_follow_the_title() {
    let t = dev_vault();
    let custom = "library/my-own-name.md";
    fs::write(
        t.vault.path_of(custom).unwrap(),
        "---\ntitle: Something\n---\nBody\n",
    )
    .unwrap();
    let renamed = rename_note(&t.vault, custom, "Something else", NOW).unwrap();
    assert_eq!(renamed.note.meta.path, custom);
    assert_eq!(
        renamed.note.text,
        "---\ntitle: Something else\nupdated: 2026-09-24T08:00:00Z\n---\nBody\n"
    );

    // New pages start as `untitled`; naming them gives the file a real name.
    let fresh = create_note(&t.vault, &page(""), NOW).unwrap();
    assert_eq!(fresh.meta.path, "library/untitled.md");
    let named = rename_note(&t.vault, &fresh.meta.path, "Reading list", NOW).unwrap();
    assert_eq!(named.note.meta.path, "library/reading-list.md");

    // A project's file is named by its folder and stays put.
    let project = "projects/photo-organiser/_project.md";
    let renamed = rename_note(&t.vault, project, "Photo organiser tools", NOW).unwrap();
    assert_eq!(renamed.note.meta.path, project);
}

#[test]
fn refuses_journal_days_and_titles_links_cannot_hold() {
    let t = dev_vault();
    let journal = "journal/2026/2026-09-23.md";
    assert!(matches!(
        rename_note(&t.vault, journal, "Tuesday", NOW),
        Err(Error::Invalid(_))
    ));
    let path = "library/zettelkasten-method.md";
    for bad in ["", "   ", "A [[link]]", "Pipe | here", "Line\nbreak"] {
        assert!(
            matches!(
                rename_note(&t.vault, path, bad, NOW),
                Err(Error::Invalid(_))
            ),
            "{bad:?}"
        );
    }
    let before = t.vault.read(path).unwrap();
    let same = rename_note(&t.vault, path, "Zettelkasten method", NOW).unwrap();
    assert_eq!(same.note.text, before.text);
    assert!(same.relinked.is_empty());
}

#[cfg(unix)]
#[test]
fn a_linking_note_the_vault_will_not_open_keeps_its_links_and_the_rename_goes_on() {
    let t = dev_vault();
    let made = create_note(&t.vault, &page("Budget"), NOW).unwrap();
    // The name Finder gives "Q3/Q4", which the vault refuses to open.
    let odd = t.vault.root().join("library/q3:q4.md");
    fs::write(&odd, "See [[Budget]].\n").unwrap();
    fs::write(
        t.vault.path_of("library/spending.md").unwrap(),
        "See [[Budget]].\n",
    )
    .unwrap();
    let renamed = rename_note(&t.vault, &made.meta.path, "Costs", NOW).unwrap();
    assert_eq!(renamed.note.meta.title, "Costs");
    assert_eq!(
        t.vault.read("library/spending.md").unwrap().text,
        "See [[Costs]].\n"
    );
    assert_eq!(fs::read_to_string(&odd).unwrap(), "See [[Budget]].\n");
}
