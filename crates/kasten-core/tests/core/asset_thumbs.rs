//! Thumbnails: WebP at 256 and 1024 pixels, made when first asked for and
//! kept in the cache, which belongs to this computer.

use crate::asset_support::{fixture, known, solid_png};
use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::history::Actor;
use kasten_core::{Error, Kasten};
use serde_json::Value;
use slides_assets::probe;

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

fn size_of(webp: &[u8]) -> (u32, u32) {
    assert_eq!(&webp[..4], b"RIFF");
    assert_eq!(&webp[8..12], b"WEBP");
    probe::dimensions(webp).expect("a WebP with a size")
}

#[test]
fn a_thumbnail_is_a_webp_that_fits_the_size_and_keeps_the_shape() {
    let (_t, k) = open();
    let path = keep(&k, "wide.png", "wide.png");
    let small = k.asset_thumb(&path, 256).unwrap().unwrap();
    assert_eq!(size_of(&small), (256, 64));
    let photo = keep(&k, "photo.jpg", "photo.jpg");
    let medium = k.asset_thumb(&photo, 1024).unwrap().unwrap();
    // Never enlarged: the picture is 320 by 200.
    assert_eq!(size_of(&medium), (320, 200));
}

#[test]
fn a_thumbnail_is_cached_by_hash_and_size_outside_history() {
    let (t, k) = open();
    let path = keep(&k, "wide.png", "wide.png");
    let first = k.asset_thumb(&path, 256).unwrap().unwrap();
    let cached = t.vault.root().join(format!(
        ".kasten/cache/thumbs/{}-256.webp",
        known("wide.png").sha256
    ));
    assert_eq!(fs::read(&cached).unwrap(), first);
    // Asked again, the cache answers: a changed cache file is what comes back.
    fs::write(&cached, b"RIFFcached").unwrap();
    assert_eq!(k.asset_thumb(&path, 256).unwrap().unwrap(), b"RIFFcached");
    // Another size is another file.
    k.asset_thumb(&path, 1024).unwrap().unwrap();
    assert!(
        t.vault
            .root()
            .join(format!(
                ".kasten/cache/thumbs/{}-1024.webp",
                known("wide.png").sha256
            ))
            .is_file()
    );
    assert!(
        k.dirty().unwrap().iter().all(|p| !p.contains("thumbs")),
        "the cache stays out of history: {:?}",
        k.dirty()
    );
}

#[test]
fn a_thumbnail_has_the_same_pixels_whatever_the_file_is_called() {
    let (_t, k) = open();
    let a = keep(&k, "one.png", "wide.png");
    let b = k
        .save_asset(&Actor::Human, "two.png", &fixture("wide.png"), NOW)
        .unwrap();
    assert_eq!(a, b);
    assert_eq!(
        k.asset_thumb(&a, 256).unwrap(),
        k.asset_thumb(&b, 256).unwrap()
    );
}

#[test]
fn only_the_two_sizes_are_made() {
    let (_t, k) = open();
    let path = keep(&k, "wide.png", "wide.png");
    for size in [0, 100, 255, 257, 512, 2048] {
        assert!(
            matches!(k.asset_thumb(&path, size), Err(Error::Invalid(_))),
            "{size}"
        );
    }
}

#[test]
fn a_picture_with_no_raster_form_has_no_thumbnail() {
    let (_t, k) = open();
    let svg = keep(&k, "logo.svg", "logo.svg");
    assert_eq!(k.asset_thumb(&svg, 256).unwrap(), None);
    let fake = k
        .save_asset(
            &Actor::Human,
            "fake.png",
            b"\x89PNG\r\n\x1a\nnot really",
            NOW,
        )
        .unwrap();
    assert_eq!(k.asset_thumb(&fake, 256).unwrap(), None);
}

#[test]
fn a_thumbnail_is_asked_for_by_the_path_of_a_picture_in_assets() {
    let (_t, k) = open();
    for path in [
        "assets/missing.png",
        "notes/welcome.md",
        "assets/../inbox/x.png",
        "sources/zettelkasten-primer.pdf",
        "",
    ] {
        assert!(k.asset_thumb(path, 256).is_err(), "{path}");
    }
}

#[test]
fn a_transparent_picture_keeps_its_transparency() {
    let (_t, k) = open();
    let path = keep(&k, "still.webp", "still.webp");
    let thumb = k.asset_thumb(&path, 256).unwrap().unwrap();
    assert_eq!(size_of(&thumb), (48, 32));
    // Lossless WebP with alpha is a VP8L stream whose header says so.
    assert_eq!(&thumb[12..16], b"VP8L");
    assert_eq!(thumb[24] >> 4 & 1, 1, "the alpha bit is set");
}

