//! The promise of the format is that a deck written by a newer build survives an
//! older one: every object keeps the fields it does not know. That holds only
//! while every struct of the model has its own `extra` (the one thing that does
//! not is `Base`, which is flattened into every element and so is kept by the
//! element's own). This reads the files of the model and fails when a struct is
//! added that would drop what it does not know.

use std::fs;
use std::path::PathBuf;

/// The structs that are flattened into others, which keep what neither of them knows.
const FLATTENED: &[&str] = &["Base"];

/// The structs a file of the model defines, each with the text between its braces.
fn structs(text: &str) -> Vec<(String, String)> {
    const START: &str = "\n    pub struct ";
    let mut found = Vec::new();
    let mut rest = text;
    while let Some(at) = rest.find(START) {
        let after = &rest[at + START.len()..];
        let name: String = after
            .chars()
            .take_while(|c| c.is_alphanumeric() || *c == '_')
            .collect();
        let Some(open) = after.find(" {\n") else {
            break;
        };
        let Some(length) = after[open..].find("\n    }\n") else {
            break;
        };
        found.push((name, after[open..open + length].to_owned()));
        rest = &after[open + length..];
    }
    found
}

#[test]
fn every_struct_of_the_model_keeps_the_fields_it_does_not_know() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/model");
    let (mut seen, mut without) = (0, Vec::new());
    for entry in fs::read_dir(&dir).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_none_or(|ext| ext != "rs") {
            continue;
        }
        let file = path.file_name().unwrap().to_string_lossy().into_owned();
        for (name, body) in structs(&fs::read_to_string(&path).unwrap()) {
            seen += 1;
            let keeps = body.contains("pub extra: Extra")
                && body.contains(
                    "#[serde(flatten, default, skip_serializing_if = \"Extra::is_empty\")]",
                )
                && body.contains("#[ts(skip)]")
                && body.contains("#[schemars(skip)]");
            if !keeps && !FLATTENED.contains(&name.as_str()) {
                without.push(format!("{name} ({file})"));
            }
        }
    }
    assert!(seen > 40, "the structs of the model were found: {seen}");
    assert!(
        without.is_empty(),
        "these would drop the fields a newer build wrote in them, and need an `extra` like the others: {without:?}"
    );
}

#[test]
fn the_reading_of_a_file_finds_a_struct_and_its_end() {
    let text = "model! {\n    /// A thing.\n    pub struct One {\n        pub a: u8,\n    }\n\n    pub struct Two {\n        pub extra: Extra,\n    }\n}\n";
    let found = structs(text);
    assert_eq!(
        found.iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>(),
        ["One", "Two"]
    );
    assert!(!found[0].1.contains("extra") && found[1].1.contains("extra"));
}
