//! Pages that share a title: a link goes by path, or by title to
//! the note in its own project first; ops keep every link where it went;
//! a page's backlinks are the links that go to it.

use crate::common;

use common::{NOW, dev_vault};
use kasten_core::history::Actor;
use kasten_core::{Kasten, Kind, NewNote, frontmatter};

fn page(title: &str, project: Option<&str>) -> NewNote {
    NewNote {
        kind: Kind::Page,
        title: title.to_owned(),
        date: "2026-09-24".to_owned(),
        project: project.map(str::to_owned),
        parent: None,
        template: None,
        icon: None,
    }
}

/// A page made and written through the engine; its path.
fn page_with(k: &Kasten, new: &NewNote, body: &str) -> String {
    let note = k.create(&Actor::Human, new, NOW).unwrap();
    if !body.is_empty() {
        k.save_body(&Actor::Human, &note.meta.path, body, &note.hash, NOW)
            .unwrap();
    }
    note.meta.path
}

fn body(k: &Kasten, path: &str) -> String {
    let text = k.read(path).unwrap().text;
    frontmatter::split(&text).body.to_owned()
}

fn backlinks(k: &Kasten, path: &str) -> Vec<String> {
    let mut paths: Vec<String> = k
        .backlinks(path)
        .unwrap()
        .into_iter()
        .map(|b| b.path)
        .collect();
    paths.sort();
    paths
}

fn sorted<const N: usize>(paths: [&str; N]) -> Vec<String> {
    let mut v: Vec<String> = paths.iter().map(|p| (*p).to_owned()).collect();
    v.sort();
    v
}

#[test]
fn a_page_s_backlinks_are_the_links_that_go_to_it() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let photo = page_with(&k, &page("Plan", Some("photo-organiser")), "");
    let study = page_with(&k, &page("Plan", Some("note-taking-study")), "");
    let near = page_with(
        &k,
        &page("Photo notes", Some("photo-organiser")),
        "See [[Plan]].\n",
    );
    let far = page_with(
        &k,
        &page("Study notes", Some("note-taking-study")),
        "See [[plan#Goals]] and [[projects/photo-organiser/pages/plan|the photo plan]].\n",
    );
    // Outside both projects, [[Plan]] asks which: it may be either's.
    let loose = page_with(&k, &page("Loose", None), "Which [[Plan]]?\n");
    assert_eq!(backlinks(&k, &photo), sorted([&far, &loose, &near]));
    assert_eq!(backlinks(&k, &study), sorted([&far, &loose]));
}

#[test]
fn a_page_links_its_namesake_sub_page_and_back() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let outer = page_with(&k, &page("Test", None), "");
    let inner = page_with(
        &k,
        &NewNote {
            parent: Some(outer.clone()),
            ..page("Test", None)
        },
        "Back up to [[Test]].\n",
    );
    let outer_note = k.read(&outer).unwrap();
    k.save_body(
        &Actor::Human,
        &outer,
        "Down to [[Test]].\n",
        &outer_note.hash,
        NOW,
    )
    .unwrap();
    assert_ne!(outer, inner);
    assert_eq!(backlinks(&k, &outer), std::slice::from_ref(&inner));
    assert_eq!(backlinks(&k, &inner), std::slice::from_ref(&outer));
}

#[test]
fn making_a_page_with_a_title_in_use_keeps_links_where_they_went() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let study = page_with(&k, &page("Plan", Some("note-taking-study")), "");
    let linker = page_with(
        &k,
        &page("Photo notes", Some("photo-organiser")),
        "See [[Plan]].\n",
    );
    // A Plan in photo-organiser would take that link: it names the study's by path now.
    let photo = page_with(&k, &page("Plan", Some("photo-organiser")), "");
    assert_eq!(
        body(&k, &linker),
        "See [[projects/note-taking-study/pages/plan|Plan]].\n"
    );
    assert_eq!(backlinks(&k, &study), std::slice::from_ref(&linker));
    assert!(backlinks(&k, &photo).is_empty());
    // The same happens when a new page is named after it was made.
    let fresh = page_with(&k, &page("", Some("note-taking-study")), "");
    let other = page_with(
        &k,
        &page("Study notes", Some("note-taking-study")),
        "See [[Photo notes]].\n",
    );
    k.rename(&Actor::Human, &fresh, "Photo notes", NOW).unwrap();
    assert_eq!(
        body(&k, &other),
        "See [[projects/photo-organiser/pages/photo-notes|Photo notes]].\n"
    );
}

