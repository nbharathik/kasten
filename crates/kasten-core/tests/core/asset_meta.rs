//! Listing assets with what their sidecars say, old files without one, and
//! the changes a person or an agent makes to a sidecar.

use crate::asset_support::{fixture, known};
use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::assets::{AssetEdit, AssetSource, NewAsset};
use kasten_core::history::Actor;
use kasten_core::{Error, Instant, Kasten};

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

fn later(minutes: u64) -> Instant {
    Instant {
        millis: NOW.millis + minutes * 60_000,
    }
}

fn add(k: &Kasten, name: &str, fixture_name: &str, at: Instant) -> String {
    k.add_asset(
        &Actor::Human,
        name,
        &fixture(fixture_name),
        &NewAsset {
            source: Some(AssetSource::File),
            ..NewAsset::default()
        },
        at,
    )
    .unwrap()
    .path
}

#[test]
fn lists_the_pictures_newest_first_with_their_sidecar_fields() {
    let (_t, k) = open();
    add(&k, "old.png", "pixel.png", NOW);
    add(&k, "new.jpg", "photo.jpg", later(5));
    let list = k.assets().unwrap();
    let paths: Vec<&str> = list.iter().map(|a| a.path.as_str()).collect();
    assert_eq!(paths, ["assets/new.jpg", "assets/old.png"]);
    let new = &list[0];
    assert_eq!((new.width, new.height), (Some(320), Some(200)));
    assert_eq!(new.bytes, known("photo.jpg").bytes);
    assert_eq!(new.name, "new.jpg");
    assert_eq!(new.source.as_deref(), Some("file"));
    assert_eq!(new.created_by.as_deref(), Some("person"));
    assert_eq!(new.added, later(5).millis);
    assert!(new.described);
    assert!(new.tags.is_empty());
}

#[test]
fn only_pictures_are_listed_and_hidden_folders_are_left_out() {
    let (t, k) = open();
    add(&k, "keep.png", "pixel.png", NOW);
    k.save_asset(&Actor::Human, "budget.xlsx", b"sheet", NOW)
        .unwrap();
    fs::create_dir_all(t.vault.root().join("assets/.hidden")).unwrap();
    fs::write(
        t.vault.root().join("assets/.hidden/x.png"),
        fixture("pixel.png"),
    )
    .unwrap();
    fs::write(t.vault.root().join("assets/.dot.png"), fixture("pixel.png")).unwrap();
    let paths: Vec<String> = k.assets().unwrap().into_iter().map(|a| a.path).collect();
    assert_eq!(paths, ["assets/keep.png"]);
}

#[test]
fn old_files_without_a_sidecar_are_listed_from_what_the_file_says() {
    let (t, k) = open();
    fs::create_dir_all(t.vault.root().join("assets/photo-organiser")).unwrap();
    fs::write(
        t.vault.root().join("assets/photo-organiser/Map.PNG"),
        fixture("wide.png"),
    )
    .unwrap();
    let list = k.assets().unwrap();
    assert_eq!(list.len(), 1);
    let map = &list[0];
    assert_eq!(map.path, "assets/photo-organiser/Map.PNG");
    assert_eq!(map.name, "Map.PNG");
    assert_eq!((map.width, map.height), (Some(640), Some(160)));
    assert_eq!(map.bytes, known("wide.png").bytes);
    assert!(!map.described);
    assert!(map.id.is_none() && map.source.is_none() && map.created_by.is_none());
    assert!(map.added > 0);
    assert!(
        !t.vault.root().join("assets/photo-organiser/.meta").exists(),
        "listing writes nothing"
    );
    // One asset by its path also has its hash, read from the file.
    let one = k.asset("assets/photo-organiser/Map.PNG").unwrap();
    assert_eq!(
        one.sha256.as_deref(),
        Some(known("wide.png").sha256.as_str())
    );
}

