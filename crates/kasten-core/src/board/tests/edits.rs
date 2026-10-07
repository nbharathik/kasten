//! The edits agents make: cards laid out in a grid, in sections by tag or
//! at given places, connections on facing sides, sections around nodes,
//! and ids that never collide. Layouts below existing content are tested
//! on the fixture board in `tests/board.rs`.

use std::collections::HashSet;

use serde_json::json;

use super::{NOW, edge, invalid, is_hex16, item, keys, node, rect};
use crate::board::{Canvas, Layout};

const METRIC: &str = "cards/metric.md";
const SKETCH: &str = "cards/sketch.md";
const ROADMAP: &str = "pages/roadmap.md";
const ZETTEL: &str = "library/zettel.md";

#[test]
fn a_grid_on_an_empty_board_starts_at_the_origin() {
    let mut canvas = Canvas::new("Empty");
    let items = [ZETTEL, METRIC, SKETCH, ROADMAP, "a.md"].map(|p| item(p, &[]));
    let added = canvas.add_files(&items, Layout::Grid, NOW).unwrap();
    let placed: Vec<_> = added
        .created
        .iter()
        .map(|id| rect(node(&canvas, id)))
        .collect();
    let corners = [(0, 0), (360, 0), (720, 0), (1080, 0), (0, 220)];
    assert_eq!(placed, corners.map(|(x, y)| (x, y, 320, 180)));
    assert!(added.created.iter().all(|id| is_hex16(id)), "{added:?}");
}

#[test]
fn cluster_by_tag_makes_one_labelled_section_per_first_tag() {
    let mut canvas = Canvas::new("Ideas");
    let items = [
        item(METRIC, &["idea", "paper"]),
        item(ZETTEL, &[]),
        item(ROADMAP, &[" paper "]),
        item(SKETCH, &["idea"]),
    ];
    let added = canvas.add_files(&items, Layout::ClusterByTag, NOW).unwrap();
    assert_eq!(added.created, added.nodes);
    let label = |id: &String| node(&canvas, id)["label"].as_str().unwrap().to_owned();
    let labels: Vec<String> = added.groups.iter().map(label).collect();
    assert_eq!(labels, ["idea", "paper", "Untagged"], "untagged last");

    let [metric, zettel, roadmap, sketch] = [0, 1, 2, 3].map(|i| added.nodes[i].as_str());
    let [idea, paper, untagged] = [0, 1, 2].map(|i| added.groups[i].as_str());
    assert_eq!(
        canvas.node_ids(),
        [idea, metric, sketch, paper, roadmap, untagged, zettel],
        "each section comes before its cards"
    );
    assert_eq!(node(&canvas, idea)["type"], "group");
    assert_eq!(rect(node(&canvas, idea)), (0, 0, 400, 520));
    assert_eq!(rect(node(&canvas, metric)), (40, 80, 320, 180));
    assert_eq!(rect(node(&canvas, sketch)), (40, 300, 320, 180));
    assert_eq!(rect(node(&canvas, paper)), (440, 0, 400, 300));
    assert_eq!(rect(node(&canvas, roadmap)), (480, 80, 320, 180));
    assert_eq!(rect(node(&canvas, untagged)), (880, 0, 400, 300));
    assert_eq!(rect(node(&canvas, zettel)), (920, 80, 320, 180));
}

#[test]
fn positions_place_each_new_card_where_asked() {
    let mut canvas = Canvas::new("Map");
    let items = [item(ZETTEL, &[]), item(METRIC, &[])];
    let corners = Layout::Positions(vec![(10, 20), (-300, 400)]);
    let added = canvas.add_files(&items, corners, NOW).unwrap();
    let placed: Vec<_> = added
        .created
        .iter()
        .map(|id| rect(node(&canvas, id)))
        .collect();
    assert_eq!(placed, [(10, 20, 320, 180), (-300, 400, 320, 180)]);

    // A card already there stays where it is.
    let items = [item(METRIC, &[]), item(ROADMAP, &[])];
    let corners = Layout::Positions(vec![(0, 0), (900, 900)]);
    let again = canvas.add_files(&items, corners, NOW).unwrap();
    assert_eq!(again.nodes[0], added.nodes[1]);
    assert_eq!(rect(node(&canvas, &added.nodes[1])), (-300, 400, 320, 180));
    assert_eq!(rect(node(&canvas, &again.created[0])), (900, 900, 320, 180));

    let before = canvas.clone();
    let none = Layout::Positions(Vec::new());
    invalid(canvas.add_files(&[item(SKETCH, &[])], none, NOW));
    for bad in [
        "",
        "../outside.md",
        "/etc/passwd",
        ".git/config",
        "library//x.md",
        "https://example.com",
    ] {
        invalid(canvas.add_files(&[item(bad, &[])], Layout::Grid, NOW));
    }
    assert_eq!(canvas, before, "refused calls change nothing");
}

