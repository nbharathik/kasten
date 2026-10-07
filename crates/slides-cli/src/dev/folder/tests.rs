use super::*;

fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("slides-dev-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn folder(name: &str) -> Folder {
    Folder::open(&temp(name)).unwrap()
}

#[test]
fn makes_decks_and_never_replaces_one() {
    let folder = folder("make");
    let a = folder.create("My talk", "Light").unwrap();
    let b = folder.create("My talk", "Dark").unwrap();
    assert_eq!(a.path, "my-talk.deck");
    assert_eq!(b.path, "my-talk 2.deck");
    assert!(a.text.contains("\"format\": \"kasten-deck\""));
    assert_eq!(a.hash, content_hash(&a.text));
    let listed = folder.decks();
    assert_eq!(listed.len(), 2);
    assert!(
        listed
            .iter()
            .all(|d| d.title == "My talk" && d.slides == 1 && d.problem.is_none())
    );
    assert!(folder.create("x", "No such theme").is_err());
}

#[test]
fn a_save_from_the_version_read_is_written() {
    let folder = folder("save");
    let deck = folder.create("Talk", "Light").unwrap();
    let edited = deck.text.replace("\"Talk\"", "\"Talk, edited\"");
    let Saved::Written { deck: now } = folder.save(&deck.path, &edited, &deck.hash).unwrap() else {
        panic!("expected a write");
    };
    assert_eq!(now.text, edited);
    assert_ne!(now.hash, deck.hash);
    // The same text again changes nothing.
    assert!(matches!(
        folder.save(&deck.path, &edited, &now.hash).unwrap(),
        Saved::Unchanged { .. }
    ));
}

#[test]
fn a_save_from_an_old_version_is_kept_as_a_copy_and_the_file_is_left_alone() {
    let folder = folder("conflict");
    let deck = folder.create("Talk", "Light").unwrap();
    let theirs = deck.text.replace("\"Talk\"", "\"Theirs\"");
    let Saved::Written { deck: now } = folder.save(&deck.path, &theirs, &deck.hash).unwrap() else {
        panic!("expected a write");
    };
    let mine = deck.text.replace("\"Talk\"", "\"Mine\"");
    let Saved::Conflict {
        copy,
        deck: on_disk,
    } = folder.save(&deck.path, &mine, &deck.hash).unwrap()
    else {
        panic!("expected a conflict");
    };
    assert_eq!(on_disk.text, now.text);
    assert!(
        copy.starts_with("talk (conflict ") && copy.ends_with(").deck"),
        "{copy}"
    );
    assert_eq!(folder.read(&copy).unwrap().text, mine);
    assert_eq!(folder.read(&deck.path).unwrap().text, theirs);
}

#[test]
fn only_decks_are_saved() {
    let folder = folder("envelope");
    let deck = folder.create("Talk", "Light").unwrap();
    for bad in [
        "",
        "not json",
        "{}",
        r#"{"format":"other","slides":[]}"#,
        r#"{"format":"kasten-deck"}"#,
    ] {
        assert!(
            matches!(
                folder.save(&deck.path, bad, &deck.hash),
                Err(FolderError::Invalid(_))
            ),
            "{bad}"
        );
    }
    assert_eq!(folder.read(&deck.path).unwrap().text, deck.text);
}

#[test]
fn a_removed_deck_moves_to_the_trash() {
    let folder = folder("trash");
    let deck = folder.create("Talk", "Light").unwrap();
    let moved = folder.trash(&deck.path).unwrap();
    assert!(
        moved.starts_with(".trash/talk 2") || moved.starts_with(".trash/talk 20"),
        "{moved}"
    );
    assert!(folder.decks().is_empty());
    assert_eq!(
        fs::read_to_string(folder.root().join(&moved)).unwrap(),
        deck.text
    );
    assert!(matches!(
        folder.trash(&deck.path),
        Err(FolderError::NotFound(_))
    ));
}

#[test]
fn names_that_point_elsewhere_are_refused() {
    let folder = folder("names");
    for name in [
        "../x.deck",
        "a/b.deck",
        "/etc/passwd",
        ".hidden.deck",
        "a\\b.deck",
        "x.txt",
        ".deck",
        "",
        "C:x.deck",
    ] {
        assert!(
            matches!(folder.read(name), Err(FolderError::Invalid(_))),
            "{name}"
        );
        assert!(folder.trash(name).is_err(), "{name}");
    }
    for path in [
        "assets/../x.png",
        "x.png",
        "assets/a/b.png",
        "assets/.h.png",
        "assets/x.txt",
        "assets/",
    ] {
        assert!(folder.asset(path).is_err(), "{path}");
    }
    assert!(folder.add_asset("../x.png", b"x").is_err());
    assert!(folder.add_asset("notes.txt", b"x").is_err());
}

#[test]
fn pictures_are_kept_once_and_never_overwritten() {
    let folder = folder("assets");
    let first = folder.add_asset("logo.png", b"one").unwrap();
    let same = folder.add_asset("logo.png", b"one").unwrap();
    let other = folder.add_asset("logo.png", b"two").unwrap();
    assert_eq!(first, "assets/logo.png");
    assert_eq!(same, first);
    assert_eq!(other, "assets/logo 2.png");
    let (bytes, kind) = folder.asset(&first).unwrap();
    assert_eq!((bytes.as_slice(), kind), (b"one".as_slice(), "image/png"));
    assert_eq!(folder.assets().len(), 2);
}

