use slides_core::{Engine, canonical};

use super::*;

fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("slides-mcp-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn store(name: &str) -> FolderStore {
    FolderStore::open(&temp(name)).unwrap()
}

fn deck_text(title: &str) -> String {
    let engine = Engine::create(title, "Light", 7).unwrap();
    canonical::write(engine.deck()).unwrap()
}

/// A real PNG, 3 by 2 pixels.
const PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x02, 0x08, 0x02, 0x00, 0x00, 0x00, 0x12, 0x16, 0xf1,
    0x4d, 0x00, 0x00, 0x00, 0x15, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0x94, 0xab, 0x38, 0xc1,
    0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc4, 0x00, 0x03, 0x00, 0x18, 0x2e, 0x01, 0x62, 0x87, 0x96,
    0x3e, 0xbf, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

#[test]
fn lists_reads_and_makes_decks_without_replacing_one() {
    let mut store = store("make");
    let a = store.create("My talk", &deck_text("My talk")).unwrap();
    let b = store.create("My talk", &deck_text("My talk")).unwrap();
    assert_eq!(
        (a.name.as_str(), b.name.as_str()),
        ("my-talk.deck", "my-talk 2.deck")
    );
    let listed = store.decks().unwrap();
    assert_eq!(listed.len(), 2);
    assert!(
        listed
            .iter()
            .all(|d| d.title == "My talk" && d.slides == 1 && d.problem.is_none())
    );
    assert_eq!(store.read("my-talk.deck").unwrap(), a);
    assert!(
        store.create("x", "{}").is_err(),
        "a text that is not a deck is refused"
    );
}

#[test]
fn a_missing_deck_says_where_to_look() {
    let mut store = store("missing");
    let StoreError::NotFound(message) = store.read("nope.deck").unwrap_err() else {
        panic!("expected NotFound");
    };
    assert!(
        message.contains("nope.deck") && message.contains("list_decks"),
        "{message}"
    );
    assert!(matches!(
        store.read("../x.deck"),
        Err(StoreError::Invalid(_))
    ));
}

#[test]
fn a_save_from_the_version_read_is_written_and_an_old_one_is_kept_beside_it() {
    let mut store = store("save");
    let deck = store.create("Talk", &deck_text("Talk")).unwrap();
    let theirs = deck.text.replace("\"Talk\"", "\"Theirs\"");
    let Saved::Written(now) = store.save(&deck.name, &theirs, &deck.hash).unwrap() else {
        panic!("expected a write");
    };
    assert_eq!(now.text, theirs);
    assert!(matches!(
        store.save(&deck.name, &theirs, &now.hash).unwrap(),
        Saved::Unchanged(_)
    ));

    let mine = deck.text.replace("\"Talk\"", "\"Mine\"");
    let Saved::Conflict { copy, current } = store.save(&deck.name, &mine, &deck.hash).unwrap()
    else {
        panic!("expected a conflict");
    };
    assert_eq!(current, now, "the deck is as it was");
    assert_eq!(
        fs::read_to_string(store.root().join(&deck.name)).unwrap(),
        theirs
    );
    assert_eq!(fs::read_to_string(store.root().join(&copy)).unwrap(), mine);
}

#[test]
fn a_deck_put_aside_goes_to_the_trash_folder() {
    let mut store = store("trash");
    let deck = store.create("Old", &deck_text("Old")).unwrap();
    let place = store.trash(&deck.name).unwrap();
    assert!(place.starts_with(".trash/") && store.root().join(&place).is_file());
    assert!(!store.root().join(&deck.name).exists());
    assert!(matches!(
        store.trash(&deck.name),
        Err(StoreError::NotFound(_))
    ));
}

#[test]
fn copies_kept_before_a_removal_go_to_the_trash_folder() {
    let mut store = store("copy");
    let deck = store.create("Talk", &deck_text("Talk")).unwrap();
    store
        .keep_copy(&deck.name, &deck.text, "before delete_slides")
        .unwrap();
    let kept: Vec<_> = fs::read_dir(store.root().join(".trash"))
        .unwrap()
        .flatten()
        .collect();
    assert_eq!(kept.len(), 1);
    assert!(
        kept[0]
            .file_name()
            .to_string_lossy()
            .contains("before delete_slides")
    );
    assert!(
        store.root().join(&deck.name).is_file(),
        "the deck itself stays"
    );
}