#[test]
fn connects_on_facing_sides_and_reuses_an_edge_that_is_there() {
    let mut canvas = Canvas::new("Flow");
    let a = canvas.add_text("A", Some((0, 0)), NOW);
    let right = canvas.add_text("Right", Some((600, 50)), NOW);
    let below = canvas.add_text("Below", Some((20, 400)), NOW);

    let e1 = canvas.connect(&a, &right, Some("leads to"), NOW).unwrap();
    let e2 = canvas.connect(&a, &below, None, NOW).unwrap();
    let e3 = canvas.connect(&right, &a, None, NOW).unwrap();
    let e4 = canvas.connect(&below, &a, Some("back"), NOW).unwrap();
    let sides = |id: &str| {
        let e = edge(&canvas, id);
        (e["fromSide"].clone(), e["toSide"].clone())
    };
    assert_eq!(sides(&e1), (json!("right"), json!("left")));
    assert_eq!(sides(&e2), (json!("bottom"), json!("top")));
    assert_eq!(sides(&e3), (json!("left"), json!("right")));
    assert_eq!(sides(&e4), (json!("top"), json!("bottom")));
    let first = edge(&canvas, &e1);
    let order = ["id", "fromNode", "fromSide", "toNode", "toSide", "label"];
    assert_eq!(keys(first), order);
    assert_eq!(
        (&first["fromNode"], &first["toNode"], &first["label"]),
        (&json!(a), &json!(right), &json!("leads to"))
    );
    assert!(edge(&canvas, &e2).get("label").is_none());
    assert!(is_hex16(&e1));

    // The same pair and label, either way round, is the same edge.
    let reused = canvas.connect(&right, &a, Some(" leads to "), NOW).unwrap();
    assert_eq!(reused, e1);
    assert_eq!(canvas.connect(&a, &right, None, NOW).unwrap(), e3);
    let e5 = canvas
        .connect(&a, &right, Some("contradicts"), NOW)
        .unwrap();
    assert!(![&e1, &e2, &e3, &e4].contains(&&e5));
    assert_eq!(canvas.edges().len(), 5);

    let before = canvas.clone();
    invalid(canvas.connect(&a, "nope", None, NOW));
    invalid(canvas.connect("nope", &a, None, NOW));
    invalid(canvas.connect(&a, &a, None, NOW));
    assert_eq!(canvas, before);
}

#[test]
fn groups_nodes_in_a_section_behind_them() {
    let mut canvas = Canvas::new("Sections");
    let a = canvas.add_text("A", Some((100, 100)), NOW);
    let b = canvas.add_text("B", Some((500, 300)), NOW);
    let c = canvas.add_text("C", Some((0, 1000)), NOW);

    let pair = canvas.group(&[b.clone(), a.clone()], "Pair", NOW).unwrap();
    // Around (100, 100)–(760, 420): 40 px each side and 40 more on top.
    assert_eq!(rect(node(&canvas, &pair)), (60, 20, 740, 440));
    let section = node(&canvas, &pair);
    let order = ["id", "type", "label", "x", "y", "width", "height"];
    assert_eq!(keys(section), order);
    assert_eq!(
        (&section["type"], &section["label"]),
        (&json!("group"), &json!("Pair"))
    );
    assert_eq!(canvas.node_ids(), [&pair, &a, &b, &c].map(String::as_str));

    let solo = canvas.group(&[c.as_str()], " ", NOW).unwrap();
    let order = [&pair, &a, &b, &solo, &c].map(String::as_str);
    assert_eq!(canvas.node_ids(), order);
    assert_eq!(rect(node(&canvas, &solo)), (-40, 920, 340, 240));
    assert!(
        node(&canvas, &solo).get("label").is_none(),
        "no empty label"
    );

    let before = canvas.clone();
    invalid(canvas.group(&[] as &[&str], "Empty", NOW));
    invalid(canvas.group(&["nope"], "Ghost", NOW));
    invalid(canvas.group(&[pair.as_str(), "nope"], "Half", NOW));
    assert_eq!(canvas, before);
}

#[test]
fn ids_stay_unique_within_one_millisecond() {
    let mut canvas = Canvas::new("Stickies");
    let ids: Vec<String> = (0..1000)
        .map(|i| canvas.add_text(&format!("Idea {i}"), None, NOW))
        .collect();
    let unique: HashSet<&String> = ids.iter().collect();
    assert_eq!(unique.len(), 1000);
    assert!(ids.iter().all(|id| is_hex16(id)), "{:?}", &ids[..3]);
    assert_eq!(canvas.node_ids(), ids);
    let edge = canvas.connect(&ids[0], &ids[1], None, NOW).unwrap();
    assert!(is_hex16(&edge) && !unique.contains(&edge));
}
