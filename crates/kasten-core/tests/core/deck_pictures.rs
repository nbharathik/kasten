//! Pictures an agent adds to `assets/` are held to limits: a size for one
//! picture, and how many pictures and bytes of them a session may add in ten
//! minutes. (`deck_import` has the deck that comes with pictures.)

use std::fs;
use std::path::Path;

use crate::common::{self, NOW, dev_vault};

use kasten_core::agent::Session;
use kasten_core::assets::NewAsset;
use kasten_core::history::Actor;
use kasten_core::{Instant, Kasten};

pub fn open() -> (common::TempVault, Kasten, Session) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k, Session::start("claude-code", NOW))
}

pub fn minutes(n: u64) -> Instant {
    Instant {
        millis: NOW.millis + n * 60_000,
    }
}

/// The limits on pictures an agent may add.
pub fn limits(k: &Kasten, each: u64, count: u32, bytes: u64) {
    let mut config = k.config();
    config.guardrails.max_asset_bytes = each;
    config.guardrails.max_assets_per_session_10min = count;
    config.guardrails.max_asset_bytes_per_session_10min = bytes;
    k.set_config(config).unwrap();
}

/// Bytes that are the same only as themselves.
pub fn picture(seed: u8, len: usize) -> Vec<u8> {
    vec![seed; len]
}

/// Every file under `assets/`, by path.
pub fn kept(root: &Path) -> Vec<String> {
    fn walk(dir: &Path, base: &Path, out: &mut Vec<String>) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, base, out);
            } else {
                out.push(
                    path.strip_prefix(base)
                        .unwrap()
                        .to_string_lossy()
                        .into_owned(),
                );
            }
        }
    }
    let mut out = Vec::new();
    walk(&root.join("assets"), root, &mut out);
    out.sort();
    out
}

pub fn add(
    k: &Kasten,
    s: &Session,
    name: &str,
    bytes: &[u8],
    at: Instant,
) -> kasten_core::Result<String> {
    k.add_asset(&s.actor(), name, bytes, &NewAsset::default(), at)
        .map(|added| added.path)
}

#[test]
fn a_picture_over_the_cap_is_refused_for_an_agent_and_not_for_a_person() {
    let (t, k, s) = open();
    limits(&k, 2048, 30, 50 << 20);
    let before = kept(t.vault.root());
    let err = add(&k, &s, "big.png", &picture(1, 3000), NOW)
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("“big.png” is 2.9 KB") && err.contains("at most 2.0 KB"),
        "{err}"
    );
    assert_eq!(kept(t.vault.root()), before, "nothing was written");
    // The limit is on what an agent adds; a person's pictures are their own.
    let by_hand = k
        .add_asset(
            &Actor::Human,
            "big.png",
            &picture(1, 3000),
            &NewAsset::default(),
            NOW,
        )
        .unwrap();
    assert!(by_hand.created);
    // And a picture within the cap is kept for the agent.
    assert_eq!(
        add(&k, &s, "small.png", &picture(2, 2048), NOW).unwrap(),
        "assets/small.png"
    );
}

#[test]
fn pictures_are_counted_over_ten_minutes_and_the_same_bytes_are_not_added_twice() {
    let (t, k, s) = open();
    limits(&k, 1 << 20, 2, 50 << 20);
    add(&k, &s, "one.png", &picture(1, 100), NOW).unwrap();
    add(&k, &s, "two.png", &picture(2, 100), NOW).unwrap();
    let err = add(&k, &s, "three.png", &picture(3, 100), minutes(1))
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("would have added 3 pictures in the last 10 minutes")
            && err.contains("the limit is 2"),
        "{err}"
    );
    assert!(!kept(t.vault.root()).iter().any(|p| p.contains("three")));
    // Bytes that are already there are the same asset: nothing is written, so nothing is counted.
    assert_eq!(
        add(&k, &s, "again.png", &picture(1, 100), minutes(1)).unwrap(),
        "assets/one.png"
    );
    // Another session has its own count, and so has a person.
    let other = Session::start("another-agent", minutes(1));
    add(&k, &other, "three.png", &picture(3, 100), minutes(1)).unwrap();
    k.add_asset(
        &Actor::Human,
        "four.png",
        &picture(4, 100),
        &NewAsset::default(),
        minutes(1),
    )
    .unwrap();
    // Eleven minutes after the first two, the window has moved on.
    assert_eq!(
        add(&k, &s, "five.png", &picture(5, 100), minutes(11)).unwrap(),
        "assets/five.png"
    );
}

#[test]
fn bytes_are_counted_too() {
    let (_t, k, s) = open();
    limits(&k, 1 << 20, 30, 4096);
    for n in 1..=4u8 {
        add(&k, &s, &format!("p{n}.png"), &picture(n, 1024), NOW).unwrap();
    }
    let err = add(&k, &s, "p5.png", &picture(5, 1024), NOW)
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("would have added 5.0 KB of pictures in the last 10 minutes")
            && err.contains("the limit is 4.0 KB"),
        "{err}"
    );
    assert!(
        add(&k, &s, "p5.png", &picture(5, 1024), minutes(11)).is_ok(),
        "ten minutes on, the bytes have left the window"
    );
}