#[test]
fn asset_refuses_what_is_not_a_picture_kept_in_assets() {
    let (_t, k) = open();
    for path in [
        "assets/missing.png",
        "notes/welcome.md",
        "assets/../inbox/x.png",
        "assets/",
        "/etc/passwd",
        "sources/zettelkasten-primer.pdf",
        "assets/notes.txt",
    ] {
        assert!(k.asset(path).is_err(), "{path}");
    }
    assert!(matches!(
        k.asset("assets/missing.png"),
        Err(Error::NotFound(_))
    ));
}

#[test]
fn tags_caption_and_citation_key_change_in_one_commit() {
    let (t, k) = open();
    let path = add(&k, "fig.png", "wide.png", NOW);
    let commits = k.log(None, 500).unwrap().len();
    let edit = AssetEdit {
        tags: Some(vec![
            "Figure".into(),
            " #Attention ".into(),
            "figure".into(),
            "".into(),
        ]),
        caption: Some("  Scaled dot-product attention.\n".into()),
        citation_key: Some("vaswani2017attention".into()),
    };
    let info = k
        .set_asset_meta(&Actor::Human, &path, &edit, later(1))
        .unwrap();
    assert_eq!(info.tags, ["Figure", "Attention"]);
    assert_eq!(
        info.caption.as_deref(),
        Some("Scaled dot-product attention.")
    );
    assert_eq!(info.citation_key.as_deref(), Some("vaswani2017attention"));
    assert_eq!(k.log(None, 500).unwrap().len(), commits + 1);
    assert_eq!(k.asset(&path).unwrap(), info);
    let listed = k.assets().unwrap();
    assert_eq!(listed[0], info);

    // An empty caption and key clear them; tags not mentioned stay.
    let cleared = AssetEdit {
        caption: Some(String::new()),
        citation_key: Some(String::new()),
        ..AssetEdit::default()
    };
    let info = k
        .set_asset_meta(&Actor::Human, &path, &cleared, later(2))
        .unwrap();
    assert_eq!(info.caption, None);
    assert_eq!(info.citation_key, None);
    assert_eq!(info.tags, ["Figure", "Attention"]);
    let text = fs::read_to_string(t.vault.root().join("assets/.meta/fig.png.json")).unwrap();
    assert!(
        !text.contains("caption") && !text.contains("citationKey"),
        "{text}"
    );
}

#[test]
fn an_edit_that_changes_nothing_makes_no_commit() {
    let (_t, k) = open();
    let path = add(&k, "fig.png", "wide.png", NOW);
    let edit = AssetEdit {
        tags: Some(vec!["a".into()]),
        ..AssetEdit::default()
    };
    k.set_asset_meta(&Actor::Human, &path, &edit, later(1))
        .unwrap();
    let commits = k.log(None, 500).unwrap().len();
    k.set_asset_meta(&Actor::Human, &path, &edit, later(2))
        .unwrap();
    assert_eq!(k.log(None, 500).unwrap().len(), commits);
}

#[test]
fn bad_tags_captions_and_keys_are_refused_before_anything_is_written() {
    let (_t, k) = open();
    let path = add(&k, "fig.png", "wide.png", NOW);
    let commits = k.log(None, 500).unwrap().len();
    let many: Vec<String> = (0..40).map(|n| format!("tag{n}")).collect();
    for edit in [
        AssetEdit {
            tags: Some(many),
            ..AssetEdit::default()
        },
        AssetEdit {
            tags: Some(vec!["x".repeat(200)]),
            ..AssetEdit::default()
        },
        AssetEdit {
            caption: Some("c".repeat(5_000)),
            ..AssetEdit::default()
        },
        AssetEdit {
            citation_key: Some("two words".into()),
            ..AssetEdit::default()
        },
        AssetEdit {
            citation_key: Some("a,b".into()),
            ..AssetEdit::default()
        },
    ] {
        assert!(matches!(
            k.set_asset_meta(&Actor::Human, &path, &edit, later(1)),
            Err(Error::Invalid(_))
        ));
    }
    assert_eq!(k.log(None, 500).unwrap().len(), commits);
}

