//! Kasten's own board state under `x-kasten` (collapsed sections and card
//! display size), and putting back what was
//! taken off, for undo.

use serde_json::json;

use super::{NOW, invalid, node};
use crate::board::{BoardChange, BoardView, Canvas};

fn board() -> (Canvas, String, String) {
    let text = r#"{"nodes": [], "edges": [], "x-kasten": {"title": "Plan", "theirs": 1}}"#;
    let mut canvas = Canvas::parse(text).unwrap();
    let card = BoardChange::Card {
        path: "library/zettel.md".into(),
        x: 0,
        y: 0,
        width: None,
        height: None,
    };
    let card = canvas.apply(&[card], NOW).unwrap()[0].clone();
    let wrap = BoardChange::Wrap {
        ids: vec![card.clone()],
        label: "Now".into(),
    };
    let section = canvas.apply(&[wrap], NOW).unwrap()[0].clone();
    (canvas, card, section)
}

fn extras(canvas: &Canvas) -> serde_json::Value {
    canvas.to_value()["x-kasten"].clone()
}

#[test]
fn cards_show_title_only_or_expanded() {
    let (mut canvas, card, _) = board();
    canvas
        .apply(
            &[BoardChange::CardSize {
                id: card.clone(),
                size: Some("expanded".into()),
            }],
            NOW,
        )
        .unwrap();
    assert_eq!(extras(&canvas)["cardSize"][&card], "expanded");
    assert_eq!(extras(&canvas)["theirs"], 1, "other extras stay");
    let view = BoardView::with_titles("library/plan.canvas", &canvas, |_| None);
    let shown = view.nodes.iter().find(|n| n.id == card).unwrap();
    assert_eq!(shown.size.as_deref(), Some("expanded"));

    canvas
        .apply(
            &[BoardChange::CardSize {
                id: card.clone(),
                size: None,
            }],
            NOW,
        )
        .unwrap();
    assert!(extras(&canvas)["cardSize"].get(&card).is_none());
    for bad in ["huge", ""] {
        let result = canvas.apply(
            &[BoardChange::CardSize {
                id: card.clone(),
                size: Some(bad.into()),
            }],
            NOW,
        );
        assert!(invalid(result).contains("title or expanded"), "{bad}");
    }
    assert!(
        canvas
            .apply(
                &[BoardChange::CardSize {
                    id: "nope".into(),
                    size: None
                }],
                NOW
            )
            .is_err()
    );
}

#[test]
fn sections_fold_and_unfold() {
    let (mut canvas, card, section) = board();
    canvas
        .apply(
            &[BoardChange::Collapse {
                id: section.clone(),
                collapsed: true,
            }],
            NOW,
        )
        .unwrap();
    canvas
        .apply(
            &[BoardChange::Collapse {
                id: section.clone(),
                collapsed: true,
            }],
            NOW,
        )
        .unwrap();
    assert_eq!(
        extras(&canvas)["collapsed"],
        json!([section]),
        "once, however often"
    );
    let view = BoardView::with_titles("library/plan.canvas", &canvas, |_| None);
    assert!(
        view.nodes
            .iter()
            .find(|n| n.id == section)
            .unwrap()
            .collapsed
    );
    let refused = canvas.apply(
        &[BoardChange::Collapse {
            id: card,
            collapsed: true,
        }],
        NOW,
    );
    assert!(invalid(refused).contains("section"));
    canvas
        .apply(
            &[BoardChange::Collapse {
                id: section.clone(),
                collapsed: false,
            }],
            NOW,
        )
        .unwrap();
    assert_eq!(extras(&canvas)["collapsed"], json!([]));
}

#[test]
fn a_board_without_extras_gets_them_when_needed() {
    let mut canvas = Canvas::parse(
        r#"{"nodes": [{"id": "a", "type": "group", "x": 0, "y": 0, "width": 10, "height": 10}]}"#,
    )
    .unwrap();
    canvas
        .apply(
            &[BoardChange::Collapse {
                id: "a".into(),
                collapsed: true,
            }],
            NOW,
        )
        .unwrap();
    assert_eq!(extras(&canvas), json!({"collapsed": ["a"]}));
}