/// What the cache holds under a hash, if anything.
fn cached(t: &common::TempVault, hash: &str) -> Option<Vec<u8>> {
    fs::read(
        t.vault
            .root()
            .join(format!(".kasten/cache/thumbs/{hash}-256.webp")),
    )
    .ok()
}

/// Makes the sidecar of the picture at `path` say `hash`, the rest as it was.
fn claim_hash(t: &common::TempVault, path: &str, hash: &str) {
    let card = t
        .vault
        .root()
        .join(slides_assets::sidecar_path(path).unwrap());
    let mut doc: Value = serde_json::from_str(&fs::read_to_string(&card).unwrap()).unwrap();
    doc["sha256"] = Value::from(hash);
    fs::write(card, serde_json::to_string_pretty(&doc).unwrap()).unwrap();
}

/// Two pictures of one length and different pixels, kept, with their thumbnails as they should be.
struct Pair {
    red: Vec<u8>,
    blue: Vec<u8>,
    a: String,
    b: String,
    want_a: Vec<u8>,
    want_b: Vec<u8>,
}

fn pair(k: &Kasten) -> Pair {
    let (red, blue) = (
        solid_png(40, 40, [255, 0, 0]),
        solid_png(40, 40, [0, 0, 255]),
    );
    assert_eq!(
        red.len(),
        blue.len(),
        "one length: a sidecar's size fits both"
    );
    let a = k.save_asset(&Actor::Human, "red.png", &red, NOW).unwrap();
    let b = k.save_asset(&Actor::Human, "blue.png", &blue, NOW).unwrap();
    let want_a = slides_assets::thumbnail(&red, 256).expect("red has a thumbnail");
    let want_b = slides_assets::thumbnail(&blue, 256).expect("blue has a thumbnail");
    assert_ne!(want_a, want_b);
    Pair {
        red,
        blue,
        a,
        b,
        want_a,
        want_b,
    }
}

#[test]
fn sidecars_that_swap_their_hashes_do_not_swap_the_thumbnails() {
    let (t, k) = open();
    let p = pair(&k);
    // Both thumbnails are made and cached under the hash of their own bytes.
    assert_eq!(k.asset_thumb(&p.a, 256).unwrap().unwrap(), p.want_a);
    assert_eq!(k.asset_thumb(&p.b, 256).unwrap().unwrap(), p.want_b);
    // Then each sidecar names the other picture's hash.
    let (hash_a, hash_b) = (
        slides_assets::sha256_hex(&p.red),
        slides_assets::sha256_hex(&p.blue),
    );
    claim_hash(&t, &p.a, &hash_b);
    claim_hash(&t, &p.b, &hash_a);
    for _ in 0..2 {
        assert_eq!(k.asset_thumb(&p.a, 256).unwrap().unwrap(), p.want_a);
        assert_eq!(k.asset_thumb(&p.b, 256).unwrap().unwrap(), p.want_b);
    }
}

#[test]
fn a_sidecar_that_lies_puts_no_thumbnail_where_another_picture_will_look() {
    let (t, k) = open();
    let p = pair(&k);
    let hash_a = slides_assets::sha256_hex(&p.red);
    // Blue's sidecar says it is red; nothing has been cached yet.
    claim_hash(&t, &p.b, &hash_a);
    assert_eq!(k.asset_thumb(&p.b, 256).unwrap().unwrap(), p.want_b);
    assert_eq!(k.asset_thumb(&p.a, 256).unwrap().unwrap(), p.want_a);
    // Each thumbnail is in the cache only under the hash of the bytes it was made from.
    assert_eq!(cached(&t, &hash_a), Some(p.want_a.clone()));
    assert_eq!(
        cached(&t, &slides_assets::sha256_hex(&p.blue)),
        Some(p.want_b.clone())
    );
}

#[test]
fn a_picture_replaced_outside_kasten_shows_its_new_thumbnail_though_its_size_is_the_same() {
    let (t, k) = open();
    let p = pair(&k);
    assert_eq!(k.asset_thumb(&p.a, 256).unwrap().unwrap(), p.want_a);
    // The file becomes the other picture; its sidecar still says what it said, and the size still fits.
    fs::write(t.vault.root().join(&p.a), &p.blue).unwrap();
    assert_eq!(k.asset_thumb(&p.a, 256).unwrap().unwrap(), p.want_b);
}