#[test]
fn prints_change_when_a_deck_or_picture_does() {
    let folder = folder("prints");
    let before = folder.prints();
    assert!(before.is_empty());
    let deck = folder.create("Talk", "Light").unwrap();
    folder.add_asset("a.png", b"1").unwrap();
    let after = folder.prints();
    assert_eq!(
        after.keys().map(String::as_str).collect::<Vec<_>>(),
        ["assets/a.png", deck.path.as_str()]
    );
    assert_eq!(after[&deck.path].1, deck.text.len() as u64);
}

#[test]
fn prints_note_the_bibliography_files_beside_the_decks_and_only_those() {
    let folder = folder("prints-bib");
    fs::write(folder.root().join("refs.bib"), "@article{a}").unwrap();
    fs::write(folder.root().join("Other.BIB"), "@article{b}").unwrap();
    fs::write(folder.root().join("refs.bib.txt"), "no").unwrap();
    fs::create_dir(folder.root().join("papers")).unwrap();
    fs::write(folder.root().join("papers/deep.bib"), "@article{c}").unwrap();
    let seen: Vec<String> = folder.prints().keys().cloned().collect();
    assert_eq!(
        seen,
        ["Other.BIB", "refs.bib"],
        "the files the folder serves as its bibliography, not those in a subfolder or with another ending"
    );
}

#[test]
fn a_file_that_is_not_a_deck_is_listed_with_its_problem() {
    let folder = folder("problem");
    fs::write(folder.root().join("broken.deck"), "{").unwrap();
    let listed = folder.decks();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].title, "broken");
    assert!(
        listed[0]
            .problem
            .as_deref()
            .unwrap()
            .starts_with("not a deck")
    );
}

/// Two tabs saving the same deck at the same moment, from the version both read.
#[test]
fn saves_at_once_from_one_version_give_one_write_and_the_rest_conflict() {
    use std::sync::{Arc, Barrier};
    for round in 0..15 {
        let folder = Arc::new(folder(&format!("race-{round}")));
        let deck = folder.create("Talk", "Light").unwrap();
        let texts: Vec<String> = (0..6)
            .map(|n| deck.text.replace("\"Talk\"", &format!("\"Talk {n}\"")))
            .collect();
        let start = Arc::new(Barrier::new(texts.len()));
        let tabs: Vec<_> = texts
            .iter()
            .map(|text| {
                let (folder, start, text) = (Arc::clone(&folder), Arc::clone(&start), text.clone());
                let (path, base) = (deck.path.clone(), deck.hash.clone());
                std::thread::spawn(move || {
                    start.wait();
                    folder.save(&path, &text, &base)
                })
            })
            .collect();
        let saved: Vec<Saved> = tabs
            .into_iter()
            .map(|tab| tab.join().unwrap().unwrap())
            .collect();
        let winners: Vec<usize> = (0..saved.len())
            .filter(|n| matches!(saved[*n], Saved::Written { .. }))
            .collect();
        assert_eq!(winners.len(), 1, "round {round}: one save wins: {saved:?}");
        // The deck is whole and is the winner's text; every other tab's text is kept beside it.
        assert_eq!(folder.read(&deck.path).unwrap().text, texts[winners[0]]);
        for (n, outcome) in saved.iter().enumerate().filter(|(n, _)| *n != winners[0]) {
            let Saved::Conflict { copy, .. } = outcome else {
                panic!("round {round}: save {n} should conflict: {outcome:?}");
            };
            assert_eq!(folder.read(copy).unwrap().text, texts[n]);
        }
        let left: Vec<String> = fs::read_dir(folder.root())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(left.is_empty(), "round {round}: temporaries left: {left:?}");
    }
}

#[test]
fn a_deck_is_not_saved_back_after_it_was_moved_to_the_trash() {
    use std::sync::{Arc, Barrier};
    for round in 0..15 {
        let folder = Arc::new(folder(&format!("trash-race-{round}")));
        let deck = folder.create("Talk", "Light").unwrap();
        let edited = deck.text.replace("\"Talk\"", "\"Talk, edited\"");
        let start = Arc::new(Barrier::new(2));
        let saving = {
            let (folder, start) = (Arc::clone(&folder), Arc::clone(&start));
            let (path, base, text) = (deck.path.clone(), deck.hash.clone(), edited.clone());
            std::thread::spawn(move || {
                start.wait();
                folder.save(&path, &text, &base)
            })
        };
        start.wait();
        let trashed = folder.trash(&deck.path).unwrap();
        // Whichever came first, the deck is in the trash and not beside the others again:
        // a save that came second finds nothing to save over.
        match saving.join().unwrap() {
            Ok(Saved::Written { .. }) => assert_eq!(
                fs::read_to_string(folder.root().join(&trashed)).unwrap(),
                edited,
                "round {round}: a save that won is what the trash holds"
            ),
            Err(FolderError::NotFound(_)) => {}
            other => panic!("round {round}: {other:?}"),
        }
        assert!(
            folder.decks().is_empty(),
            "round {round}: the deck came back"
        );
    }
}