#[test]
fn pictures_are_kept_once_and_never_replaced() {
    let mut store = store("assets");
    let first = store.add_asset("figure.png", PNG).unwrap();
    assert_eq!(first, "assets/figure.png");
    assert_eq!(
        store.add_asset("figure.png", PNG).unwrap(),
        first,
        "the same bytes are the same picture"
    );
    let other = store
        .add_asset("figure.png", &[PNG, &[0]].concat())
        .unwrap();
    assert_eq!(other, "assets/figure 2.png");
    assert_eq!(store.read_asset(&first).unwrap(), PNG);
    let listed = store.assets().unwrap();
    assert_eq!(listed.len(), 2);
    assert!(matches!(
        store.read_asset("assets/none.png"),
        Err(StoreError::NotFound(_))
    ));
    assert!(matches!(
        store.add_asset("../x.png", PNG),
        Err(StoreError::Invalid(_))
    ));
    assert!(matches!(
        store.add_asset("notes.txt", PNG),
        Err(StoreError::Invalid(_))
    ));
}

#[test]
fn files_are_read_only_from_inside_the_folder() {
    let mut store = store("files");
    fs::write(store.root().join("notes.txt"), "hello").unwrap();
    fs::create_dir_all(store.root().join("sub")).unwrap();
    fs::write(store.root().join("sub/deep.txt"), "deep").unwrap();
    assert_eq!(store.read_file("notes.txt").unwrap(), b"hello");
    assert_eq!(store.read_file("./sub/deep.txt").unwrap(), b"deep");
    for bad in [
        "../notes.txt",
        "/etc/hostname",
        "sub\\deep.txt",
        "",
        "sub/../../x",
        "sub",
    ] {
        assert!(store.read_file(bad).is_err(), "{bad:?} must be refused");
    }
    assert!(matches!(
        store.read_file("missing.txt"),
        Err(StoreError::NotFound(_))
    ));
}

#[cfg(unix)]
#[test]
fn a_link_that_leads_out_of_the_folder_is_refused() {
    let mut store = store("link");
    let outside = temp("link-outside");
    fs::write(outside.join("secret.txt"), "secret").unwrap();
    std::os::unix::fs::symlink(outside.join("secret.txt"), store.root().join("link.txt")).unwrap();
    let StoreError::Invalid(message) = store.read_file("link.txt").unwrap_err() else {
        panic!("expected Invalid");
    };
    assert!(message.contains("inside the folder"), "{message}");
}

#[test]
fn an_export_never_replaces_a_file() {
    let mut store = store("export");
    let first = store.write_export("talk.deck", "pptx", b"one").unwrap();
    assert_eq!((first.path.as_str(), first.bytes), ("talk.pptx", 3));
    let again = store.write_export("talk.deck", "pptx", b"one").unwrap();
    assert_eq!(again.path, "talk.pptx", "the same bytes are the same file");
    let changed = store.write_export("talk.deck", "pptx", b"two!").unwrap();
    assert_eq!(changed.path, "talk 2.pptx");
    assert_eq!(fs::read(store.root().join("talk.pptx")).unwrap(), b"one");
    assert_eq!(fs::read(store.root().join("talk 2.pptx")).unwrap(), b"two!");
    assert!(store.write_export("../talk.deck", "pptx", b"x").is_err());
}

#[test]
fn a_bibliography_beside_the_decks_gives_the_citation_keys() {
    let mut store = store("refs");
    assert!(
        store.references().is_none(),
        "with no bibliography nothing is checked"
    );
    fs::write(
        store.root().join("refs.bib"),
        "@article{smith2020, title={A}}\n@book{jones19, title={B}}\n",
    )
    .unwrap();
    let refs = store.references().unwrap();
    assert!(refs.contains("smith2020") && refs.contains("jones19") && !refs.contains("nobody"));
}

#[test]
fn a_deck_exports_and_comes_back_as_a_deck() {
    let mut store = store("roundtrip");
    let text = deck_text("Round trip");
    let made = store.create("Round trip", &text).unwrap();
    let deck = canonical::parse(&made.text).unwrap();
    let (bytes, _) = store.make_pptx(&deck).unwrap();
    assert_eq!(&bytes[..2], b"PK", "a PowerPoint file is a zip");
    let written = store.write_export(&made.name, "pptx", &bytes).unwrap();
    assert_eq!(written.path, "round-trip.pptx");

    let back = store.import_pptx("round-trip.pptx", None).unwrap();
    assert!(back.deck.name.ends_with(".deck") && back.deck.name != made.name);
    let imported = canonical::parse(&back.deck.text).unwrap();
    assert_eq!(imported.slides.len(), deck.slides.len());
    assert_eq!(
        store.decks().unwrap().len(),
        2,
        "the deck it came from is untouched"
    );
}

