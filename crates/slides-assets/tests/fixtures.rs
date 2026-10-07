//! The sidecars and pictures in `fixtures/assets/`, which the Kasten and
//! `slides dev` tests share. The manifest was made by another tool
//! (Python's hashlib and Pillow), so these agree with an independent reader.

use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use slides_assets::{Clip, Sidecar, dimensions, sha256_hex, thumbnail};

fn folder() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/assets")
}

fn manifest() -> Value {
    serde_json::from_str(&fs::read_to_string(folder().join("manifest.json")).unwrap()).unwrap()
}

#[test]
fn hashes_sizes_and_dimensions_agree_with_the_manifest() {
    let manifest = manifest();
    let files = manifest.as_object().unwrap();
    assert!(files.len() >= 7);
    for (name, want) in files {
        let bytes = fs::read(folder().join(name)).unwrap();
        assert_eq!(
            bytes.len() as u64,
            want["bytes"].as_u64().unwrap(),
            "{name}"
        );
        assert_eq!(
            sha256_hex(&bytes),
            want["sha256"].as_str().unwrap(),
            "{name}"
        );
        let size = dimensions(&bytes).unwrap_or_else(|| panic!("{name} has no size"));
        assert_eq!(
            (u64::from(size.0), u64::from(size.1)),
            (
                want["width"].as_u64().unwrap(),
                want["height"].as_u64().unwrap()
            ),
            "{name}"
        );
    }
}

#[test]
fn every_raster_fixture_has_a_thumbnail_and_the_vector_ones_do_not() {
    for name in [
        "pixel.png",
        "wide.png",
        "photo.jpg",
        "loop.gif",
        "still.webp",
    ] {
        let bytes = fs::read(folder().join(name)).unwrap();
        let thumb = thumbnail(&bytes, 256).unwrap_or_else(|| panic!("{name}"));
        let (w, h) = dimensions(&thumb).unwrap();
        assert!(w <= 256 && h <= 256, "{name}");
    }
    for name in ["logo.svg", "viewbox.svg"] {
        assert_eq!(
            thumbnail(&fs::read(folder().join(name)).unwrap(), 256),
            None,
            "{name}"
        );
    }
}

#[test]
fn the_canonical_sidecars_read_and_write_back_byte_for_byte() {
    for name in ["pasted", "pdf-clip", "agent", "unknown-keys"] {
        let text = fs::read_to_string(folder().join(format!("sidecars/{name}.json"))).unwrap();
        assert_eq!(Sidecar::parse(&text).unwrap().to_text(), text, "{name}");
    }
    let clip =
        Sidecar::parse(&fs::read_to_string(folder().join("sidecars/pdf-clip.json")).unwrap())
            .unwrap();
    assert_eq!(
        clip.clip(),
        Some(Clip {
            pdf: "sources/attention-is-all-you-need.pdf".into(),
            page: 3,
            rect: [72.0, 300.13, 400.0, 520.5],
        })
    );
    assert_eq!(clip.citation_key(), Some("vaswani2017attention"));
    assert_eq!(clip.tags(), ["figure", "attention"]);
    // Setting the clip from numbers writes it as the fixture has it.
    let mut again = clip.clone();
    again.set_clip(clip.clip().as_ref());
    assert_eq!(again.to_text(), clip.to_text());
}

#[test]
fn a_sidecar_from_another_tool_keeps_its_keys_when_this_one_writes() {
    let text = fs::read_to_string(folder().join("sidecars/unknown-keys.json")).unwrap();
    let mut card = Sidecar::parse(&text).unwrap();
    card.set_caption(Some("A caption."));
    let written = card.to_text();
    assert!(
        written.contains("  \"x-zotero\": {\"key\": \"ABC123\", \"n\": [1, 2]},\n"),
        "{written}"
    );
    assert!(written.contains("  \"later\": true\n}\n"), "{written}");
    assert!(
        written.contains("  \"caption\": \"A caption.\",\n  \"later\""),
        "{written}"
    );
}
