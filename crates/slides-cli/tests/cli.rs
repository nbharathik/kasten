use std::fs;
use std::process::{Command, Output};

fn slides(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_slides"))
        .args(args)
        .output()
        .expect("the slides binary runs")
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

fn temp(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("slides-cli-{}-{name}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn prints_its_version() {
    let out = slides(&["--version"]);
    assert!(out.status.success());
    assert_eq!(
        text(&out.stdout).trim(),
        format!("slides {}", env!("CARGO_PKG_VERSION"))
    );
}

#[test]
fn an_unknown_command_is_a_usage_error() {
    let out = slides(&["nope"]);
    assert_eq!(out.status.code(), Some(2));
}

#[test]
fn makes_a_deck_edits_it_and_reads_it_back() {
    let dir = temp("edit");
    let deck = dir.join("talk.deck");
    let deck = deck.to_str().unwrap();
    let made = slides(&["new", deck, "--title", "My talk", "--theme", "Dark"]);
    assert!(made.status.success(), "{}", text(&made.stderr));
    assert!(
        !slides(&["new", deck]).status.success(),
        "it does not overwrite a deck"
    );

    let added = slides(&[
        "op",
        deck,
        "add_slide",
        r##"{"layout":"title-body","content":{"title":"Results","body":"- one\n- two"}}"##,
    ]);
    assert!(added.status.success(), "{}", text(&added.stderr));
    assert!(text(&added.stdout).contains("\"slide\""));

    let info = text(&slides(&["info", deck]).stdout);
    assert!(info.contains("My talk (Dark theme, 2 slides)"), "{info}");
    assert!(info.contains("Results"), "{info}");
    let outline = text(&slides(&["outline", deck]).stdout);
    assert!(
        outline.contains("## Results") && outline.contains("- one"),
        "{outline}"
    );
    assert!(slides(&["validate", deck]).status.success());
    let before = fs::read_to_string(deck).unwrap();
    assert!(slides(&["fmt", deck]).status.success());
    assert_eq!(
        fs::read_to_string(deck).unwrap(),
        before,
        "a saved deck is already canonical"
    );
}

#[test]
fn fmt_and_an_unrelated_operation_keep_the_fields_a_newer_build_wrote_in_any_object() {
    let source = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/decks/unknown-fields-deep.deck");
    let dir = temp("unknown");
    let deck = dir.join("newer.deck");
    fs::copy(&source, &deck).unwrap();
    let deck = deck.to_str().unwrap();
    let original = fs::read_to_string(deck).unwrap();
    let planted = original.matches("\"future").count();
    assert!(
        planted > 20,
        "the fixture has a field nobody knows in every kind of object"
    );

    assert!(slides(&["validate", deck]).status.success());
    assert!(slides(&["fmt", deck]).status.success());
    assert_eq!(
        fs::read_to_string(deck).unwrap(),
        original,
        "fmt keeps every field, byte for byte"
    );

    let out = slides(&["op", deck, "set_title", r#"{"title":"Retitled"}"#]);
    assert!(out.status.success(), "{}", text(&out.stderr));
    let after = fs::read_to_string(deck).unwrap();
    assert_eq!(after.matches("\"future").count(), planted);
    assert_eq!(
        after.replace("Retitled", "Unknown fields deep in the objects"),
        original,
        "and the operation changed the title and nothing else"
    );
}

#[test]
fn a_refused_operation_reports_why_and_leaves_the_file_alone() {
    let dir = temp("refuse");
    let deck = dir.join("a.deck");
    let deck = deck.to_str().unwrap();
    assert!(slides(&["new", deck]).status.success());
    let before = fs::read_to_string(deck).unwrap();
    let out = slides(&["op", deck, "add_slide", r#"{"layout":"nope"}"#]);
    assert_eq!(out.status.code(), Some(1));
    assert!(
        text(&out.stderr).contains("title-body"),
        "{}",
        text(&out.stderr)
    );
    assert_eq!(fs::read_to_string(deck).unwrap(), before);
}

#[test]
fn lists_and_describes_the_operations() {
    let list = text(&slides(&["ops"]).stdout);
    assert!(list.contains("add_slide") && list.contains("transform_elements"));
    let one = text(&slides(&["ops", "set_notes", "--json"]).stdout);
    assert!(
        one.contains("\"input\"") && one.contains("\"notes\""),
        "{one}"
    );
    assert!(!slides(&["ops", "nope"]).status.success());
    assert!(text(&slides(&["schema"]).stdout).contains("\"title\""));
}
