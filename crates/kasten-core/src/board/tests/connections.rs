//! Connections a person draws: sides, labels, colours and arrowheads, and
//! how the board view shows them.

use super::{NOW, edge, invalid, keys};
use crate::board::{BoardChange, BoardView, Canvas};

fn board() -> (Canvas, String, String) {
    let mut canvas = Canvas::new("Plan");
    let a = canvas.add_text("First", Some((0, 0)), NOW);
    let b = canvas.add_text("Second", Some((400, 0)), NOW);
    (canvas, a, b)
}

#[test]
fn connects_with_sides_labels_colours_and_arrowheads() {
    let (mut canvas, a, b) = board();
    let created = canvas
        .apply(
            &[BoardChange::Connect {
                from: a.clone(),
                to: b.clone(),
                label: Some("leads to".into()),
                from_side: None,
                to_side: None,
            }],
            NOW,
        )
        .unwrap();
    let id = created[0].clone();
    // Without sides, the ones facing each other.
    assert_eq!(edge(&canvas, &id)["fromSide"], "right");
    assert_eq!(edge(&canvas, &id)["toSide"], "left");
    // The handles a person dragged between are kept.
    let other = canvas
        .apply(
            &[BoardChange::Connect {
                from: b.clone(),
                to: a.clone(),
                label: None,
                from_side: Some("bottom".into()),
                to_side: Some("bottom".into()),
            }],
            NOW,
        )
        .unwrap();
    assert_ne!(other[0], id);
    assert_eq!(
        keys(edge(&canvas, &other[0])),
        ["id", "fromNode", "fromSide", "toNode", "toSide"]
    );
    assert_eq!(edge(&canvas, &other[0])["fromSide"], "bottom");
    let sideways = canvas.apply(
        &[BoardChange::Connect {
            from: a.clone(),
            to: b.clone(),
            label: None,
            from_side: Some("middle".into()),
            to_side: None,
        }],
        NOW,
    );
    assert!(invalid(sideways).contains("side"));
    canvas
        .apply(
            &[BoardChange::Edge {
                id: id.clone(),
                label: Some(String::new()),
                color: Some("#e8590c".into()),
                from_end: Some("arrow".into()),
                to_end: Some("none".into()),
                from_side: None,
                to_side: None,
            }],
            NOW,
        )
        .unwrap();
    let e = edge(&canvas, &id);
    assert!(e.get("label").is_none(), "an empty label goes");
    assert_eq!(e["color"], "#e8590c");
    assert_eq!(e["fromEnd"], "arrow");
    assert_eq!(e["toEnd"], "none");
    let arrowless = canvas.apply(
        &[BoardChange::Edge {
            id: id.clone(),
            label: None,
            color: None,
            from_end: Some("dot".into()),
            to_end: None,
            from_side: None,
            to_side: None,
        }],
        NOW,
    );
    assert!(invalid(arrowless).contains("arrow"));
    canvas
        .apply(
            &[BoardChange::Unlink {
                ids: vec![id.clone(), other[0].clone()],
            }],
            NOW,
        )
        .unwrap();
    assert!(canvas.edges().is_empty());
}

#[test]
fn the_view_carries_colours_sides_and_ends() {
    let (mut canvas, a, b) = board();
    let made = canvas
        .apply(
            &[
                BoardChange::Color {
                    ids: vec![a.clone()],
                    color: Some("#AbCdEf".into()),
                },
                BoardChange::Connect {
                    from: a.clone(),
                    to: b.clone(),
                    label: None,
                    from_side: None,
                    to_side: None,
                },
            ],
            NOW,
        )
        .unwrap();
    let id = made[0].clone();
    canvas
        .apply(
            &[
                BoardChange::Edge {
                    id: id.clone(),
                    label: Some(" then ".into()),
                    color: None,
                    from_end: Some("arrow".into()),
                    to_end: None,
                    from_side: None,
                    to_side: None,
                },
                BoardChange::Color {
                    ids: vec![id.clone(), b.clone()],
                    color: Some("2".into()),
                },
            ],
            NOW,
        )
        .unwrap();
    let view = BoardView::with_titles("library/plan.canvas", &canvas, |_| None);
    assert_eq!(view.nodes[0].color.as_deref(), Some("#AbCdEf"));
    assert_eq!(view.nodes[1].color.as_deref(), Some("2"));
    let e = &view.edges[0];
    assert_eq!(e.label.as_deref(), Some("then"));
    assert_eq!(e.color.as_deref(), Some("2"));
    assert_eq!(
        (e.from_side.as_deref(), e.to_side.as_deref()),
        (Some("right"), Some("left"))
    );
    assert_eq!(
        (e.from_end.as_deref(), e.to_end.as_deref()),
        (Some("arrow"), None)
    );
    let json = serde_json::to_value(e).unwrap();
    assert_eq!(json["fromEnd"], "arrow");
    assert!(json.get("toEnd").is_none());
}

#[test]
fn an_edge_can_join_other_sides_or_leave_them_to_the_view() {
    let (mut canvas, a, b) = board();
    let made = canvas
        .apply(
            &[BoardChange::Connect {
                from: a.clone(),
                to: b.clone(),
                label: None,
                from_side: Some("bottom".into()),
                to_side: Some("top".into()),
            }],
            NOW,
        )
        .unwrap();
    let id = made[0].clone();
    let resided = |from: &str, to: Option<&str>| BoardChange::Edge {
        id: id.clone(),
        label: None,
        color: None,
        from_end: None,
        to_end: None,
        from_side: Some(from.into()),
        to_side: to.map(Into::into),
    };
    // A layout moves an edge to the sides that now face each other.
    canvas
        .apply(&[resided("right", Some("left"))], NOW)
        .unwrap();
    assert_eq!(edge(&canvas, &id)["fromSide"], "right");
    assert_eq!(edge(&canvas, &id)["toSide"], "left");
    // Empty leaves a side to whoever draws the board; one not given stays.
    canvas.apply(&[resided("", None)], NOW).unwrap();
    assert!(edge(&canvas, &id).get("fromSide").is_none());
    assert_eq!(edge(&canvas, &id)["toSide"], "left");
    assert_eq!(
        keys(edge(&canvas, &id)),
        ["id", "fromNode", "toNode", "toSide"]
    );
    assert!(invalid(canvas.apply(&[resided("middle", None)], NOW)).contains("side"));
}
