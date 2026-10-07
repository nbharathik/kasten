//! Reading any JSON Canvas formatting and writing the house style, with
//! every unknown key kept in its order; relinking and counting removed
//! nodes, which work on whole boards.

use serde_json::{Value, json};

use super::{NOW, invalid, keys, node, rect};
use crate::board::Canvas;

/// A board as Obsidian writes it: tab-indented and fully expanded.
const OBSIDIAN: &str = concat!(
    "{\n",
    "\t\"nodes\":[\n",
    "\t\t{\n",
    "\t\t\t\"id\":\"8a1f\",\n",
    "\t\t\t\"type\":\"text\",\n",
    "\t\t\t\"text\":\"Line one\\nLine \\\"two\\\"\",\n",
    "\t\t\t\"x\":-120,\n",
    "\t\t\t\"y\":40,\n",
    "\t\t\t\"width\":250,\n",
    "\t\t\t\"height\":60\n",
    "\t\t},\n",
    "\t\t{\n",
    "\t\t\t\"id\":\"c0de\",\n",
    "\t\t\t\"type\":\"link\",\n",
    "\t\t\t\"url\":\"https://jsoncanvas.org\",\n",
    "\t\t\t\"x\":200,\n",
    "\t\t\t\"y\":40,\n",
    "\t\t\t\"width\":400,\n",
    "\t\t\t\"height\":300\n",
    "\t\t}\n",
    "\t],\n",
    "\t\"edges\":[]\n",
    "}"
);

#[test]
fn keeps_unknown_keys_in_their_order_through_an_edit() {
    let text = r#"{"version": "1.0", "nodes": [{"zeta": 1, "id": "a", "type": "text", "text": "Hi", "x": 0, "y": 0, "width": 100, "height": 50, "alpha": {"b": 1, "a": [2, 1]}}], "edges": [{"id": "e", "fromNode": "a", "toNode": "a", "custom": true}], "x-kasten": {"title": "Odd", "later": {"z": 1, "y": 2}}, "zz": null}"#;
    let original: Value = serde_json::from_str(text).unwrap();
    let mut canvas = Canvas::parse(text).unwrap();
    assert_eq!(canvas.title(), Some("Odd"));
    let id = canvas.add_text("New idea", None, NOW);

    let out: Value = serde_json::from_str(&canvas.to_text()).unwrap();
    assert_eq!(keys(&out), ["version", "nodes", "edges", "x-kasten", "zz"]);
    let first = &out["nodes"][0];
    assert_eq!(first, &original["nodes"][0]);
    let order = [
        "zeta", "id", "type", "text", "x", "y", "width", "height", "alpha",
    ];
    assert_eq!(keys(first), order);
    assert_eq!(keys(&first["alpha"]), ["b", "a"]);
    assert_eq!(out["edges"], original["edges"]);
    assert_eq!(
        keys(&out["edges"][0]),
        ["id", "fromNode", "toNode", "custom"]
    );
    assert_eq!(out["x-kasten"], original["x-kasten"]);
    assert_eq!(keys(&out["x-kasten"]), ["title", "later"]);
    assert_eq!(keys(&out["x-kasten"]["later"]), ["z", "y"]);
    assert_eq!((&out["version"], &out["zz"]), (&json!("1.0"), &Value::Null));

    let sticky = &out["nodes"][1];
    assert_eq!(sticky["id"], id.as_str());
    let order = ["id", "type", "text", "x", "y", "width", "height"];
    assert_eq!(keys(sticky), order);
    assert_eq!(sticky["text"], "New idea");
    assert_eq!(
        rect(sticky),
        (0, 130, 260, 120),
        "80 px below the lowest node"
    );
}

