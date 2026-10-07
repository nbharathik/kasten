use super::*;
use crate::dev::files::content_hash;
use slides_assets::sha256_hex;

const PIXEL: &[u8] = include_bytes!("../../../../../fixtures/assets/pixel.png");
const WIDE: &[u8] = include_bytes!("../../../../../fixtures/assets/wide.png");
const LOGO: &[u8] = include_bytes!("../../../../../fixtures/assets/logo.svg");

fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("slides-pictures-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn folder(name: &str) -> Folder {
    Folder::open(&temp(name)).unwrap()
}

fn card(folder: &Folder, name: &str) -> serde_json::Value {
    serde_json::from_str(&fs::read_to_string(folder.card_file(name)).unwrap()).unwrap()
}

#[test]
fn a_picture_is_kept_with_a_sidecar_that_says_what_it_is() {
    let folder = folder("kept");
    let kept = folder
        .keep_picture("Figure 3.png", PIXEL, "pasted")
        .unwrap();
    assert_eq!(
        kept,
        Kept {
            path: "assets/Figure 3.png".into(),
            created: true
        }
    );
    let card = card(&folder, "Figure 3.png");
    assert_eq!(card["name"], "Figure 3.png");
    assert_eq!(card["sha256"], sha256_hex(PIXEL));
    assert_eq!(
        (card["width"].as_u64(), card["height"].as_u64()),
        (Some(4), Some(3))
    );
    assert_eq!(
        (card["source"].as_str(), card["createdBy"].as_str()),
        (Some("pasted"), Some("person"))
    );
    assert_eq!(card["id"].as_str().map(str::len), Some(26));
    assert!(card["created"].as_str().is_some_and(|t| t.ends_with('Z')));
    assert_eq!(card["tags"], serde_json::json!([]));
    assert!(
        folder.keep_picture("x.png", PIXEL, "agent").is_err(),
        "a page pastes or chooses files"
    );
    assert!(folder.keep_picture("empty.png", b"", "file").is_err());
}

#[test]
fn the_same_bytes_under_any_name_are_the_same_picture() {
    let folder = folder("same");
    let first = folder
        .keep_picture("Pasted image 1.png", PIXEL, "pasted")
        .unwrap();
    let second = folder
        .keep_picture("Pasted image 2.png", PIXEL, "pasted")
        .unwrap();
    assert_eq!(
        second,
        Kept {
            path: first.path.clone(),
            created: false
        }
    );
    assert_eq!(folder.assets().len(), 1);
    assert_eq!(
        fs::read_dir(folder.root().join("assets/.meta"))
            .unwrap()
            .count(),
        1
    );
    // Other bytes under a taken name take a free one, and a sidecar left behind keeps its name.
    assert_eq!(
        folder.add_asset("Pasted image 1.png", WIDE).unwrap(),
        "assets/Pasted image 1 2.png"
    );
    // An old picture without a sidecar counts too.
    fs::write(folder.root().join("assets/old-logo.svg"), LOGO).unwrap();
    let logo = folder.keep_picture("brand.svg", LOGO, "file").unwrap();
    assert_eq!(
        logo,
        Kept {
            path: "assets/old-logo.svg".into(),
            created: false
        }
    );
    assert!(
        !folder.card_file("old-logo.svg").exists(),
        "looking writes nothing"
    );
}

#[test]
fn the_list_has_what_the_sidecars_say_and_what_the_files_say() {
    let folder = folder("list");
    folder.keep_picture("wide.png", WIDE, "file").unwrap();
    fs::write(folder.root().join("assets/old.png"), PIXEL).unwrap();
    fs::write(folder.root().join("assets/notes.txt"), "not a picture").unwrap();
    let list = folder.assets();
    assert_eq!(list.len(), 2, "{list:?}");
    let wide = list.iter().find(|a| a.path == "assets/wide.png").unwrap();
    assert_eq!((wide.width, wide.height), (Some(640), Some(160)));
    assert_eq!(wide.sha256.as_deref(), Some(sha256_hex(WIDE).as_str()));
    assert_eq!(wide.source.as_deref(), Some("file"));
    let old = list.iter().find(|a| a.path == "assets/old.png").unwrap();
    assert_eq!(
        (
            old.width,
            old.height,
            old.source.as_deref(),
            old.sha256.as_deref()
        ),
        (Some(4), Some(3), None, None)
    );
    assert_eq!(old.name, "old.png");
    assert!(old.added > 0);
}

