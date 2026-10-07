//! The asset store: a picture kept once in `assets/` with a sidecar in the
//! same commit; the same bytes, however named, are the same asset.

use crate::asset_support::{fixture, known};
use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::Kasten;
use kasten_core::assets::{AssetSource, NewAsset};
use kasten_core::history::Actor;
use serde_json::Value;

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

fn pasted() -> NewAsset {
    NewAsset {
        source: Some(AssetSource::Pasted),
        ..NewAsset::default()
    }
}

fn sidecar(t: &common::TempVault, rel: &str) -> Value {
    serde_json::from_str(&fs::read_to_string(t.vault.root().join(rel)).unwrap()).unwrap()
}

fn session() -> Actor {
    Actor::Agent {
        client: "claude-code".into(),
        session: "01K5ZK00000000000000000009".into(),
    }
}

#[test]
fn a_picture_and_its_sidecar_are_one_commit() {
    let (t, k) = open();
    let commits = k.log(None, 500).unwrap().len();
    let pixel = fixture("pixel.png");
    let added = k
        .add_asset(&Actor::Human, "Figure 3.png", &pixel, &pasted(), NOW)
        .unwrap();
    assert_eq!(added.path, "assets/figure-3.png");
    assert!(added.created);
    assert_eq!(fs::read(t.vault.root().join(&added.path)).unwrap(), pixel);

    let log = k.log(None, 500).unwrap();
    assert_eq!(log.len(), commits + 1, "one commit for both files");
    assert!(
        log[0].summary.contains("figure-3.png"),
        "{}",
        log[0].summary
    );
    let mut files: Vec<String> = k
        .commit_changes(&log[0].id)
        .unwrap()
        .into_iter()
        .map(|c| c.path)
        .collect();
    files.sort();
    assert_eq!(
        files,
        ["assets/.meta/figure-3.png.json", "assets/figure-3.png"]
    );

    let card = sidecar(&t, "assets/.meta/figure-3.png.json");
    let want = known("pixel.png");
    assert_eq!(card["id"].as_str().unwrap().len(), 26);
    assert_eq!(card["name"], "Figure 3.png");
    assert_eq!(card["sha256"], want.sha256);
    assert_eq!(card["bytes"], want.bytes);
    assert_eq!(
        (card["width"].as_u64(), card["height"].as_u64()),
        (Some(u64::from(want.width)), Some(u64::from(want.height)))
    );
    assert_eq!(card["source"], "pasted");
    assert_eq!(card["createdBy"], "person");
    assert_eq!(card["created"], NOW.rfc3339());
    assert_eq!(card["tags"], serde_json::json!([]));
    assert!(card.get("caption").is_none() && card.get("citationKey").is_none());
    assert_eq!(added.asset.sha256.as_deref(), Some(want.sha256.as_str()));
    assert_eq!(added.asset.name, "Figure 3.png");
}

#[test]
fn a_sidecar_has_one_key_to_a_line_so_two_computers_merge_it() {
    let (t, k) = open();
    let added = k
        .add_asset(
            &Actor::Human,
            "Chart.png",
            &fixture("wide.png"),
            &pasted(),
            NOW,
        )
        .unwrap();
    let text = fs::read_to_string(t.vault.root().join("assets/.meta/chart.png.json")).unwrap();
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.first(), Some(&"{"));
    assert_eq!(lines.last(), Some(&"}"));
    assert!(text.ends_with("}\n"));
    let keys = sidecar(&t, "assets/.meta/chart.png.json")
        .as_object()
        .unwrap()
        .len();
    assert_eq!(lines.len(), keys + 2, "{text}");
    assert!(lines[1].starts_with("  \"id\": \""), "{text}");
    assert!(text.contains("  \"tags\": [],\n") || text.contains("  \"tags\": []\n"));
    assert_eq!(added.asset.width, Some(640));
}

#[test]
fn the_same_picture_pasted_twice_is_the_same_asset() {
    let (t, k) = open();
    let pixel = fixture("pixel.png");
    let first = k
        .add_asset(&Actor::Human, "Pasted image 1.png", &pixel, &pasted(), NOW)
        .unwrap();
    let commits = k.log(None, 500).unwrap().len();
    let before = fs::read(t.vault.root().join("assets/.meta/pasted-image-1.png.json")).unwrap();
    let second = k
        .add_asset(&Actor::Human, "Pasted image 2.png", &pixel, &pasted(), NOW)
        .unwrap();
    assert_eq!(second.path, first.path);
    assert!(!second.created);
    assert_eq!(second.asset.id, first.asset.id);
    assert_eq!(k.log(None, 500).unwrap().len(), commits, "no commit");
    let files: Vec<_> = fs::read_dir(t.vault.root().join("assets"))
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(files.len(), 2, "the picture and .meta: {files:?}");
    let after = fs::read(t.vault.root().join("assets/.meta/pasted-image-1.png.json")).unwrap();
    assert_eq!(before, after, "the first asset's sidecar is left as it is");
}

