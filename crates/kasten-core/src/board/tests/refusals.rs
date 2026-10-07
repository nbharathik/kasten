//! Removing nodes (notes stay) with their edges, changes as they arrive
//! in JSON, and what a batch refuses whole: unknown ids and positions past
//! the board.

use serde_json::json;

use super::changes::board;
use super::{NOW, invalid};
use crate::board::BoardChange;

#[test]
fn removes_nodes_with_their_edges_and_refuses_unknown_ids_whole() {
    let (mut canvas, a, b) = board();
    canvas
        .apply(
            &[BoardChange::Connect {
                from: a.clone(),
                to: b.clone(),
                label: None,
                from_side: None,
                to_side: None,
            }],
            NOW,
        )
        .unwrap();
    let before = canvas.clone();
    // One bad change in a batch changes nothing at all.
    let bad = canvas.apply(
        &[
            BoardChange::Place {
                id: a.clone(),
                x: 1,
                y: 1,
                width: None,
                height: None,
            },
            BoardChange::Place {
                id: "nope".into(),
                x: 1,
                y: 1,
                width: None,
                height: None,
            },
        ],
        NOW,
    );
    assert!(invalid(bad).contains("nope"));
    assert_eq!(canvas, before);
    let flat = canvas.apply(
        &[BoardChange::Place {
            id: a.clone(),
            x: 1,
            y: 1,
            width: Some(0),
            height: Some(10),
        }],
        NOW,
    );
    assert!(invalid(flat).contains("size"));
    // Removing what is already gone is no change, so a late click is harmless.
    canvas
        .apply(
            &[
                BoardChange::Remove {
                    ids: vec!["gone".into()],
                },
                BoardChange::Unlink {
                    ids: vec!["gone".into()],
                },
            ],
            NOW,
        )
        .unwrap();
    assert_eq!(canvas, before);
    canvas
        .apply(
            &[BoardChange::Remove {
                ids: vec![a.clone()],
            }],
            NOW,
        )
        .unwrap();
    assert!(canvas.node(&a).is_none());
    assert!(
        canvas.edges().is_empty(),
        "edges to a removed node go with it"
    );
    assert_eq!(canvas.node_ids(), [b]);
}

#[test]
fn changes_arrive_as_json() {
    let change: BoardChange =
        serde_json::from_value(json!({"kind": "place", "id": "a", "x": 1, "y": 2})).unwrap();
    assert_eq!(
        change,
        BoardChange::Place {
            id: "a".into(),
            x: 1,
            y: 2,
            width: None,
            height: None
        }
    );
    let edge: BoardChange =
        serde_json::from_value(json!({"kind": "edge", "id": "e", "toEnd": "arrow"})).unwrap();
    assert_eq!(
        edge,
        BoardChange::Edge {
            id: "e".into(),
            label: None,
            color: None,
            from_end: None,
            to_end: Some("arrow".into()),
            from_side: None,
            to_side: None
        }
    );
    let connect: BoardChange = serde_json::from_value(
        json!({"kind": "connect", "from": "a", "to": "b", "fromSide": "top"}),
    )
    .unwrap();
    assert_eq!(
        connect,
        BoardChange::Connect {
            from: "a".into(),
            to: "b".into(),
            label: None,
            from_side: Some("top".into()),
            to_side: None
        }
    );
}

#[test]
fn refuses_positions_past_the_board_even_the_extremes() {
    let (mut canvas, a, _) = board();
    for (x, y) in [(i64::MIN, 0), (0, i64::MIN), (i64::MAX, i64::MAX)] {
        let place = BoardChange::Place {
            id: a.clone(),
            x,
            y,
            width: None,
            height: None,
        };
        assert!(invalid(canvas.apply(&[place], NOW)).contains("Too far out"));
    }
}