#[test]
fn renaming_and_moving_keep_links_through_the_engine() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let h = Actor::Human;
    let photo = page_with(&k, &page("Plan", Some("photo-organiser")), "");
    let study = page_with(&k, &page("Plan", Some("note-taking-study")), "");
    let photo_notes = page_with(
        &k,
        &page("Photo notes", Some("photo-organiser")),
        "See [[Plan]].\n",
    );
    let study_notes = page_with(
        &k,
        &page("Study notes", Some("note-taking-study")),
        "See [[Plan]].\n",
    );
    let loose = page_with(
        &k,
        &page("Loose", None),
        "See [[projects/photo-organiser/pages/plan|Plan]].\n",
    );

    // Renaming one Plan moves only its own links.
    let renamed = k.rename(&h, &photo, "Roadmap", NOW).unwrap();
    assert_eq!(body(&k, &photo_notes), "See [[Roadmap]].\n");
    assert_eq!(body(&k, &study_notes), "See [[Plan]].\n");
    // The path link followed the file, and its title with it.
    assert_eq!(body(&k, &loose), "See [[Roadmap]].\n");
    let mut relinked = renamed.relinked.clone();
    relinked.sort();
    assert_eq!(relinked, sorted([&loose, &photo_notes]));

    // Moving the other Plan out of the study: from there its title still finds it.
    k.move_note(&h, &study, None).unwrap();
    assert_eq!(body(&k, &study_notes), "See [[Plan]].\n");
    assert_eq!(
        backlinks(&k, "library/plan.md"),
        std::slice::from_ref(&study_notes)
    );
}

#[test]
fn verify_follows_links_by_path_and_names_links_that_ask() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    page_with(&k, &page("Plan", Some("photo-organiser")), "");
    page_with(&k, &page("Plan", Some("note-taking-study")), "");
    let loose = page_with(
        &k,
        &page("Loose", None),
        "[[projects/photo-organiser/pages/plan|Plan]] and [[Plan]]\n",
    );
    let report = k.verify().unwrap();
    let about_loose: Vec<&str> = report
        .problems
        .iter()
        .filter(|p| p.path.as_deref() == Some(loose.as_str()))
        .map(|p| p.kind.as_str())
        .collect();
    assert_eq!(about_loose, ["ambiguous-link"]);
}

#[test]
fn counts_each_page_s_own_backlinks() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let photo = page_with(&k, &page("Plan", Some("photo-organiser")), "");
    let study = page_with(&k, &page("Plan", Some("note-taking-study")), "");
    page_with(
        &k,
        &page("Photo notes", Some("photo-organiser")),
        "See [[Plan]].\n",
    );
    page_with(
        &k,
        &page("Loose", None),
        "See [[projects/photo-organiser/pages/plan|Plan]].\n",
    );
    let stats = k.note_stats().unwrap();
    let of = |path: &str| stats.iter().find(|s| s.path == path).unwrap().backlinks;
    assert_eq!(of(&photo), 2);
    assert_eq!(of(&study), 0);
}

#[test]
fn agents_name_a_shared_title_by_path() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let photo = page_with(&k, &page("Plan", Some("photo-organiser")), "");
    page_with(&k, &page("Plan", Some("note-taking-study")), "");
    assert!(k.resolve("Plan").is_err());
    for reference in [
        "projects/photo-organiser/pages/plan",
        "projects/photo-organiser/pages/plan.md",
        "[[projects/photo-organiser/pages/plan|Plan]]",
    ] {
        assert_eq!(k.resolve(reference).unwrap(), photo, "{reference}");
    }
}
