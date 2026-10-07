//! `slides lint`: the problems in a deck, as words or JSON, and the exit status.
//! These read the text size from an estimate (`--estimate`), so they give the same answer
//! on every machine and start no browser.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use serde_json::{Value, json};

fn slides(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_slides"))
        .args(args)
        .output()
        .expect("the slides binary runs")
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("slides-lint-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// Runs an operation on the deck and returns what it answered.
fn op(deck: &Path, name: &str, input: &Value) -> Value {
    let done = slides(&["op", deck.to_str().unwrap(), name, &input.to_string()]);
    assert!(done.status.success(), "{name}: {}", text(&done.stderr));
    serde_json::from_slice(&done.stdout).unwrap()
}

/// A deck with a finished title slide and a blank slide; returns the deck and the blank slide's id.
fn deck_with_blank_slide(dir: &Path) -> (PathBuf, String) {
    let deck = dir.join("talk.deck");
    assert!(
        slides(&["new", deck.to_str().unwrap(), "--title", "Lint me"])
            .status
            .success()
    );
    let file: Value = serde_json::from_str(&fs::read_to_string(&deck).unwrap()).unwrap();
    let cover = &file["slides"][0];
    let subtitle = cover["elements"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["placeholder"] == "subtitle")
        .unwrap();
    op(
        &deck,
        "set_text",
        &json!({ "slide": cover["id"], "id": subtitle["id"], "markdown": "A subtitle" }),
    );
    let blank = op(&deck, "add_slide", &json!({ "layout": "blank" }));
    (deck, blank["slide"].as_str().unwrap().to_owned())
}

fn put(deck: &Path, slide: &str, elements: &Value) {
    op(
        deck,
        "add_elements",
        &json!({ "slide": slide, "elements": elements }),
    );
}

const SAYS: &str = r#"{ "paragraphs": [{ "runs": [{ "t": "Hello" }] }] }"#;

#[test]
fn a_deck_with_nothing_wrong_says_so_and_exits_0() {
    let (deck, _) = deck_with_blank_slide(&temp("clean"));
    let out = slides(&["lint", deck.to_str().unwrap(), "--estimate"]);
    assert!(out.status.success(), "{}", text(&out.stderr));
    let said = text(&out.stdout);
    assert!(
        said.starts_with("Lint of talk.deck: 0 errors, 0 warnings, 0 info.\n"),
        "{said}"
    );
    assert!(said.contains("Not checked: unresolved-citation"), "{said}");
}

#[test]
fn errors_give_exit_1_with_the_element_the_rule_and_the_fix() {
    let dir = temp("errors");
    let (deck, slide) = deck_with_blank_slide(&dir);
    let says: Value = serde_json::from_str(SAYS).unwrap();
    put(
        &deck,
        &slide,
        &json!([
            { "type": "text", "id": "wide", "x": 800, "y": 100, "w": 400, "h": 60, "text": says },
            { "type": "text", "id": "cramped", "x": 100, "y": 300, "w": 150, "h": 30, "text": { "paragraphs": [{ "runs": [{ "t": "This sentence has far too many words for a box that small to hold" }] }] } },
        ]),
    );
    let path = deck.to_str().unwrap();

    let out = slides(&["lint", path, "--estimate"]);
    assert_eq!(out.status.code(), Some(1));
    let said = text(&out.stdout);
    assert!(
        said.starts_with(
            "Lint of talk.deck: 2 errors, 0 warnings, 0 info; fix the errors before you finish.\n"
        ),
        "{said}"
    );
    assert!(
        said.contains(&format!("error   {slide} wide off-slide: ")),
        "{said}"
    );
    assert!(
        said.contains(&format!("error   {slide} cramped text-overflow: ")),
        "{said}"
    );
    assert!(said.contains(" Fix: "), "{said}");
    assert!(text(&out.stderr).contains("talk.deck has 2 errors"));

    let json_out = slides(&["lint", path, "--json", "--estimate"]);
    assert_eq!(json_out.status.code(), Some(1));
    let report: Value = serde_json::from_slice(&json_out.stdout).unwrap();
    assert_eq!(
        (report["errors"].clone(), report["warnings"].clone()),
        (json!(2), json!(0))
    );
    let rules: Vec<(&str, &str, &str)> = report["issues"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| {
            (
                i["rule"].as_str().unwrap(),
                i["severity"].as_str().unwrap(),
                i["element"].as_str().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        rules,
        [
            ("text-overflow", "error", "cramped"),
            ("off-slide", "error", "wide")
        ]
    );
    assert!(report["issues"][0]["hint"].as_str().unwrap().len() > 10);
    assert_eq!(report["issues"][0]["slide"], json!(slide));

    // The same deck gives the same report, byte for byte.
    assert_eq!(
        slides(&["lint", path, "--json", "--estimate"]).stdout,
        json_out.stdout
    );
}

#[test]
fn a_bibliography_beside_the_deck_decides_which_citation_keys_are_wrong() {
    let dir = temp("citations");
    let (deck, slide) = deck_with_blank_slide(&dir);
    put(
        &deck,
        &slide,
        &json!([{ "type": "citation", "id": "cite", "x": 64, "y": 470, "w": 500, "h": 30, "keys": ["vaswani2017attention", "vaswani2017"] }]),
    );
    let path = deck.to_str().unwrap();

    let without = slides(&["lint", path, "--estimate"]);
    assert!(
        without.status.success(),
        "with no bibliography the keys are not judged"
    );
    assert!(text(&without.stdout).contains("Not checked: unresolved-citation"));

    fs::write(
        dir.join("refs.bib"),
        "@article{vaswani2017attention, title={Attention}}\n",
    )
    .unwrap();
    let with = slides(&["lint", path, "--estimate"]);
    assert_eq!(with.status.code(), Some(1));
    let said = text(&with.stdout);
    assert!(said.contains("cite unresolved-citation"), "{said}");
    assert!(
        said.contains("vaswani2017attention"),
        "the closest key is offered: {said}"
    );
    assert!(!said.contains("Not checked: unresolved-citation"), "{said}");
}

#[test]
fn a_missing_deck_is_an_error_and_no_deck_is_a_usage_error() {
    let out = slides(&["lint"]);
    assert_eq!(out.status.code(), Some(2));
    assert!(text(&out.stderr).contains("missing a deck file"));
    let out = slides(&["lint", "/no/such/talk.deck"]);
    assert_eq!(out.status.code(), Some(1));
    assert!(text(&out.stderr).contains("talk.deck"));
}
