//! The limits on what an agent takes out of decks and adds to `assets/`, met
//! through the deck tools: slides taken out are added up over ten minutes
//! (a slide left with nothing on it counts, and so does every slide a batch
//! that replaces the deck puts something else in place of), and a PowerPoint
//! file comes in as one commit, whole or not at all.

mod common;

use std::fs;
use std::path::Path;

use common::{TempDir, vault};
use kasten_core::agent::Session;
use kasten_core::{Instant, Kasten};
use kasten_mcp::tools::call;
use serde_json::{Value, json};

const OUTLINE: &str = "# Tool use

## What a tool is
A function the model may ask the host to run.

## The loop
- The model asks
- The host runs it

## Why it matters
Tools turn a talker into a doer.

## Where it fails
Wrong arguments. Silent errors.

## Guardrails
Limits and review.

## Summary
Ask, run, return.
";

fn open() -> (TempDir, Kasten, Session) {
    let v = vault();
    let k = Kasten::open(&v.0).unwrap();
    (v, k, Session::start("kasten-chat", Instant::now()))
}

/// Makes the deck of `OUTLINE` (a cover and six slides); returns its path and its slides' ids.
fn deck_of_seven(k: &Kasten, s: &Session) -> (String, Vec<String>) {
    let made = call(k, s, "create_deck", json!({ "outline": OUTLINE })).unwrap();
    assert_eq!(made["status"], json!("done"), "{made}");
    let path = made["result"]["deck"].as_str().unwrap().to_owned();
    let got = call(k, s, "get_deck", json!({ "deck": path })).unwrap();
    let ids = got["slides"]
        .as_array()
        .unwrap()
        .iter()
        .map(|slide| slide["id"].as_str().unwrap().to_owned())
        .collect();
    (path, ids)
}

/// The ids of the elements on a slide.
fn elements_of(k: &Kasten, s: &Session, deck: &str, slide: &str) -> Vec<String> {
    let got = call(k, s, "get_slide", json!({ "deck": deck, "slide": slide })).unwrap();
    got["slide"]["elements"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["id"].as_str().unwrap().to_owned())
        .collect()
}

fn status(answer: &Value) -> &str {
    answer["status"].as_str().unwrap_or_default()
}

fn reason(answer: &Value) -> &str {
    answer["reason"].as_str().unwrap_or_default()
}

#[test]
fn slides_removed_in_several_calls_are_added_up() {
    let (_v, k, s) = open();
    let (path, ids) = deck_of_seven(&k, &s);
    let three = call(
        &k,
        &s,
        "delete_slides",
        json!({ "deck": path, "ids": &ids[4..7] }),
    )
    .unwrap();
    assert_eq!(status(&three), "done", "{three}");
    // One more is a fourth in a few minutes.
    let fourth = call(
        &k,
        &s,
        "delete_slides",
        json!({ "deck": path, "ids": &ids[3..4] }),
    )
    .unwrap();
    assert_eq!(status(&fourth), "pending_review", "{fourth}");
    assert!(
        reason(&fourth).contains("already took 3 slides out of decks in the last 10 minutes")
            && reason(&fourth).contains("would make 4"),
        "{fourth}"
    );
    // Another connection has its own count.
    let other = Session::start("another-chat", Instant::now());
    let done = call(
        &k,
        &other,
        "delete_slides",
        json!({ "deck": path, "ids": &ids[3..4] }),
    )
    .unwrap();
    assert_eq!(status(&done), "done", "{done}");
}

#[test]
fn slides_left_with_nothing_on_them_count_as_taken_out() {
    let (_v, k, s) = open();
    let (path, ids) = deck_of_seven(&k, &s);
    // A batch that deletes every element of four slides: the slides are still there, and empty.
    let operations: Vec<Value> = ids[1..5]
        .iter()
        .map(|slide| {
            json!({ "op": "delete_elements", "input": {
                "slide": slide, "ids": elements_of(&k, &s, &path, slide) } })
        })
        .collect();
    let batch = call(
        &k,
        &s,
        "update_elements",
        json!({ "deck": path, "operations": operations }),
    )
    .unwrap();
    assert_eq!(status(&batch), "pending_review", "{batch}");
    assert_eq!(
        reason(&batch),
        "Removes or empties 4 slides in one change (the limit is 3)"
    );
    // Three at a time, in calls of their own, are added up all the same.
    for slide in &ids[1..4] {
        let ids_here = elements_of(&k, &s, &path, slide);
        let done = call(
            &k,
            &s,
            "delete_elements",
            json!({ "deck": path, "slide": slide, "ids": ids_here }),
        )
        .unwrap();
        assert_eq!(status(&done), "done", "{done}");
    }
    let ids_here = elements_of(&k, &s, &path, &ids[4]);
    let fourth = call(
        &k,
        &s,
        "delete_elements",
        json!({ "deck": path, "slide": ids[4], "ids": ids_here }),
    )
    .unwrap();
    assert_eq!(status(&fourth), "pending_review", "{fourth}");
    assert!(reason(&fourth).contains("would make 4"), "{fourth}");
}

