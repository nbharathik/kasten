//! Where a picture is used: computed by looking, never stored, so it cannot
//! go stale. Notes, whiteboards and decks are all looked at.

use crate::asset_support::fixture;
use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::assets::AssetUsage;
use kasten_core::board::BoardChange;
use kasten_core::history::Actor;
use kasten_core::{Error, Kasten};
use serde_json::json;

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

fn keep(k: &Kasten, name: &str, fixture_name: &str) -> String {
    k.save_asset(&Actor::Human, name, &fixture(fixture_name), NOW)
        .unwrap()
}

fn write(t: &common::TempVault, rel: &str, text: &str) {
    let file = t.vault.root().join(rel);
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(file, text).unwrap();
}

fn deck(title: &str, slides: serde_json::Value, theme: serde_json::Value) -> String {
    let mut text = serde_json::to_string_pretty(&json!({
        "format": "kasten-deck",
        "formatVersion": 1,
        "id": "d-4b1e0x9a",
        "title": title,
        "size": { "w": 960, "h": 540 },
        "theme": theme,
        "slides": slides,
    }))
    .unwrap();
    text.push('\n');
    text
}

fn picture(src: &str) -> serde_json::Value {
    json!({ "type": "image", "id": "e-1", "src": src, "x": 0, "y": 0, "w": 10, "h": 10 })
}

fn paths(places: &[kasten_core::assets::Place]) -> Vec<&str> {
    places.iter().map(|p| p.path.as_str()).collect()
}

#[test]
fn notes_that_show_a_picture_are_found_however_they_link_to_it() {
    let (t, k) = open();
    let wide = keep(&k, "wide.png", "wide.png");
    write(
        &t,
        "inbox/plain.md",
        "---\ntitle: Plain\n---\nSee ![a figure](../assets/wide.png) here.\n",
    );
    write(
        &t,
        "library/titled.md",
        "![x](../assets/wide.png \"A title\")\n",
    );
    write(&t, "library/from-root.md", "![x](/assets/wide.png)\n");
    write(
        &t,
        "library/embed.md",
        "Above ![[wide.png]] and ![[assets/wide.png|300]]\n",
    );
    write(
        &t,
        "library/html.md",
        "<img src=\"../assets/wide.png\" width=\"40\">\n",
    );
    write(
        &t,
        "projects/photo-organiser/deep.md",
        "![x](../../assets/wide.png)\n",
    );
    // Not uses: code, the web, other pictures, a link that is not an image.
    write(
        &t,
        "library/code.md",
        "```md\n![x](../assets/wide.png)\n```\nand `![y](../assets/wide.png)`\n",
    );
    write(
        &t,
        "library/web.md",
        "![x](https://example.com/assets/wide.png)\n",
    );
    write(&t, "library/link.md", "[the figure](../assets/wide.png)\n");
    write(&t, "library/other.md", "![x](../assets/nothing.png)\n");

    let usage = k.asset_usage(&wide).unwrap();
    assert_eq!(
        paths(&usage.notes),
        [
            "inbox/plain.md",
            "library/embed.md",
            "library/from-root.md",
            "library/html.md",
            "library/titled.md",
            "projects/photo-organiser/deep.md",
        ]
    );
    assert_eq!(usage.notes[0].title, "Plain");
    assert!(usage.boards.is_empty() && usage.decks.is_empty());
}

#[test]
fn a_name_with_spaces_is_found_written_either_way_an_import_wrote_it() {
    let (t, k) = open();
    fs::create_dir_all(t.vault.root().join("assets/photo-organiser")).unwrap();
    fs::write(
        t.vault.root().join("assets/photo-organiser/My Image.png"),
        fixture("pixel.png"),
    )
    .unwrap();
    write(
        &t,
        "library/angle.md",
        "![s](<../assets/photo-organiser/My Image.png>)\n",
    );
    write(
        &t,
        "library/percent.md",
        "![t](../assets/photo-organiser/My%20Image.png)\n",
    );
    write(
        &t,
        "library/wrong.md",
        "![t](../assets/photo-organiser/My-Image.png)\n",
    );
    let usage = k
        .asset_usage("assets/photo-organiser/My Image.png")
        .unwrap();
    assert_eq!(
        paths(&usage.notes),
        ["library/angle.md", "library/percent.md"]
    );
}

#[test]
fn a_link_that_leaves_the_vault_or_names_no_file_is_not_a_use() {
    let (t, k) = open();
    let path = keep(&k, "logo.svg", "logo.svg");
    write(
        &t,
        "inbox/up.md",
        "![x](../../assets/logo.svg)\n![y](../../../assets/logo.svg)\n",
    );
    write(&t, "inbox/query.md", "![x](../assets/logo.svg?raw=1#top)\n");
    let usage = k.asset_usage(&path).unwrap();
    assert_eq!(paths(&usage.notes), ["inbox/query.md"]);
}

