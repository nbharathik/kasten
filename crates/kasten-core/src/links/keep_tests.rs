//! Links kept through renames and moves: each goes on pointing at the note
//! it went to.

use std::collections::HashMap;

use super::tests::{place, vault};
use super::*;
use crate::note::NoteMeta;

fn moved(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs
        .iter()
        .map(|(a, b)| ((*a).to_owned(), (*b).to_owned()))
        .collect()
}

/// `vault()` with `path` renamed to `title` (and moved to `to`).
fn renamed(path: &str, title: &str, to: &str) -> Vec<NoteMeta> {
    vault()
        .into_iter()
        .map(|mut n| {
            if n.path == path {
                n.title = title.to_owned();
                n.path = to.to_owned();
                n.project = to
                    .strip_prefix("projects/")
                    .and_then(|r| r.split_once('/'))
                    .map(|(p, _)| p.to_owned());
            }
            n
        })
        .collect()
}

#[test]
fn a_rename_points_its_links_at_the_new_title() {
    let before_notes = vault();
    let after_notes = renamed("library/reading.md", "Books", "library/books.md");
    let (before, after) = (Directory::new(&before_notes), Directory::new(&after_notes));
    let from = place("library/diary.md");
    let body = "[[Reading]], ![[reading#Now|what I read]] and [[Reading|Reading]] [[Plan]]\n";
    assert_eq!(
        keep::keep_links(
            body,
            &before,
            &after,
            &moved(&[("library/reading.md", "library/books.md")]),
            from,
            from
        )
        .as_deref(),
        Some("[[Books]], ![[Books#Now|what I read]] and [[Books]] [[Plan]]\n")
    );
    // Nothing that went to it: nothing to write.
    assert_eq!(
        keep::keep_links(
            "[[Notes]] and text",
            &before,
            &after,
            &HashMap::new(),
            from,
            from
        ),
        None
    );
}

#[test]
fn a_rename_to_a_title_in_use_names_the_path() {
    let before_notes = vault();
    let after_notes = renamed("library/reading.md", "Plan", "library/plan.md");
    let (before, after) = (Directory::new(&before_notes), Directory::new(&after_notes));
    let from = place("projects/trip/pages/list.md");
    // In Trip, a bare [[Plan]] would go to Trip's Plan.
    assert_eq!(
        keep::keep_links(
            "[[Reading]] then [[Plan]]",
            &before,
            &after,
            &moved(&[("library/reading.md", "library/plan.md")]),
            from,
            from
        )
        .as_deref(),
        Some("[[library/plan|Plan]] then [[Plan]]")
    );
}

#[test]
fn links_to_a_title_taken_by_a_nearer_note_keep_going_where_they_went() {
    // Home's Test is renamed Reading, so Home has a Reading of its own.
    let before_notes = vault();
    let after_notes = renamed(
        "projects/home/pages/test.md",
        "Reading",
        "projects/home/pages/reading.md",
    );
    let (before, after) = (Directory::new(&before_notes), Directory::new(&after_notes));
    // From Home, [[Reading]] went to the library's; now Home has its own.
    let from = place("projects/home/pages/list.md");
    assert_eq!(
        keep::keep_links(
            "[[Reading]]",
            &before,
            &after,
            &moved(&[(
                "projects/home/pages/test.md",
                "projects/home/pages/reading.md"
            )]),
            from,
            from
        )
        .as_deref(),
        Some("[[library/reading|Reading]]")
    );
}

#[test]
fn a_move_follows_path_links_and_keeps_bare_ones_where_they_went() {
    let before_notes = vault();
    let after_notes = renamed("projects/home/pages/plan.md", "Plan", "library/plan.md");
    let (before, after) = (Directory::new(&before_notes), Directory::new(&after_notes));
    let map = moved(&[("projects/home/pages/plan.md", "library/plan.md")]);
    // Home's Plan moves to the library. Trip has a Plan too, so from Home
    // a bare [[Plan]] no longer finds it: the link names its path.
    let home = place("projects/home/pages/list.md");
    assert_eq!(
        keep::keep_links("[[Plan]]", &before, &after, &map, home, home).as_deref(),
        Some("[[library/plan|Plan]]")
    );
    // A path link follows the note.
    let diary = place("library/diary.md");
    assert_eq!(
        keep::keep_links(
            "[[projects/home/pages/plan|Plan]]",
            &before,
            &after,
            &map,
            diary,
            diary
        )
        .as_deref(),
        Some("[[Plan]]")
    );
}

#[test]
fn links_that_asked_or_found_nothing_stay_as_written() {
    let before_notes = vault();
    let after_notes = renamed(
        "projects/trip/pages/plan.md",
        "Route",
        "projects/trip/pages/route.md",
    );
    let (before, after) = (Directory::new(&before_notes), Directory::new(&after_notes));
    let map = moved(&[(
        "projects/trip/pages/plan.md",
        "projects/trip/pages/route.md",
    )]);
    let diary = place("library/diary.md");
    // From the library, [[Plan]] asked which; it still says Plan.
    assert_eq!(
        keep::keep_links("[[Plan]] [[Gone]]", &before, &after, &map, diary, diary),
        None
    );
}

#[test]
fn a_note_that_moves_keeps_its_own_links() {
    let before_notes = vault();
    let after_notes = renamed(
        "projects/trip/pages/test.md",
        "Test",
        "projects/home/pages/test-2.md",
    );
    let (before, after) = (Directory::new(&before_notes), Directory::new(&after_notes));
    let map = moved(&[(
        "projects/trip/pages/test.md",
        "projects/home/pages/test-2.md",
    )]);
    // In Trip it linked Trip's Plan by title; from Home that title finds Home's.
    assert_eq!(
        keep::keep_links(
            "[[Plan]]",
            &before,
            &after,
            &map,
            place("projects/trip/pages/test.md"),
            place("projects/home/pages/test-2.md")
        )
        .as_deref(),
        Some("[[projects/trip/pages/plan|Plan]]")
    );
}