#[test]
fn tags_a_caption_and_a_citation_key_are_kept_in_the_sidecar() {
    let folder = folder("meta");
    let path = folder.add_asset("fig.png", WIDE).unwrap();
    let edit = AssetEdit {
        tags: Some(vec![
            "Figure".into(),
            " #Attention ".into(),
            "figure".into(),
        ]),
        caption: Some("  Scaled dot-product attention. ".into()),
        citation_key: Some("vaswani2017attention".into()),
    };
    let entry = folder.set_asset_meta(&path, &edit).unwrap();
    assert_eq!(entry.tags, ["Figure", "Attention"]);
    assert_eq!(
        entry.caption.as_deref(),
        Some("Scaled dot-product attention.")
    );
    assert_eq!(entry.citation_key.as_deref(), Some("vaswani2017attention"));
    let cleared = AssetEdit {
        caption: Some(String::new()),
        ..AssetEdit::default()
    };
    let entry = folder.set_asset_meta(&path, &cleared).unwrap();
    assert_eq!((entry.caption, entry.tags.len()), (None, 2));
    for bad in [
        AssetEdit {
            citation_key: Some("two words".into()),
            ..AssetEdit::default()
        },
        AssetEdit {
            tags: Some((0..40).map(|n| format!("t{n}")).collect()),
            ..AssetEdit::default()
        },
    ] {
        assert!(folder.set_asset_meta(&path, &bad).is_err());
    }
    assert!(folder.set_asset_meta("assets/none.png", &edit).is_err());
    assert!(folder.set_asset_meta("assets/../x.png", &edit).is_err());
}

#[test]
fn an_old_picture_gets_its_sidecar_with_its_first_change_and_unreadable_ones_are_left_alone() {
    let folder = folder("legacy");
    fs::create_dir_all(folder.root().join("assets")).unwrap();
    fs::write(folder.root().join("assets/old.png"), PIXEL).unwrap();
    let edit = AssetEdit {
        tags: Some(vec!["holiday".into()]),
        ..AssetEdit::default()
    };
    folder.set_asset_meta("assets/old.png", &edit).unwrap();
    let made = card(&folder, "old.png");
    assert_eq!(
        (made["sha256"].as_str(), made["tags"].clone()),
        (
            Some(sha256_hex(PIXEL).as_str()),
            serde_json::json!(["holiday"])
        )
    );
    assert!(made.get("source").is_none());
    // A sidecar that is not one is never written over.
    fs::write(folder.card_file("old.png"), "{ nope").unwrap();
    assert!(folder.set_asset_meta("assets/old.png", &edit).is_err());
    assert_eq!(
        fs::read_to_string(folder.card_file("old.png")).unwrap(),
        "{ nope"
    );
}

#[test]
fn thumbnails_are_webp_copies_made_once() {
    let folder = folder("thumbs");
    let wide = folder.add_asset("wide.png", WIDE).unwrap();
    let logo = folder.add_asset("logo.svg", LOGO).unwrap();
    let copy = folder.thumb(&wide, 256).unwrap().unwrap();
    assert_eq!(
        (&copy[..4], &copy[8..12]),
        (b"RIFF".as_slice(), b"WEBP".as_slice())
    );
    assert_eq!(slides_assets::dimensions(&copy), Some((256, 64)));
    let again = folder.thumb(&wide, 256).unwrap().unwrap();
    assert!(
        Arc::ptr_eq(&copy, &again),
        "the copy made before is the one given"
    );
    assert!(
        folder.thumb(&logo, 256).unwrap().is_none(),
        "a vector picture has none"
    );
    assert!(folder.thumb(&wide, 100).is_err());
    assert!(folder.thumb("assets/none.png", 256).is_err());
}

#[test]
fn usage_lists_the_slides_of_each_deck_that_show_a_picture() {
    let folder = folder("usage");
    let path = folder.add_asset("wide.png", WIDE).unwrap();
    let deck = folder.create("Talk", "Light").unwrap();
    let mut value: serde_json::Value = serde_json::from_str(&deck.text).unwrap();
    let slide = &mut value["slides"][0];
    let id = slide["id"].as_str().unwrap().to_owned();
    slide["elements"] = serde_json::json!([{ "type": "image", "id": "e-1", "src": path, "x": 0, "y": 0, "w": 10, "h": 10 }]);
    value["theme"]["master"] = serde_json::json!([{ "type": "image", "id": "m-1", "src": path, "x": 0, "y": 0, "w": 10, "h": 10 }]);
    let text = serde_json::to_string_pretty(&value).unwrap();
    folder.save(&deck.path, &text, &deck.hash).unwrap();
    let usage = folder.usage();
    let used = &usage[&path];
    assert_eq!(used.decks.len(), 1);
    assert_eq!(
        (used.decks[0].path.as_str(), used.decks[0].title.as_str()),
        (deck.path.as_str(), "Talk")
    );
    assert_eq!(
        (
            used.decks[0].slides.len(),
            used.decks[0].slides[0].number,
            used.decks[0].slides[0].id.as_str()
        ),
        (1, 1, id.as_str())
    );
    assert!(used.decks[0].theme);
    assert!(used.notes.is_empty() && used.boards.is_empty());
    assert!(!usage.contains_key("assets/other.png"));
    assert_eq!(content_hash(&text), folder.read(&deck.path).unwrap().hash);
}