#[test]
fn reads_obsidian_formatting_and_writes_house_style() {
    let canvas = Canvas::parse(OBSIDIAN).unwrap();
    assert_eq!(canvas.node_ids(), ["8a1f", "c0de"]);
    assert_eq!(
        canvas.to_text(),
        concat!(
            "{\n",
            "  \"nodes\": [\n",
            "    {\"id\": \"8a1f\", \"type\": \"text\", \"text\": \"Line one\\nLine \\\"two\\\"\", \"x\": -120, \"y\": 40, \"width\": 250, \"height\": 60},\n",
            "    {\"id\": \"c0de\", \"type\": \"link\", \"url\": \"https://jsoncanvas.org\", \"x\": 200, \"y\": 40, \"width\": 400, \"height\": 300}\n",
            "  ],\n",
            "  \"edges\": []\n",
            "}\n"
        )
    );
    // The app sends and receives boards as JSON.
    let sent = serde_json::to_value(&canvas).unwrap();
    assert_eq!(sent, serde_json::from_str::<Value>(OBSIDIAN).unwrap());
    assert_eq!(serde_json::from_value::<Canvas>(sent).unwrap(), canvas);
    assert!(serde_json::from_value::<Canvas>(json!({"nodes": 1})).is_err());
}

#[test]
fn a_missing_edges_array_reads_as_empty_and_bad_json_is_refused() {
    let mut bare = Canvas::parse(r#"{"nodes": [{"id": "a", "type": "text", "text": "A", "x": 0, "y": 0, "width": 10, "height": 10}, {"id": "b", "type": "text", "text": "B", "x": 100, "y": 0, "width": 10, "height": 10}], "x-kasten": {"title": "Bare"}}"#).unwrap();
    assert!(bare.edges().is_empty());
    bare.connect("a", "b", None, NOW).unwrap();
    let out: Value = serde_json::from_str(&bare.to_text()).unwrap();
    assert_eq!(
        keys(&out),
        ["nodes", "edges", "x-kasten"],
        "edges after nodes"
    );
    assert_eq!(out["edges"].as_array().unwrap().len(), 1);

    // What Obsidian writes for a new, empty canvas.
    let fresh = Canvas::parse("{}").unwrap();
    assert!(fresh.nodes().is_empty() && fresh.edges().is_empty());
    assert_eq!(fresh.to_text(), "{\n  \"nodes\": [],\n  \"edges\": []\n}\n");

    for bad in [
        "",
        "not json",
        "{\"nodes\": []",
        "[]",
        r#"{"edges": []}"#,
        r#"{"nodes": {}}"#,
        r#"{"nodes": [1]}"#,
        r#"{"nodes": [], "edges": "none"}"#,
        r#"{"nodes": [], "edges": [null]}"#,
    ] {
        let why = invalid(Canvas::parse(bad));
        assert!(why.starts_with("Not valid JSON Canvas: "), "{bad}: {why}");
    }
}

#[test]
fn relinks_every_move_at_once() {
    let mut canvas = Canvas::parse(r##"{"nodes": [{"id": "a", "type": "file", "file": "a.md", "x": 0, "y": 0, "width": 1, "height": 1}, {"id": "b", "type": "file", "file": "b.md", "subpath": "#Part", "x": 0, "y": 0, "width": 1, "height": 1}, {"id": "t", "type": "text", "text": "a.md", "x": 0, "y": 0, "width": 1, "height": 1}], "edges": []}"##).unwrap();
    let swap = [
        ("a.md".to_owned(), "b.md".to_owned()),
        ("b.md".to_owned(), "a.md".to_owned()),
    ];
    assert_eq!(canvas.relink(&swap), 2);
    assert_eq!(node(&canvas, "a")["file"], "b.md");
    let b = node(&canvas, "b");
    assert_eq!(
        (&b["file"], &b["subpath"]),
        (&json!("a.md"), &json!("#Part"))
    );
    assert_eq!(
        keys(b),
        ["id", "type", "file", "subpath", "x", "y", "width", "height"]
    );
    assert_eq!(node(&canvas, "t")["text"], "a.md", "only file nodes change");
    assert_eq!(canvas.relink(&[]), 0);
}