#[test]
fn the_first_change_to_an_old_asset_writes_its_sidecar() {
    let (t, k) = open();
    fs::create_dir_all(t.vault.root().join("assets")).unwrap();
    fs::write(
        t.vault.root().join("assets/Old Photo.jpg"),
        fixture("photo.jpg"),
    )
    .unwrap();
    let edit = AssetEdit {
        tags: Some(vec!["holiday".into()]),
        ..AssetEdit::default()
    };
    let info = k
        .set_asset_meta(&Actor::Human, "assets/Old Photo.jpg", &edit, later(1))
        .unwrap();
    let text = fs::read_to_string(t.vault.root().join("assets/.meta/Old Photo.jpg.json")).unwrap();
    let card: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(card["name"], "Old Photo.jpg");
    assert_eq!(card["sha256"], known("photo.jpg").sha256);
    assert_eq!(card["width"], 320);
    assert!(
        card.get("source").is_none(),
        "an old file's way in is not known"
    );
    assert!(card.get("createdBy").is_none());
    assert_eq!(card["tags"], serde_json::json!(["holiday"]));
    assert!(info.described);
    assert_eq!(info.id.as_deref(), card["id"].as_str());
    let files: Vec<String> = k
        .commit_changes(&k.log(None, 1).unwrap()[0].id)
        .unwrap()
        .into_iter()
        .map(|c| c.path)
        .collect();
    assert_eq!(files, ["assets/.meta/Old Photo.jpg.json"]);
}

#[test]
fn keys_this_version_does_not_know_survive_a_change() {
    let (t, k) = open();
    let path = add(&k, "fig.png", "wide.png", NOW);
    let file = t.vault.root().join("assets/.meta/fig.png.json");
    let text = fs::read_to_string(&file).unwrap();
    // Another tool (or a newer Kasten) adds keys, one in the middle.
    let with_extra = text
        .replace(
            "  \"bytes\"",
            "  \"x-zotero\": {\"key\": \"ABC123\", \"n\": [1, 2]},\n  \"bytes\"",
        )
        .replace("\n}\n", ",\n  \"later\": true\n}\n");
    fs::write(&file, &with_extra).unwrap();
    let edit = AssetEdit {
        caption: Some("kept".into()),
        ..AssetEdit::default()
    };
    k.set_asset_meta(&Actor::Human, &path, &edit, later(1))
        .unwrap();
    let after = fs::read_to_string(&file).unwrap();
    assert!(
        after.contains("  \"x-zotero\": {\"key\": \"ABC123\", \"n\": [1, 2]},\n  \"bytes\""),
        "{after}"
    );
    assert!(after.contains("\"later\": true"), "{after}");
    assert!(after.contains("\"caption\": \"kept\""), "{after}");
}

#[test]
fn a_sidecar_that_cannot_be_read_is_not_written_over() {
    let (t, k) = open();
    let path = add(&k, "fig.png", "wide.png", NOW);
    let file = t.vault.root().join("assets/.meta/fig.png.json");
    fs::write(&file, "{ this is not json").unwrap();
    // Still listed, from the file itself.
    let list = k.assets().unwrap();
    assert_eq!(list[0].path, path);
    assert!(!list[0].described);
    let edit = AssetEdit {
        caption: Some("x".into()),
        ..AssetEdit::default()
    };
    let err = k
        .set_asset_meta(&Actor::Human, &path, &edit, later(1))
        .unwrap_err();
    assert!(matches!(err, Error::Invalid(_)), "{err:?}");
    assert!(err.to_string().contains("fig.png"), "{err}");
    assert_eq!(fs::read_to_string(&file).unwrap(), "{ this is not json");
}

#[test]
fn a_picture_replaced_outside_kasten_shows_its_real_size() {
    let (t, k) = open();
    let path = add(&k, "fig.png", "wide.png", NOW);
    fs::write(t.vault.root().join(&path), fixture("pixel.png")).unwrap();
    let info = k.asset(&path).unwrap();
    assert_eq!(info.bytes, known("pixel.png").bytes);
    assert_eq!((info.width, info.height), (Some(4), Some(3)));
    assert_eq!(
        info.sha256.as_deref(),
        Some(known("pixel.png").sha256.as_str())
    );
}
