//! The check kasten-core keeps on the structure of a deck before it writes one
//! (it cannot depend on the Slides engine, so the rules are written out over
//! the JSON) and the engine's own check must agree: on every deck fixture and
//! on each small break of a rule, both accept or both refuse, and when the
//! engine refuses for a rule of the format, core names the same rule.

use std::fs;
use std::path::{Path, PathBuf};

use kasten_core::deck::{check_structure, structure_problem};
use serde_json::{Value, json};
use slides_core::Error as Engine;
use slides_core::canonical::parse;

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures")
}

/// Every deck fixture, and the dev vault's sample deck.
fn fixtures() -> Vec<(String, Value)> {
    let mut found = Vec::new();
    for folder in [root().join("decks"), root().join("dev-vault/library")] {
        for entry in fs::read_dir(folder).unwrap().flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "deck") {
                let text = fs::read_to_string(&path).unwrap();
                found.push((
                    path.file_name().unwrap().to_string_lossy().into_owned(),
                    serde_json::from_str(&text).unwrap(),
                ));
            }
        }
    }
    found.sort_by(|a, b| a.0.cmp(&b.0));
    assert!(found.len() >= 6, "the fixtures are there: {}", found.len());
    found
}

/// What the two checks make of `text`; they must agree.
fn agree(name: &str, text: &str, accepted: bool) {
    let engine = parse(text);
    let core = check_structure(text);
    match &engine {
        Ok(_) => assert!(
            core.is_ok(),
            "{name}: the engine opens it and core refuses it: {core:?}"
        ),
        Err(Engine::Invalid { message }) => {
            // The engine refuses for a rule of the format: core does too, and says the same.
            assert_eq!(
                structure_problem(text).as_deref(),
                Some(message.as_str()),
                "{name}: not the same rule"
            );
            assert!(core.is_err());
        }
        Err(other) => assert!(
            core.is_err(),
            "{name}: the engine refuses it ({other:?}) and core accepts it"
        ),
    }
    assert_eq!(engine.is_ok(), accepted, "{name}: {engine:?}");
    assert_eq!(core.is_ok(), accepted, "{name}: {core:?}");
}

/// A break of one rule: what to do to a deck, or `None` when the deck has nothing to break it with.
type Mutation = fn(&mut Value) -> Option<()>;

fn first_element(deck: &mut Value) -> Option<&mut Value> {
    deck["slides"]
        .as_array_mut()?
        .iter_mut()
        .find_map(|s| s["elements"].as_array_mut()?.first_mut())
}

/// Every break of a rule the engine holds decks to, that core must see too.
const BREAKS: &[(&str, Mutation)] = &[
    ("a slide id twice", |d| {
        let first = d["slides"][0].clone();
        d["slides"].as_array_mut()?.push(first);
        Some(())
    }),
    ("a slide without an id", |d| {
        d["slides"][0].as_object_mut()?.remove("id")?;
        Some(())
    }),
    ("a slide with an empty id", |d| {
        d["slides"][0]["id"] = json!("");
        Some(())
    }),
    ("a layout the theme does not have", |d| {
        d["slides"][0]["layout"] = json!("no-such-layout");
        Some(())
    }),
    ("an element id twice on a slide", |d| {
        let slide = d["slides"]
            .as_array_mut()?
            .iter_mut()
            .find(|s| s["elements"].as_array().is_some_and(|e| !e.is_empty()))?;
        let first = slide["elements"][0].clone();
        slide["elements"].as_array_mut()?.push(first);
        Some(())
    }),
    ("an element without an id", |d| {
        first_element(d)?.as_object_mut()?.remove("id")?;
        Some(())
    }),
    ("a section that starts at a slide that is not there", |d| {
        d["sections"] = json!([{ "title": "Lost", "startsAt": "s-gone" }]);
        Some(())
    }),
    ("a first slide that is a backup slide", |d| {
        d["slides"][0]["backup"] = json!(true);
        Some(())
    }),
    ("a theme with two layouts of a name", |d| {
        let twin = d["theme"]["layouts"][0].clone();
        d["theme"]["layouts"].as_array_mut()?.push(twin);
        Some(())
    }),
    ("no slides list", |d| {
        d.as_object_mut()?.remove("slides")?;
        Some(())
    }),
];

/// Changes that keep the rules, that core must not be stricter about.
const KEEPS: &[(&str, Mutation)] = &[
    ("a section at a slide that is there", |d| {
        let at = d["slides"][0]["id"].clone();
        d["sections"] = json!([{ "title": "Start", "startsAt": at }]);
        Some(())
    }),
    (
        "the element ids of a slide again on a slide of another id",
        |d| {
            let mut copy = d["slides"][0].clone();
            copy["id"] = json!("s-copy");
            d["slides"].as_array_mut()?.push(copy);
            Some(())
        },
    ),
    ("a later slide that is a backup slide", |d| {
        let mut copy = d["slides"][0].clone();
        copy["id"] = json!("s-backup");
        copy["backup"] = json!(true);
        d["slides"].as_array_mut()?.push(copy);
        Some(())
    }),
    ("the slides in another order", |d| {
        d["slides"]
            .as_array_mut()
            .filter(|s| s.len() > 1)?
            .reverse();
        // A backup slide cannot come first.
        d["slides"][0]["backup"] = json!(false);
        Some(())
    }),
];

#[test]
fn every_fixture_deck_is_one_both_accept() {
    for (name, deck) in fixtures() {
        agree(&name, &deck.to_string(), true);
    }
}

#[test]
fn a_break_of_a_rule_is_refused_by_both_on_every_fixture_it_can_be_made_in() {
    let mut made = 0;
    for (name, deck) in fixtures() {
        for (what, mutate) in BREAKS {
            let mut broken = deck.clone();
            if mutate(&mut broken).is_none() {
                continue;
            }
            agree(&format!("{name}: {what}"), &broken.to_string(), false);
            made += 1;
        }
    }
    // Each break can be made in most fixtures.
    assert!(made >= BREAKS.len() * 6, "{made}");
    // And every kind of break was made in at least one.
    for (what, mutate) in BREAKS {
        assert!(
            fixtures()
                .into_iter()
                .any(|(_, mut d)| mutate(&mut d).is_some()),
            "no fixture to break with: {what}"
        );
    }
    agree("not JSON", "this is not a deck", false);
    agree(
        "cut short",
        "{\"format\": \"kasten-deck\", \"slides\": [",
        false,
    );
    agree("no object", "[1, 2]", false);
}

#[test]
fn a_change_that_keeps_the_rules_is_accepted_by_both() {
    for (name, deck) in fixtures() {
        for (what, mutate) in KEEPS {
            let mut changed = deck.clone();
            if mutate(&mut changed).is_none() {
                continue;
            }
            agree(&format!("{name}: {what}"), &changed.to_string(), true);
        }
    }
}