#[test]
fn removing_a_node_forgets_its_extras() {
    let (mut canvas, card, section) = board();
    canvas
        .apply(
            &[
                BoardChange::CardSize {
                    id: card.clone(),
                    size: Some("title".into()),
                },
                BoardChange::Collapse {
                    id: section.clone(),
                    collapsed: true,
                },
                BoardChange::Remove {
                    ids: vec![card.clone(), section.clone()],
                },
            ],
            NOW,
        )
        .unwrap();
    assert_eq!(extras(&canvas)["cardSize"], json!({}));
    assert_eq!(extras(&canvas)["collapsed"], json!([]));
}

#[test]
fn restores_what_was_removed_with_its_ids() {
    let (mut canvas, card, section) = board();
    let sticky = canvas
        .apply(
            &[BoardChange::Sticky {
                text: "Note".into(),
                x: 400,
                y: 0,
            }],
            NOW,
        )
        .unwrap()[0]
        .clone();
    let edge = canvas
        .apply(
            &[BoardChange::Connect {
                from: card.clone(),
                to: sticky.clone(),
                label: None,
                from_side: None,
                to_side: None,
            }],
            NOW,
        )
        .unwrap()[0]
        .clone();
    let before = canvas.clone();
    let nodes = vec![
        node(&canvas, &section).clone(),
        node(&canvas, &sticky).clone(),
    ];
    let edges = canvas.edges().to_vec();
    canvas
        .apply(
            &[BoardChange::Remove {
                ids: vec![section.clone(), sticky.clone()],
            }],
            NOW,
        )
        .unwrap();
    assert!(canvas.edges().is_empty());

    canvas
        .apply(
            &[BoardChange::Restore {
                nodes: nodes.clone(),
                edges: edges.clone(),
            }],
            NOW,
        )
        .unwrap();
    // Sections go to the back, so they stay behind their cards.
    assert_eq!(
        canvas.node_ids(),
        [section.clone(), card.clone(), sticky.clone()]
    );
    assert_eq!(canvas.edges(), before.edges());
    assert_eq!(canvas.edges()[0]["id"], edge.as_str());

    // What is still there, or half a node, is refused.
    let twice = canvas.apply(
        &[BoardChange::Restore {
            nodes: nodes.clone(),
            edges: vec![],
        }],
        NOW,
    );
    assert!(invalid(twice).contains("already"));
    let half = canvas.apply(
        &[BoardChange::Restore {
            nodes: vec![json!({"id": "z"})],
            edges: vec![],
        }],
        NOW,
    );
    assert!(invalid(half).contains("node"));
    let dangling = json!({"id": "e9", "fromNode": card, "toNode": "gone"});
    let result = canvas.apply(
        &[BoardChange::Restore {
            nodes: vec![],
            edges: vec![dangling],
        }],
        NOW,
    );
    assert!(invalid(result).contains("gone"));
}

#[test]
fn restoring_sections_keeps_their_order() {
    let mut canvas = Canvas::new("Plan");
    let a = canvas.add_text("A", Some((0, 0)), NOW);
    let outer = canvas
        .apply(
            &[BoardChange::Wrap {
                ids: vec![a.clone()],
                label: "Outer".into(),
            }],
            NOW,
        )
        .unwrap()[0]
        .clone();
    let inner = canvas
        .apply(
            &[BoardChange::Wrap {
                ids: vec![a.clone()],
                label: "Inner".into(),
            }],
            NOW,
        )
        .unwrap()[0]
        .clone();
    let order = canvas.node_ids();
    let nodes: Vec<_> = [&outer, &inner]
        .iter()
        .map(|id| node(&canvas, id).clone())
        .collect();
    canvas
        .apply(
            &[BoardChange::Remove {
                ids: vec![outer, inner],
            }],
            NOW,
        )
        .unwrap();
    canvas
        .apply(
            &[BoardChange::Restore {
                nodes,
                edges: vec![],
            }],
            NOW,
        )
        .unwrap();
    assert_eq!(canvas.node_ids(), order);
}