const BIB: &str = "\
@inproceedings{vaswani2017attention, title={Attention is all you need}, author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob}, booktitle={Advances in Neural Information Processing Systems}, year={2017}}
@article{lecun2015deep, title={Deep learning}, author={LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey}, journal={Nature}, year={2015}}
";

/// A deck whose first blank slide cites a work by its number, and whose second cites two works
/// and lists every work the deck cites.
fn cited_deck() -> Deck {
    let mut engine = Engine::create("Cited", "Light", 9).unwrap();
    let mut put = |element: serde_json::Value| {
        let added = engine
            .apply("add_slide", serde_json::json!({ "layout": "blank" }))
            .unwrap();
        let slide = added.output["slide"].as_str().unwrap().to_owned();
        engine
            .apply(
                "add_elements",
                serde_json::json!({ "slide": slide, "elements": [element] }),
            )
            .unwrap();
        slide
    };
    put(
        serde_json::json!({ "type": "citation", "id": "c1", "x": 64, "y": 480, "w": 700, "h": 30, "keys": ["lecun2015deep"], "format": "numbered" }),
    );
    let second = put(
        serde_json::json!({ "type": "citation", "id": "c2", "x": 64, "y": 480, "w": 700, "h": 30, "keys": ["vaswani2017attention", "lecun2015deep"] }),
    );
    engine
        .apply(
            "add_elements",
            serde_json::json!({ "slide": second, "elements": [
                { "type": "citation", "id": "refs", "x": 64, "y": 100, "w": 800, "h": 300, "keys": [], "format": "list" }
            ] }),
        )
        .unwrap();
    engine.deck().clone()
}

/// Every paragraph of every text in a PowerPoint file, read back as a person opening it would.
fn paragraphs(pptx: &[u8]) -> Vec<String> {
    fn collect(value: &serde_json::Value, found: &mut Vec<String>) {
        match value {
            serde_json::Value::Object(map) => {
                for paragraph in map
                    .get("paragraphs")
                    .and_then(serde_json::Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    let runs = paragraph["runs"].as_array().into_iter().flatten();
                    found.push(runs.filter_map(|r| r["t"].as_str()).collect());
                }
                map.values().for_each(|v| collect(v, found));
            }
            serde_json::Value::Array(list) => list.iter().for_each(|v| collect(v, found)),
            _ => {}
        }
    }
    let back = import(pptx, &ImportOptions::default()).unwrap();
    let mut found = Vec::new();
    collect(&serde_json::to_value(&back.deck).unwrap(), &mut found);
    found
}

#[test]
fn an_export_writes_citations_as_the_editor_draws_them_from_the_bibliography_in_the_folder() {
    let mut store = store("cited");
    let deck = cited_deck();

    // With no bibliography in the folder the file keeps the keys, numbered as the deck numbers them.
    let (bare, _) = store.make_pptx(&deck).unwrap();
    let found = paragraphs(&bare);
    assert!(
        found.contains(&"(vaswani2017attention; lecun2015deep)".to_owned()),
        "{found:?}"
    );
    assert!(found.contains(&"[1] lecun2015deep".to_owned()), "{found:?}");

    // With one, the works are written from it: a number, a label, and the list.
    fs::write(store.root().join("refs.bib"), BIB).unwrap();
    let (written, warnings) = store.make_pptx(&deck).unwrap();
    assert!(warnings.is_empty(), "{warnings:?}");
    let found = paragraphs(&written);
    assert!(found.contains(&"[1]".to_owned()), "{found:?}");
    assert!(
        found.contains(&"Vaswani et al., 2017 (NeurIPS); LeCun et al., 2015 (Nature)".to_owned()),
        "{found:?}"
    );
    assert!(
        found.iter().any(|p| p
            .starts_with("[1] Y. LeCun, Y. Bengio, and G. Hinton. Deep learning. Nature, 2015.")),
        "{found:?}"
    );
    assert!(
        found
            .iter()
            .any(|p| p.starts_with("[2] A. Vaswani et al. Attention is all you need.")),
        "{found:?}"
    );
    assert!(
        found.iter().all(|p| !p.contains("vaswani2017attention")),
        "{found:?}"
    );
}

#[test]
fn something_that_is_not_a_presentation_is_not_imported() {
    let mut store = store("badpptx");
    fs::write(store.root().join("fake.pptx"), "this is not a zip file").unwrap();
    let error = store.import_pptx("fake.pptx", None).unwrap_err();
    assert!(matches!(error, StoreError::Invalid(_)), "{error}");
    assert!(store.decks().unwrap().is_empty());
    assert!(matches!(
        store.import_pptx("../x.pptx", None),
        Err(StoreError::Invalid(_))
    ));
}
