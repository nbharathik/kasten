//! The edits a person makes on a board, in batches: moving and resizing,
//! stickies, cards, links, sections, text and colours. Removing, and what a
//! batch refuses, are in `refusals.rs`; connections in `connections.rs`.

use super::{NOW, invalid, node, rect};
use crate::board::{BoardChange, Canvas};

pub(super) fn board() -> (Canvas, String, String) {
    let mut canvas = Canvas::new("Plan");
    let a = canvas.add_text("First", Some((0, 0)), NOW);
    let b = canvas.add_text("Second", Some((400, 0)), NOW);
    (canvas, a, b)
}

#[test]
fn places_and_resizes_nodes() {
    let (mut canvas, a, b) = board();
    let created = canvas
        .apply(
            &[
                BoardChange::Place {
                    id: a.clone(),
                    x: 10,
                    y: 20,
                    width: None,
                    height: None,
                },
                BoardChange::Place {
                    id: b.clone(),
                    x: -40,
                    y: 300,
                    width: Some(500),
                    height: Some(200),
                },
            ],
            NOW,
        )
        .unwrap();
    assert!(created.is_empty());
    assert_eq!(rect(node(&canvas, &a)), (10, 20, 260, 120));
    assert_eq!(rect(node(&canvas, &b)), (-40, 300, 500, 200));
    // Nothing else about the node moves: keys keep their order.
    assert_eq!(node(&canvas, &a)["text"], "First");
}

#[test]
fn adds_stickies_cards_links_and_sections_and_says_their_ids() {
    let (mut canvas, a, _) = board();
    let created = canvas
        .apply(
            &[
                BoardChange::Sticky {
                    text: "Idea".into(),
                    x: 0,
                    y: 200,
                },
                BoardChange::Card {
                    path: "library/zettel.md".into(),
                    x: 400,
                    y: 200,
                    width: None,
                    height: None,
                },
                BoardChange::Link {
                    url: "https://jsoncanvas.org".into(),
                    x: 800,
                    y: 200,
                },
                BoardChange::Section {
                    label: "Later".into(),
                    x: -40,
                    y: 160,
                    width: 900,
                    height: 300,
                },
                BoardChange::Wrap {
                    ids: vec![a.clone()],
                    label: "Now".into(),
                },
                // A card for another board is a nested board.
                BoardChange::Card {
                    path: "library/other.canvas".into(),
                    x: 0,
                    y: 600,
                    width: None,
                    height: None,
                },
            ],
            NOW,
        )
        .unwrap();
    assert_eq!(created.len(), 6);
    let [sticky, card, link, section, wrap, nested] =
        [0, 1, 2, 3, 4, 5].map(|i| created[i].as_str());
    assert_eq!(node(&canvas, sticky)["text"], "Idea");
    assert_eq!(node(&canvas, card)["file"], "library/zettel.md");
    assert_eq!(rect(node(&canvas, card)), (400, 200, 320, 180));
    assert_eq!(node(&canvas, link)["url"], "https://jsoncanvas.org");
    assert_eq!(node(&canvas, section)["type"], "group");
    assert_eq!(node(&canvas, section)["label"], "Later");
    // A section drawn by hand goes to the back, behind everything.
    assert_eq!(canvas.node_ids()[0], section);
    assert_eq!(node(&canvas, wrap)["label"], "Now");
    assert_eq!(node(&canvas, nested)["file"], "library/other.canvas");
    // The same note twice keeps one card.
    let again = canvas
        .apply(
            &[BoardChange::Card {
                path: "library/zettel.md".into(),
                x: 0,
                y: 0,
                width: None,
                height: None,
            }],
            NOW,
        )
        .unwrap();
    assert_eq!(again, [card]);
    assert_eq!(rect(node(&canvas, card)), (400, 200, 320, 180));
}

#[test]
fn edits_text_labels_and_colours() {
    let (mut canvas, a, b) = board();
    let created = canvas
        .apply(
            &[BoardChange::Wrap {
                ids: vec![a.clone(), b.clone()],
                label: "Both".into(),
            }],
            NOW,
        )
        .unwrap();
    let group = created[0].clone();
    canvas
        .apply(
            &[
                BoardChange::Text {
                    id: a.clone(),
                    text: "First, edited".into(),
                },
                BoardChange::Text {
                    id: group.clone(),
                    text: "Renamed".into(),
                },
                BoardChange::Color {
                    ids: vec![a.clone(), b.clone()],
                    color: Some("4".into()),
                },
                BoardChange::Color {
                    ids: vec![b.clone()],
                    color: None,
                },
            ],
            NOW,
        )
        .unwrap();
    assert_eq!(node(&canvas, &a)["text"], "First, edited");
    assert_eq!(node(&canvas, &group)["label"], "Renamed");
    assert_eq!(node(&canvas, &a)["color"], "4");
    assert!(node(&canvas, &b).get("color").is_none());
    for bad in ["purple", "7", "#12345", "#12345g"] {
        let result = canvas.apply(
            &[BoardChange::Color {
                ids: vec![a.clone()],
                color: Some(bad.into()),
            }],
            NOW,
        );
        assert!(
            invalid(result).contains("colour"),
            "{bad}: colours are 1 to 6 or #rrggbb"
        );
    }
    // A sticky's text is its own; a card's is its note's.
    let card = canvas
        .apply(
            &[BoardChange::Card {
                path: "library/zettel.md".into(),
                x: 0,
                y: 400,
                width: None,
                height: None,
            }],
            NOW,
        )
        .unwrap();
    let refused = canvas.apply(
        &[BoardChange::Text {
            id: card[0].clone(),
            text: "No".into(),
        }],
        NOW,
    );
    assert!(invalid(refused).contains("note"));
}

#[test]
fn links_are_web_addresses() {
    let (mut canvas, _, _) = board();
    for bad in [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "  ",
        "example.com",
    ] {
        let result = canvas.apply(
            &[BoardChange::Link {
                url: bad.into(),
                x: 0,
                y: 0,
            }],
            NOW,
        );
        assert!(invalid(result).contains("web address"), "{bad}");
    }
    let made = canvas
        .apply(
            &[BoardChange::Link {
                url: " https://example.com/a b ".into(),
                x: 0,
                y: 0,
            }],
            NOW,
        )
        .unwrap();
    assert_eq!(node(&canvas, &made[0])["url"], "https://example.com/a b");
    // A link node's text is its address, held to the same rule.
    assert!(
        canvas
            .apply(
                &[BoardChange::Text {
                    id: made[0].clone(),
                    text: "javascript:0".into()
                }],
                NOW
            )
            .is_err()
    );
}

#[test]
fn a_card_can_take_the_shape_of_what_it_shows() {
    let (mut canvas, _, _) = board();
    let card = |path: &str, x, y, size: Option<(i64, i64)>| BoardChange::Card {
        path: path.into(),
        x,
        y,
        width: size.map(|s| s.0),
        height: size.map(|s| s.1),
    };
    let made = canvas
        .apply(&[card("assets/town.png", 10, 20, Some((320, 427)))], NOW)
        .unwrap();
    assert_eq!(rect(node(&canvas, &made[0])), (10, 20, 320, 427));
    // Already on the board: it keeps its card, where and as big as it is.
    let again = canvas
        .apply(&[card("assets/town.png", 0, 0, Some((50, 50)))], NOW)
        .unwrap();
    assert_eq!(again, made);
    assert_eq!(rect(node(&canvas, &made[0])), (10, 20, 320, 427));
    assert!(
        canvas
            .apply(&[card("assets/other.png", 0, 0, Some((0, 10)))], NOW)
            .is_err()
    );
}