#[test]
fn the_same_bytes_are_found_anywhere_in_assets_and_in_old_files_without_a_sidecar() {
    let (t, k) = open();
    let logo = fixture("logo.svg");
    fs::create_dir_all(t.vault.root().join("assets/photo-organiser")).unwrap();
    fs::write(
        t.vault.root().join("assets/photo-organiser/old-logo.svg"),
        &logo,
    )
    .unwrap();
    let commits = k.log(None, 500).unwrap().len();
    let added = k
        .add_asset(&Actor::Human, "brand.svg", &logo, &NewAsset::default(), NOW)
        .unwrap();
    assert_eq!(added.path, "assets/photo-organiser/old-logo.svg");
    assert!(!added.created);
    assert_eq!(k.log(None, 500).unwrap().len(), commits, "no commit");
    assert!(
        !t.vault.root().join("assets/photo-organiser/.meta").exists(),
        "looking writes nothing: a sidecar comes with the first change"
    );
    assert_eq!(
        added.asset.sha256.as_deref(),
        Some(known("logo.svg").sha256.as_str())
    );
    assert!(!added.asset.described);
}

#[test]
fn other_bytes_under_a_taken_name_take_the_next_free_one() {
    let (_t, k) = open();
    let first = k
        .add_asset(
            &Actor::Human,
            "diagram.png",
            &fixture("pixel.png"),
            &pasted(),
            NOW,
        )
        .unwrap();
    let second = k
        .add_asset(
            &Actor::Human,
            "Diagram.PNG",
            &fixture("wide.png"),
            &pasted(),
            NOW,
        )
        .unwrap();
    assert_eq!(first.path, "assets/diagram.png");
    assert_eq!(second.path, "assets/diagram-2.png");
    assert_eq!(second.asset.name, "Diagram.PNG");
}

#[test]
fn an_agents_asset_records_its_session_and_is_committed_as_the_agents() {
    let (t, k) = open();
    let added = k
        .add_asset(
            &session(),
            "chart.png",
            &fixture("wide.png"),
            &NewAsset::default(),
            NOW,
        )
        .unwrap();
    let card = sidecar(&t, "assets/.meta/chart.png.json");
    assert_eq!(card["source"], "agent");
    assert_eq!(card["createdBy"], "agent:01K5ZK00000000000000000009");
    assert_eq!(
        added.asset.created_by.as_deref(),
        Some("agent:01K5ZK00000000000000000009")
    );
    let log = k.log(None, 1).unwrap();
    assert!(log[0].agent);
    assert_eq!(
        log[0].session.as_deref(),
        Some("01K5ZK00000000000000000009")
    );
}

#[test]
fn a_person_adding_a_file_is_a_file_unless_it_says_it_was_pasted() {
    let (_t, k) = open();
    let file = k
        .add_asset(
            &Actor::Human,
            "a.png",
            &fixture("pixel.png"),
            &NewAsset::default(),
            NOW,
        )
        .unwrap();
    assert_eq!(file.asset.source.as_deref(), Some("file"));
    let saved = k
        .save_asset(&Actor::Human, "b.jpg", &fixture("photo.jpg"), NOW)
        .unwrap();
    assert_eq!(saved, "assets/b.jpg");
    assert_eq!(k.asset(&saved).unwrap().source.as_deref(), Some("file"));
}

#[test]
fn the_rules_of_a_pasted_file_hold_for_every_way_in() {
    let (_t, k) = open();
    let add = |name: &str, bytes: &[u8]| k.add_asset(&Actor::Human, name, bytes, &pasted(), NOW);
    assert!(add("empty.png", b"").is_err());
    assert!(add("setup.exe", b"x").is_err());
    assert!(add("page.html", b"<html>").is_err());
    assert!(add("no-extension", b"x").is_err());
    let huge = vec![0u8; kasten_core::MAX_ASSET_BYTES + 1];
    assert!(add("huge.png", &huge).is_err());
    // A file that is not a picture is still kept, without a size.
    let sheet = add("Trip budget.xlsx", b"sheet").unwrap();
    assert_eq!(sheet.path, "assets/trip-budget.xlsx");
    assert_eq!(sheet.asset.width, None);
    // The person cannot claim to be an agent.
    let agent = NewAsset {
        source: Some(AssetSource::Agent),
        ..NewAsset::default()
    };
    assert!(
        k.add_asset(&Actor::Human, "x.png", b"x", &agent, NOW)
            .is_err()
    );
}

#[test]
fn fake_picture_bytes_are_kept_with_no_size() {
    let (_t, k) = open();
    let added = k
        .add_asset(
            &Actor::Human,
            "fake.png",
            b"\x89PNG\r\n\x1a\nfake image bytes",
            &pasted(),
            NOW,
        )
        .unwrap();
    assert_eq!((added.asset.width, added.asset.height), (None, None));
    assert!(added.asset.sha256.is_some());
}

#[test]
fn verify_has_nothing_to_say_about_the_sidecars() {
    let (_t, k) = open();
    let before = k.verify().unwrap();
    k.add_asset(
        &Actor::Human,
        "Figure 3.png",
        &fixture("pixel.png"),
        &pasted(),
        NOW,
    )
    .unwrap();
    k.add_asset(
        &session(),
        "chart.svg",
        &fixture("logo.svg"),
        &NewAsset::default(),
        NOW,
    )
    .unwrap();
    let after = k.verify().unwrap();
    assert_eq!(after.problems, before.problems);
    assert_eq!(
        (after.notes, after.boards, after.decks),
        (before.notes, before.boards, before.decks)
    );
}