#[test]
fn a_batch_that_puts_another_deck_in_place_of_this_one_waits_and_is_recorded_as_that() {
    let (v, k, s) = open();
    let (path, ids) = deck_of_seven(&k, &s);
    k.trust_session(&s.id, Instant::now().millis + 3_600_000)
        .unwrap();
    // Every slide keeps its id and gets other notes: nothing is removed, everything is replaced.
    let mut deck: Value =
        serde_json::from_str(&fs::read_to_string(v.0.join(&path)).unwrap()).unwrap();
    for slide in deck["slides"].as_array_mut().unwrap() {
        slide["notes"] = json!("Rewritten.");
    }
    let batch = call(
        &k,
        &s,
        "update_elements",
        json!({ "deck": path, "operations": [
            { "op": "set_notes", "input": { "slide": ids[0], "notes": "First." } },
            { "op": "replace_deck", "input": { "deck": deck } }] }),
    )
    .unwrap();
    assert_eq!(status(&batch), "pending_review", "{batch}");
    assert_eq!(
        reason(&batch),
        "Replaces 7 slides in one change (the limit is 3)"
    );
    k.accept_proposal(batch["proposal"].as_str().unwrap(), "me", Instant::now())
        .unwrap();
    let last = &k.log(Some(&path), 1).unwrap()[0];
    assert_eq!(last.op.as_deref(), Some("replace_deck"));
    assert_eq!(last.approved_by.as_deref(), Some("me"));
    // The same words on a batch that only changes notes are an ordinary edit.
    let notes: Vec<Value> = ids
        .iter()
        .map(|slide| json!({ "op": "set_notes", "input": { "slide": slide, "notes": "Again." } }))
        .collect();
    let plain = call(
        &k,
        &s,
        "update_elements",
        json!({ "deck": path, "operations": notes }),
    )
    .unwrap();
    assert_eq!(status(&plain), "done", "{plain}");
}

/// A PowerPoint file with two pictures, put in the vault under the name a person might give it.
fn put_pptx(v: &TempDir) -> &'static str {
    let name = "assets/Q3 [draft].pptx";
    let from =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/decks/pptx/python-pptx.pptx");
    fs::create_dir_all(v.0.join("assets")).unwrap();
    fs::copy(from, v.0.join(name)).unwrap();
    name
}

#[test]
fn a_powerpoint_file_comes_in_as_one_commit_under_a_title_made_from_its_name() {
    let (v, k, s) = open();
    let name = put_pptx(&v);
    let done = call(&k, &s, "import_pptx", json!({ "path": name })).unwrap();
    assert_eq!(status(&done), "done", "{done}");
    let deck = done["result"]["deck"].as_str().unwrap().to_owned();
    assert_eq!(deck, "library/q3-draft.deck");
    assert_eq!(
        k.deck(&deck)
            .unwrap()
            .text
            .matches("\"title\": \"Q3 draft\"")
            .count(),
        1
    );
    assert_eq!(done["result"]["pictures"], json!(2), "{done}");

    let last = &k.log(None, 1).unwrap()[0];
    assert_eq!(last.op.as_deref(), Some("import_pptx"));
    assert_eq!(last.summary, "deck: import Q3 draft");
    assert_eq!(last.author, "agent:kasten-chat");
    let files: Vec<String> = k
        .commit_changes(&last.id)
        .unwrap()
        .into_iter()
        .map(|c| c.path)
        .collect();
    // The deck, two pictures and a note about each: one commit, so one undo.
    assert_eq!(files.len(), 5, "{files:?}");
    assert!(files.contains(&deck));
    assert_eq!(
        files
            .iter()
            .filter(|p| p.starts_with("assets/.meta/"))
            .count(),
        2
    );
    let undone = k.undo_session(&s.id, Instant::now()).unwrap();
    assert_eq!(undone.conflict, None);
    assert!(k.deck(&deck).is_err());
    assert!(files.iter().all(|p| !v.0.join(p).exists()), "{files:?}");
}

#[test]
fn a_powerpoint_file_over_a_limit_on_pictures_is_refused_whole() {
    let (v, k, s) = open();
    let name = put_pptx(&v);
    let mut config = k.config();
    config.guardrails.max_assets_per_session_10min = 1;
    k.set_config(config).unwrap();
    let decks = k.decks().unwrap().len();
    let err = call(&k, &s, "import_pptx", json!({ "path": name })).unwrap_err();
    assert!(
        err.contains("would have added 2 pictures") && err.contains("the limit is 1"),
        "{err}"
    );
    assert_eq!(k.decks().unwrap().len(), decks, "no deck");
    assert!(
        k.assets()
            .unwrap()
            .iter()
            .all(|a| a.source.as_deref() != Some("pptx-import")),
        "no picture"
    );
    assert!(
        k.log(None, 5).unwrap().iter().all(|c| !c.agent),
        "no commit of the agent's"
    );
    // A title that cannot be used is found before a picture is kept.
    let mut config = k.config();
    config.guardrails.max_assets_per_session_10min = 30;
    k.set_config(config).unwrap();
    let bad = call(
        &k,
        &s,
        "import_pptx",
        json!({ "path": name, "title": "Q3 [draft]" }),
    )
    .unwrap_err();
    assert!(bad.contains("no [ ] or | characters"), "{bad}");
    assert!(
        k.assets()
            .unwrap()
            .iter()
            .all(|a| a.source.as_deref() != Some("pptx-import")),
        "no picture"
    );
}

#[test]
fn a_picture_over_the_size_an_agent_may_add_is_refused() {
    let (v, k, s) = open();
    let mut config = k.config();
    config.guardrails.max_asset_bytes = 1000;
    k.set_config(config).unwrap();
    let png =
        fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/assets/wide.png"))
            .unwrap();
    assert!(png.len() > 1000, "the fixture is bigger than the cap");
    let err = call(
        &k,
        &s,
        "add_asset",
        json!({ "name": "wide.png", "base64": slides_core::agent::base64_encode(&png) }),
    )
    .unwrap_err();
    assert!(err.contains("an agent may add at most 1000 bytes"), "{err}");
    assert!(!v.0.join("assets/wide.png").exists());
}