#[test]
fn boards_with_a_card_for_the_picture_are_found() {
    let (_t, k) = open();
    let path = keep(&k, "wide.png", "wide.png");
    let board = k.create_board(&Actor::Human, "Figures", None, NOW).unwrap();
    let card = BoardChange::Card {
        path: path.clone(),
        x: 0,
        y: 0,
        width: Some(320),
        height: Some(80),
    };
    k.board_apply(&Actor::Human, &board, &[card], NOW).unwrap();
    let usage = k.asset_usage(&path).unwrap();
    assert_eq!(paths(&usage.boards), [board.as_str()]);
    assert_eq!(usage.boards[0].title, "Figures");
    assert!(usage.notes.is_empty());
}

#[test]
fn decks_list_the_slides_that_use_a_picture_and_whether_a_theme_does() {
    let (t, k) = open();
    let path = keep(&k, "wide.png", "wide.png");
    let slides = json!([
        { "id": "s-1", "layout": "title", "elements": [] },
        { "id": "s-2", "layout": "blank", "elements": [picture(&path), picture("assets/other.png")] },
        { "id": "s-3", "layout": "blank", "elements": [{ "type": "text", "id": "t", "text": "assets/wide.png" }] },
        { "id": "s-4", "layout": "blank", "background": { "image": path },
          "elements": [{ "type": "group", "id": "g", "children": [picture(&path)] }] },
        { "id": "s-5", "layout": "blank", "elements": [{ "type": "raw", "id": "r", "preview": path }] },
    ]);
    write(
        &t,
        "library/lecture.deck",
        &deck("Lecture", slides, json!({ "master": [picture(&path)] })),
    );
    write(
        &t,
        "library/unrelated.deck",
        &deck(
            "Unrelated",
            json!([{ "id": "s-1", "layout": "blank", "elements": [picture("assets/other.png")] }]),
            json!({}),
        ),
    );
    let usage = k.asset_usage(&path).unwrap();
    assert_eq!(usage.decks.len(), 1);
    let lecture = &usage.decks[0];
    assert_eq!(lecture.path, "library/lecture.deck");
    assert_eq!(lecture.title, "Lecture");
    let seen: Vec<(usize, &str)> = lecture
        .slides
        .iter()
        .map(|s| (s.number, s.id.as_str()))
        .collect();
    assert_eq!(seen, [(2, "s-2"), (4, "s-4"), (5, "s-5")]);
    assert!(lecture.theme, "the theme's master shows it on every slide");

    // A picture that is not kept (a broken link) is still reported where it is named.
    let gone = k.asset_usage("assets/other.png").unwrap();
    let names: Vec<&str> = gone.decks.iter().map(|d| d.path.as_str()).collect();
    assert_eq!(names, ["library/lecture.deck", "library/unrelated.deck"]);
}

#[test]
fn a_deck_that_cannot_be_read_is_skipped() {
    let (t, k) = open();
    let path = keep(&k, "wide.png", "wide.png");
    write(&t, "library/broken.deck", "{ not json");
    assert!(k.asset_usage(&path).unwrap().decks.is_empty());
}

#[test]
fn one_scan_gives_the_use_of_every_picture_and_agrees_with_asking_one_by_one() {
    let (t, k) = open();
    let wide = keep(&k, "wide.png", "wide.png");
    let photo = keep(&k, "photo.jpg", "photo.jpg");
    let unused = keep(&k, "unused.png", "pixel.png");
    write(
        &t,
        "inbox/a.md",
        "![x](../assets/wide.png) ![y](../assets/photo.jpg)\n",
    );
    write(
        &t,
        "library/d.deck",
        &deck(
            "D",
            json!([{ "id": "s-1", "layout": "blank", "elements": [picture(&photo)] }]),
            json!({}),
        ),
    );
    let all = k.assets_usage().unwrap();
    assert_eq!(all.get(&wide).unwrap().notes.len(), 1);
    assert_eq!(all.get(&photo).unwrap().notes.len(), 1);
    assert_eq!(all.get(&photo).unwrap().decks.len(), 1);
    assert!(all.get(&unused).is_none_or(AssetUsage::is_empty));
    for asset in k.assets().unwrap() {
        let one = k.asset_usage(&asset.path).unwrap();
        let from_scan = all.get(&asset.path).cloned().unwrap_or_default();
        assert_eq!(one, from_scan, "{}", asset.path);
    }
    assert!(k.asset_usage(&unused).unwrap().is_empty());
    assert_eq!(k.asset_usage(&photo).unwrap().count(), 2);
}

#[test]
fn asking_where_something_else_is_used_is_refused() {
    let (_t, k) = open();
    for path in [
        "notes/welcome.md",
        "assets/../x.png",
        "",
        "/assets/x.png",
        "assets/",
    ] {
        assert!(
            matches!(
                k.asset_usage(path),
                Err(Error::InvalidPath(_) | Error::Invalid(_))
            ),
            "{path}"
        );
    }
    assert!(k.asset_usage("assets/none.png").unwrap().is_empty());
}
