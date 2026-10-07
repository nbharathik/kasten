//! Writes the files the TypeScript side is built from, next to the types
//! ts-rs writes: which types belong to which operation, every operation's
//! schemas, and the deck's schema. The tests of this crate run this, and the
//! build fails when the committed files differ from what it wrote.

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use crate::model::Deck;
use crate::ops;

fn out_dir() -> PathBuf {
    std::env::var_os("TS_RS_EXPORT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("bindings"))
}

fn write(name: &str, text: &str) {
    let dir = out_dir();
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join(name);
    if fs::read_to_string(&path).ok().as_deref() != Some(text) {
        fs::write(path, text).unwrap();
    }
}

fn pretty(value: &impl serde::Serialize) -> String {
    let mut text = serde_json::to_string_pretty(value).unwrap();
    text.push('\n');
    text
}

#[test]
fn export_operation_map() {
    let names = ops::type_names();
    let mut imports = BTreeSet::new();
    let mut lines = String::new();
    for (op, input, output) in &names {
        imports.insert(*input);
        let output_ts = if *output == "()" {
            "null"
        } else {
            imports.insert(*output);
            *output
        };
        lines.push_str(&format!(
            "  {op}: {{ input: {input}; output: {output_ts} }};\n"
        ));
    }
    let mut text = String::from("// Generated from slides-core by its tests. Do not edit.\n");
    for name in &imports {
        text.push_str(&format!("import type {{ {name} }} from \"./{name}\";\n"));
    }
    text.push_str("\n/** Each operation with the type of its input and of what it returns. */\nexport interface OpMap {\n");
    text.push_str(&lines);
    text.push_str("}\n\nexport type OpName = keyof OpMap;\n\nexport const OP_NAMES = [\n");
    for (op, _, _) in &names {
        text.push_str(&format!("  \"{op}\",\n"));
    }
    text.push_str("] as const;\n");
    write("ops.ts", &text);
}

#[test]
fn export_schemas() {
    write("ops.json", &pretty(&ops::specs()));
    write("deck.schema.json", &pretty(&schemars::schema_for!(Deck)));
}
