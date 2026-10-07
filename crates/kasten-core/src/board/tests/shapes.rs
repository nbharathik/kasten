//! Shapes, drawings and line styles. Each is a plain JSON
//! Canvas text node or edge, so other tools still show a shape's label.
//! What only Kasten draws is kept under `x-kasten`, keyed by id as card
//! sizes are, and forgotten with the node.

use serde_json::json;

use super::{NOW, invalid, node};
use crate::board::{BoardChange, BoardView, Canvas, NodeView};

fn empty() -> Canvas {
    Canvas::parse(r#"{"nodes": [], "edges": []}"#).unwrap()
}

fn extras(canvas: &Canvas) -> serde_json::Value {
    canvas.to_value()["x-kasten"].clone()
}

fn shape_at(kind: &str, text: &str, x: i64) -> BoardChange {
    BoardChange::Shape {
        shape: kind.into(),
        text: text.into(),
        x,
        y: 0,
        width: 160,
        height: 90,
    }
}

fn stroke(points: &str, size: i64) -> BoardChange {
    BoardChange::Draw {
        points: points.into(),
        x: 100,
        y: 50,
        width: 20,
        height: 10,
        size,
        color: Some("4".into()),
    }
}

fn shown(canvas: &Canvas, id: &str) -> NodeView {
    let view = BoardView::with_titles("library/plan.canvas", canvas, |_| None);
    view.nodes.into_iter().find(|n| n.id == id).unwrap()
}

fn one(canvas: &mut Canvas, change: BoardChange) -> String {
    canvas.apply(&[change], NOW).unwrap()[0].clone()
}

#[test]
fn a_shape_is_a_text_node_with_its_outline_kept_aside() {
    let mut canvas = empty();
    let id = one(&mut canvas, shape_at("diamond", "Ship it?", 0));
    let raw = node(&canvas, &id);
    assert_eq!(raw["type"], "text");
    assert_eq!(raw["text"], "Ship it?");
    assert!(
        raw.get("x-kasten").is_none(),
        "the node stays plain JSON Canvas"
    );
    assert_eq!(extras(&canvas)["shape"][&id], "diamond");
    let view = shown(&canvas, &id);
    assert_eq!(view.shape.as_deref(), Some("diamond"));
    assert_eq!(view.text.as_deref(), Some("Ship it?"));

    let reshape = BoardChange::Reshape {
        id: id.clone(),
        shape: "ellipse".into(),
    };
    canvas.apply(&[reshape], NOW).unwrap();
    assert_eq!(extras(&canvas)["shape"][&id], "ellipse");

    // No shape at all makes it a sticky again, as undo needs.
    let plain = BoardChange::Reshape {
        id: id.clone(),
        shape: String::new(),
    };
    canvas.apply(&[plain], NOW).unwrap();
    assert!(extras(&canvas)["shape"].get(&id).is_none());
    assert_eq!(shown(&canvas, &id).shape, None);

    // Taking it off forgets its outline.
    let remove = BoardChange::Remove {
        ids: vec![id.clone()],
    };
    canvas.apply(&[remove], NOW).unwrap();
    assert!(extras(&canvas)["shape"].get(&id).is_none());
}

#[test]
fn shapes_are_ones_kasten_draws_at_a_real_size_on_text_nodes() {
    let mut canvas = empty();
    assert!(invalid(canvas.apply(&[shape_at("star", "x", 0)], NOW)).contains("star"));
    let flat = BoardChange::Shape {
        shape: "rect".into(),
        text: String::new(),
        x: 0,
        y: 0,
        width: 0,
        height: 10,
    };
    assert!(canvas.apply(&[flat], NOW).is_err());
    let link = one(
        &mut canvas,
        BoardChange::Link {
            url: "https://example.com".into(),
            x: 0,
            y: 0,
        },
    );
    let reshape = BoardChange::Reshape {
        id: link,
        shape: "rect".into(),
    };
    assert!(invalid(canvas.apply(&[reshape], NOW)).contains("text"));
}

#[test]
fn a_drawing_keeps_its_points_beside_an_empty_text_node() {
    let mut canvas = empty();
    let id = one(&mut canvas, stroke("0,0 10,4 20,10", 3));
    let raw = node(&canvas, &id);
    assert_eq!(raw["type"], "text");
    assert_eq!(raw["text"], "");
    assert_eq!(raw["color"], "4");
    assert_eq!(
        extras(&canvas)["draw"][&id],
        json!({"points": "0,0 10,4 20,10", "size": 3})
    );
    let drawn = shown(&canvas, &id).draw.unwrap();
    assert_eq!((drawn.points.as_str(), drawn.size), ("0,0 10,4 20,10", 3));
}

#[test]
fn a_drawing_is_refused_when_its_points_are_not_points() {
    let mut canvas = empty();
    for (points, size) in [
        ("", 3),
        ("1,2 3", 3),
        ("a,b", 3),
        ("0,0 1,1", 0),
        ("0,0 1,1", 99),
        ("0,0 99999999999999,1", 3),
    ] {
        assert!(
            canvas.apply(&[stroke(points, size)], NOW).is_err(),
            "{points} {size}"
        );
    }
    let many: Vec<String> = (0..5_001).map(|i| format!("{},0", i % 20)).collect();
    assert!(invalid(canvas.apply(&[stroke(&many.join(" "), 3)], NOW)).contains("points"));
}

#[test]
fn lines_are_straight_curved_or_elbowed_and_may_be_dashed() {
    let mut canvas = empty();
    let a = one(&mut canvas, shape_at("rect", "A", 0));
    let b = one(&mut canvas, shape_at("rect", "B", 400));
    let connect = BoardChange::Connect {
        from: a,
        to: b,
        label: None,
        from_side: None,
        to_side: None,
    };
    let edge = one(&mut canvas, connect);
    let style = |line: Option<&str>, dash: Option<bool>| BoardChange::Line {
        id: edge.clone(),
        line: line.map(str::to_owned),
        dash,
    };
    canvas
        .apply(&[style(Some("elbow"), Some(true))], NOW)
        .unwrap();
    assert_eq!(extras(&canvas)["line"][&edge], "elbow");
    assert_eq!(extras(&canvas)["dash"], json!([edge]));
    let view = BoardView::with_titles("library/plan.canvas", &canvas, |_| None);
    let drawn = view.edges.iter().find(|e| e.id == edge).unwrap();
    assert_eq!(drawn.line.as_deref(), Some("elbow"));
    assert!(drawn.dash);

    // Empty goes back to the default, and false draws it whole again.
    canvas.apply(&[style(Some(""), Some(false))], NOW).unwrap();
    assert!(extras(&canvas)["line"].get(&edge).is_none());
    assert_eq!(extras(&canvas)["dash"], json!([]));
    assert!(invalid(canvas.apply(&[style(Some("zigzag"), None)], NOW)).contains("zigzag"));

    // Taking the edge off forgets its style.
    canvas
        .apply(&[style(Some("straight"), Some(true))], NOW)
        .unwrap();
    let unlink = BoardChange::Unlink {
        ids: vec![edge.clone()],
    };
    canvas.apply(&[unlink], NOW).unwrap();
    assert!(extras(&canvas)["line"].get(&edge).is_none());
    assert_eq!(extras(&canvas)["dash"], json!([]));
}

#[test]
fn undo_puts_shapes_drawings_and_line_styles_back_as_they_were() {
    let mut canvas = empty();
    let a = one(&mut canvas, shape_at("cylinder", "Store", 0));
    let b = one(&mut canvas, shape_at("rect", "App", 400));
    let drawn = one(&mut canvas, stroke("0,0 5,5", 2));
    let connect = BoardChange::Connect {
        from: a.clone(),
        to: b.clone(),
        label: None,
        from_side: None,
        to_side: None,
    };
    let edge = one(&mut canvas, connect);
    let raw_a = node(&canvas, &a).clone();
    let raw_drawn = node(&canvas, &drawn).clone();
    let raw_edge = canvas
        .edges()
        .iter()
        .find(|e| e["id"] == edge.as_str())
        .unwrap()
        .clone();
    let remove = BoardChange::Remove {
        ids: vec![a.clone(), drawn.clone()],
    };
    canvas.apply(&[remove], NOW).unwrap();

    // The app puts each back with what `x-kasten` said about it.
    let with = |mut raw: serde_json::Value, extras: serde_json::Value| {
        raw["x-kasten"] = extras;
        raw
    };
    let restore = BoardChange::Restore {
        nodes: vec![
            with(raw_a, json!({"shape": "cylinder"})),
            with(raw_drawn, json!({"draw": {"points": "0,0 5,5", "size": 2}})),
        ],
        edges: vec![with(raw_edge, json!({"line": "elbow", "dash": true}))],
    };
    canvas.apply(&[restore], NOW).unwrap();
    assert_eq!(extras(&canvas)["shape"][&a], "cylinder");
    assert_eq!(extras(&canvas)["draw"][&drawn]["points"], "0,0 5,5");
    assert_eq!(extras(&canvas)["line"][&edge], "elbow");
    assert_eq!(extras(&canvas)["dash"], json!([edge]));
    assert!(node(&canvas, &a).get("x-kasten").is_none());
    assert!(canvas.edges().iter().all(|e| e.get("x-kasten").is_none()));
}
