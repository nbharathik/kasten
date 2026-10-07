//! Numbers and strings that mean nothing, or far too much, put one at a time
//! anywhere in a deck, must not stop an export or leave a file that does not
//! hold together. Decks come from people, agents and imports, so the exporter
//! does not trust them.

mod common;

use std::fs;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::PathBuf;

use serde_json::{Value, json};
use slides_core::Deck;
use slides_pptx::{Options, export};

use common::inspect;
use common::{Files, decks, variety};

const NUMBERS: [f64; 9] = [
    0.0,
    -1.0,
    -1e9,
    1e9,
    1e300,
    1e-9,
    0.5,
    4_294_967_296.0,
    -0.0,
];

const STRINGS: [&str; 8] = [
    "",
    " ",
    "\u{1}\u{0}x",
    "<&>\"'",
    "../../etc/passwd",
    "javascript:alert(1)",
    "🦀 ‹#› \u{2028}",
    "a very long string, repeated. ",
];

/// A small deterministic generator, so a failure can be run again.
struct Dice(u64);

impl Dice {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next() % n.max(1) as u64) as usize
    }
}

fn escaped(key: &str) -> String {
    key.replace('~', "~0").replace('/', "~1")
}

/// The JSON pointers of every number and every string in a value.
fn leaves(value: &Value, at: &str, numbers: &mut Vec<String>, strings: &mut Vec<String>) {
    match value {
        Value::Number(_) => numbers.push(at.to_owned()),
        Value::String(_) => strings.push(at.to_owned()),
        Value::Array(items) => {
            for (i, item) in items.iter().enumerate() {
                leaves(item, &format!("{at}/{i}"), numbers, strings);
            }
        }
        Value::Object(members) => {
            for (key, member) in members {
                leaves(member, &format!("{at}/{}", escaped(key)), numbers, strings);
            }
        }
        _ => {}
    }
}

/// Whether a leaf is one the format itself fixes, which a person cannot change.
fn fixed(pointer: &str) -> bool {
    pointer == "/format" || pointer == "/formatVersion" || pointer.starts_with("/size")
}

/// How many numbers and how many strings to change in each deck. `HOSTILE_TRIES` asks for more.
fn tries() -> usize {
    std::env::var("HOSTILE_TRIES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30)
}

/// A folder to keep the files in, for checking them against the schemas by hand: `HOSTILE_KEEP`.
fn keep() -> Option<PathBuf> {
    std::env::var_os("HOSTILE_KEEP").map(PathBuf::from)
}

fn hostile(name: &str, deck: &Deck, files: &Files, seed: u64) -> usize {
    let tries = tries();
    let json = serde_json::to_value(deck).unwrap_or_else(|e| panic!("{name}: {e}"));
    let (mut numbers, mut strings) = (Vec::new(), Vec::new());
    leaves(&json, "", &mut numbers, &mut strings);
    // `HOSTILE_ONLY` narrows the changes to the leaves whose pointer holds that text.
    let only = std::env::var("HOSTILE_ONLY").unwrap_or_default();
    numbers.retain(|p| !fixed(p) && p.contains(&only));
    strings.retain(|p| !fixed(p) && p.contains(&only));
    if numbers.is_empty() || strings.is_empty() {
        return 0;
    }
    let mut dice = Dice(seed);
    let mut exported = 0;
    for n in 0..tries * 2 {
        let (pointer, value) = if n % 2 == 0 {
            let at = &numbers[dice.below(numbers.len())];
            (at, json!(NUMBERS[dice.below(NUMBERS.len())]))
        } else {
            let at = &strings[dice.below(strings.len())];
            let text = STRINGS[dice.below(STRINGS.len())];
            let long = if text.starts_with("a very long") {
                text.repeat(400)
            } else {
                text.to_owned()
            };
            (at, json!(long))
        };
        let mut changed = json.clone();
        if let Some(slot) = changed.pointer_mut(pointer) {
            *slot = value.clone();
        }
        // The core refuses decks that break its own rules; those are not the exporter's to handle.
        let Ok(mutated) = slides_core::canonical::from_value(changed) else {
            continue;
        };
        let result = catch_unwind(AssertUnwindSafe(|| {
            export(&mutated, files, &Options::default())
        }));
        let out = match result {
            Err(_) => panic!("{name}: the export panicked with {value} at {pointer}"),
            Ok(Err(e)) => panic!("{name}: the export failed with {value} at {pointer}: {e}"),
            Ok(Ok(out)) => out,
        };
        let package = inspect::open(&out.bytes);
        let problems = inspect::problems(&package);
        assert!(
            problems.is_empty(),
            "{name}: {value} at {pointer} leaves a file with problems: {problems:#?}"
        );
        if let Some(dir) = keep() {
            let stem = format!("{}-{n}", name.replace(' ', "-"));
            fs::create_dir_all(&dir).unwrap_or_else(|e| panic!("{}: {e}", dir.display()));
            fs::write(dir.join(format!("{stem}.pptx")), &out.bytes)
                .unwrap_or_else(|e| panic!("{e}"));
            fs::write(
                dir.join(format!("{stem}.txt")),
                format!("{pointer} <- {value}"),
            )
            .unwrap_or_else(|e| panic!("{e}"));
        }
        exported += 1;
    }
    exported
}

#[test]
fn a_deck_with_hostile_numbers_and_strings_still_exports_into_a_sound_file() {
    let mut total = 0;
    let (deck, files) = decks::every_element("Light");
    total += hostile("every element", &deck, &files, 0x5eed_0001);
    let (deck, files) = variety::text_heavy();
    total += hostile("text heavy", &deck, &files, 0x5eed_0002);
    let (deck, files) = variety::turned();
    total += hostile("turned", &deck, &files, 0x5eed_0003);
    let (deck, files) = decks::demo();
    total += hostile("demo", &deck, &files, 0x5eed_0004);
    if std::env::var_os("HOSTILE_ONLY").is_none() {
        assert!(
            total > 100,
            "only {total} of the changed decks were accepted by the core"
        );
    }
}
