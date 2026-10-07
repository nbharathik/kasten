//! Pictures, exports, imports and the trash.

use serde_json::json;

use super::{Kit, OUTLINE, with_picture};
use crate::agent::images::tests::png;
use crate::model::Element;
use crate::resolve::Rect;

fn base64(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |n, (i, b)| n | u32::from(*b) << (16 - 8 * i));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(A[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

fn pictures(kit: &Kit, name: &str, slide: usize) -> Vec<(String, Rect)> {
    kit.deck(name).slides[slide - 1]
        .elements
        .iter()
        .filter_map(|e| match e {
            Element::Image(i) => {
                let (x, y, w, h) = i.base.rect()?;
                Some((i.base.id.clone(), Rect { x, y, w, h }))
            }
            _ => None,
        })
        .collect()
}

#[test]
fn a_picture_is_placed_in_its_slot_a_box_or_the_free_space_at_its_own_proportions() {
    let mut kit = Kit::new();
    let name = kit.make("# D\n\n## Slot\n- words\n\n![Placeholder picture](assets/none.png)\n\n## Free <!-- layout: title-only -->");
    kit.ok("add_elements", json!({ "deck": name, "slide": 3, "elements": [
        { "type": "text", "id": "left", "x": 64, "y": 160, "w": 340, "h": 128, "markdown": "- some words on the left\n- and more" },
        { "type": "shape", "id": "card", "shape": "roundRect", "x": 440, "y": 160, "w": 200, "h": 100, "style": { "fill": { "color": "bg2" } } },
    ] }));
    let wide = with_picture(&mut kit, "wide.png", 800, 400);
    let tall = with_picture(&mut kit, "tall.png", 300, 600);
    // The slot: an empty picture slot of the layout, filled and fitted.
    let placed = kit.ok("place_image", json!({ "deck": name, "slide": 2, "src": wide, "alt": "A wide chart", "placeholder": "image" }));
    assert_eq!(placed["result"]["mode"], "placeholder");
    let _ = &placed;
    let slot = pictures(&kit, &name, 2)[0].1;
    assert!((slot.w / slot.h - 2.0).abs() < 0.01, "{slot:?}");
    assert_eq!(placed["result"]["picture"]["width"], 800);
    // A box: fitted and centred in it.
    let boxed = kit.ok("place_image", json!({ "deck": name, "slide": 3, "src": tall, "alt": "A tall diagram", "box": { "x": 500, "y": 150, "w": 300, "h": 300 } }));
    assert_eq!(boxed["result"]["mode"], "box");
    let b = pictures(&kit, &name, 3)[0].1;
    assert!(
        (b.w / b.h - 0.5).abs() < 0.01
            && b.x >= 500.0
            && b.x + b.w <= 800.0
            && b.y >= 150.0
            && b.y + b.h <= 450.0,
        "{b:?}"
    );
    // Auto: the largest free space, clear of the words already there.
    let auto = kit.ok(
        "place_image",
        json!({ "deck": name, "slide": 3, "src": wide, "alt": "Another chart", "auto": true }),
    );
    assert_eq!(auto["result"]["mode"], "auto");
    let deck = kit.deck(&name);
    let slide = &deck.slides[2];
    let a = pictures(&kit, &name, 3)
        .into_iter()
        .find(|(id, _)| Some(id.as_str()) == auto["result"]["element"].as_str())
        .unwrap()
        .1;
    assert!((a.w / a.h - 2.0).abs() < 0.01);
    for e in &slide.elements {
        if e.id() == auto["result"]["element"].as_str().unwrap() {
            continue;
        }
        let r = crate::resolve::box_of(&deck.theme, slide, e).unwrap();
        let overlaps = a.x < r.x + r.w && r.x < a.x + a.w && a.y < r.y + r.h && r.y < a.y + a.h;
        assert!(!overlaps, "{a:?} covers {} at {r:?}", e.id());
    }
    assert_eq!(auto["lint"]["errors"], 0, "{}", auto["lint"]);
}

#[test]
fn placing_a_picture_that_is_not_there_or_not_a_picture_says_what_to_do() {
    let mut kit = Kit::new();
    let name = kit.make("# D\n\n## A\n- x");
    assert!(
        kit.err(
            "place_image",
            json!({ "deck": name, "slide": 2, "src": "assets/none.png", "auto": true })
        )
        .contains("add_asset")
    );
    kit.store
        .assets
        .insert("assets/junk.png".to_owned(), b"not a picture".to_vec());
    assert!(
        kit.err(
            "place_image",
            json!({ "deck": name, "slide": 2, "src": "assets/junk.png", "auto": true })
        )
        .contains("PNG")
    );
    let ok = with_picture(&mut kit, "a.png", 100, 100);
    assert!(
        kit.err(
            "place_image",
            json!({ "deck": name, "slide": 2, "src": ok })
        )
        .contains("placeholder")
    );
    let small = kit.err(
        "place_image",
        json!({ "deck": name, "slide": 2, "src": ok, "box": { "x": 0, "y": 0, "w": 10, "h": 10 } }),
    );
    assert!(small.contains("at least"), "{small}");
}

#[test]
fn pictures_are_added_from_bytes_or_a_file_and_only_pictures() {
    let mut kit = Kit::new();
    let bytes = png(64, 32);
    let added = kit.ok(
        "add_asset",
        json!({ "name": "figure.png", "base64": base64(&bytes) }),
    );
    assert_eq!(
        (
            added["path"].as_str(),
            added["width"].as_u64(),
            added["height"].as_u64()
        ),
        (Some("assets/figure.png"), Some(64), Some(32))
    );
    assert_eq!(kit.store.assets["assets/figure.png"], bytes);
    // The name gets the extension that fits the bytes.
    let renamed = kit.ok(
        "add_asset",
        json!({ "name": "chart", "base64": base64(&bytes) }),
    );
    assert_eq!(renamed["path"], "assets/chart.png");
    kit.store
        .files
        .insert("photos/holiday.png".to_owned(), png(10, 20));
    let from_file = kit.ok("add_asset", json!({ "path": "photos/holiday.png" }));
    assert_eq!(from_file["path"], "assets/holiday.png");
    assert!(
        kit.err(
            "add_asset",
            json!({ "name": "x.png", "base64": base64(b"just words") })
        )
        .contains("not a picture")
    );
    assert!(
        kit.err("add_asset", json!({ "name": "x.png" }))
            .contains("base64")
    );
    assert!(
        kit.err("add_asset", json!({ "name": "x.png", "base64": "@@@" }))
            .contains("base64")
    );
    let found = kit.ok("search_assets", json!({ "query": "fig" }));
    assert_eq!(found["total"], 1);
    assert_eq!(found["assets"][0]["width"], 64);
}

#[test]
fn a_deck_is_exported_as_markdown_and_the_formats_not_built_say_so() {
    let mut kit = Kit::new();
    let name = kit.make(OUTLINE);
    let md = kit.ok("export", json!({ "deck": name, "format": "markdown" }));
    assert_eq!(md["path"], "tool-use-in-models.md");
    assert!(md["outline"].as_str().unwrap().contains("## Why tools?"));
    assert!(kit.store.exports.contains_key("tool-use-in-models.md"));
    // The memory store cannot make PowerPoint files; a real store can.
    assert!(
        kit.err("export", json!({ "deck": name }))
            .contains("not available")
    );
    let pdf = kit.err("export", json!({ "deck": name, "format": "pdf" }));
    assert!(pdf.contains("pdf") && pdf.contains("pptx"), "{pdf}");
    assert!(
        kit.err("export", json!({ "deck": name, "format": "docx" }))
            .contains("docx")
    );
    assert!(
        kit.err("import_pptx", json!({ "path": "talk.pptx" }))
            .contains("not available")
    );
}

#[test]
fn a_deck_goes_to_the_trash_and_can_no_longer_be_worked_on() {
    let mut kit = Kit::new();
    let name = kit.make("# D\n\n## A\n- x");
    let out = kit.ok("trash_deck", json!({ "deck": name }));
    assert!(out["trashedTo"].as_str().unwrap().starts_with(".trash/"));
    assert!(kit.store.decks.is_empty() && kit.store.trashed.len() == 1);
    assert!(
        kit.err("get_deck", json!({ "deck": name }))
            .contains("There are no decks")
            || kit
                .err("get_deck", json!({ "deck": name }))
                .contains("no deck")
    );
}

#[test]
fn lint_deck_lists_what_is_wrong_worst_first_with_the_fix_and_what_it_did_not_check() {
    let mut kit = Kit::new();
    let name = kit.make("# D\n\n## A\n- x");
    kit.ok("add_elements", json!({ "deck": name, "slide": 2, "elements": [
        { "type": "text", "id": "far", "x": 900, "y": 100, "w": 200, "h": 60, "markdown": "off the edge" },
        { "type": "image", "id": "pic", "src": "assets/x.png", "x": 100, "y": 300, "w": 100, "h": 100 },
    ] }));
    let out = kit.call("lint_deck", json!({ "deck": name })).unwrap();
    let lines: Vec<&str> = out.text.lines().collect();
    assert!(
        lines[0].contains("1 error,") && lines[0].contains("fix the errors"),
        "{}",
        out.text
    );
    assert!(
        lines[1].starts_with("error")
            && lines[1].contains("off-slide")
            && lines[1].contains("Fix:"),
        "{}",
        lines[1]
    );
    assert!(out.text.contains("missing-alt"));
    assert!(out.text.contains("Not checked: unresolved-citation"));
    let only = kit
        .call("lint_deck", json!({ "deck": name, "severity": "error" }))
        .unwrap();
    assert!(!only.text.contains("missing-alt"));
    assert!(
        kit.err("lint_deck", json!({ "deck": name, "severity": "loud" }))
            .contains("loud")
    );
}
