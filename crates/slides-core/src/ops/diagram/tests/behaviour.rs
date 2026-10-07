//! What a diagram does besides where it puts things: shrinking, refusing, staying the same, undoing, staying clean.

use proptest::prelude::*;
use serde_json::{Value, json};

use super::*;
use crate::error::Error;
use crate::model::Element;
use crate::ops::Engine;

#[test]
fn a_chain_of_five_with_labelled_arrows_fits_when_each_column_is_only_as_wide_as_its_own_words() {
    // What an agent draws first: short words, a label on two arrows.
    for area in [
        json!({}),
        json!({ "box": { "x": 40, "y": 180, "w": 880, "h": 240 } }),
    ] {
        let (mut e, slide) = slide_of("title-only");
        let labelled = |from: &str, to: &str, label: Option<&str>| {
            let mut edge = json!({ "from": from, "to": to });
            if let Some(label) = label {
                edge["label"] = json!(label);
            }
            edge
        };
        draw(
            &mut e,
            &slide,
            nodes(&["Query", "Retriever", "Documents", "Model", "Answer"]),
            json!([
                labelled("query", "retriever", None),
                labelled("retriever", "documents", Some("top k")),
                labelled("documents", "model", Some("context")),
                labelled("model", "answer", None)
            ]),
            area.clone(),
        )
        .unwrap_or_else(|error| panic!("{area}: {error}"));
        let list = boxes(&e, &slide);
        assert_eq!(list.len(), 5);
        let rects: Vec<Rect> = ["Query", "Retriever", "Documents", "Model", "Answer"]
            .iter()
            .map(|n| rect_named(&list, n))
            .collect();
        assert!(
            rects
                .iter()
                .all(|r| inside(AREA, *r) || area["box"].is_object()),
            "{rects:?}"
        );
        assert!(
            rects
                .windows(2)
                .all(|w| disjoint(w[0], w[1]) && w[0].x < w[1].x),
            "{rects:?}"
        );
        // The room between two boxes is at least as wide as the word written on the arrow between them.
        let gaps: Vec<f64> = rects
            .windows(2)
            .map(|w| w[1].x - (w[0].x + w[0].w))
            .collect();
        assert!(
            gaps[1] > 60.0 && gaps[2] > 80.0,
            "room for 'top k' and 'context': {gaps:?}"
        );
        // Columns differ in width: a short word does not get a wide box.
        assert!(rects[0].w < rects[2].w, "{rects:?}");
        // Real type runs wider than the estimate of it, so every box has room to spare for its longest word.
        let theme = e.deck().theme.clone();
        for (label, rect) in ["Query", "Retriever", "Documents", "Model", "Answer"]
            .iter()
            .zip(&rects)
        {
            let words = super::super::plan::words(label, 14.0, false);
            let need = crate::lint::estimate::text_size(&theme, "body", &words, 1.0e6).natural;
            assert!(
                rect.w >= need * 1.05,
                "{label}: {} wide, the estimate says {need}",
                rect.w
            );
        }
        assert_attached(&e, &slide);
    }
}

#[test]
fn a_crowded_diagram_shrinks_to_fit_and_an_impossible_one_says_what_to_do() {
    let (mut e, slide) = slide_of("title-only");
    let names: Vec<String> = (1..=8).map(|n| format!("Step {n}")).collect();
    let labels: Vec<&str> = names.iter().map(String::as_str).collect();
    let pairs: Vec<(String, String)> = (1..8)
        .map(|n| (format!("step-{n}"), format!("step-{}", n + 1)))
        .collect();
    let refs: Vec<(&str, &str)> = pairs
        .iter()
        .map(|(a, b)| (a.as_str(), b.as_str()))
        .collect();
    draw(&mut e, &slide, nodes(&labels), edges(&refs), json!({})).unwrap();
    let list = boxes(&e, &slide);
    assert_eq!(list.len(), 8);
    assert!(list.iter().all(|(_, _, r)| inside(AREA, *r)));
    let size = e
        .deck()
        .slide(&slide)
        .unwrap()
        .elements
        .iter()
        .find_map(|el| match el {
            Element::Shape(s) => s.text.as_ref().and_then(|t| t.paragraphs[0].runs[0].size),
            _ => None,
        });
    assert!(
        size.unwrap() >= 14.0,
        "type never goes under 14 pt: {size:?}"
    );

    let (mut e, slide) = slide_of("title-only");
    let many: Vec<String> = (1..=40).map(|n| format!("Stage number {n}")).collect();
    let labels: Vec<&str> = many.iter().map(String::as_str).collect();
    let pairs: Vec<(String, String)> = (1..40)
        .map(|n| {
            (
                format!("stage-number-{n}"),
                format!("stage-number-{}", n + 1),
            )
        })
        .collect();
    let refs: Vec<(&str, &str)> = pairs
        .iter()
        .map(|(a, b)| (a.as_str(), b.as_str()))
        .collect();
    let error = draw(&mut e, &slide, nodes(&labels), edges(&refs), json!({})).unwrap_err();
    let Error::Refused { message } = error else {
        panic!("refused")
    };
    assert!(
        message.contains("40")
            && message.contains("box")
            && message.contains("split")
            && message.contains("At 14 pt it needs about"),
        "{message}"
    );
    assert_eq!(
        boxes(&e, &slide).len(),
        0,
        "a refused diagram changes nothing"
    );
}

#[test]
fn bad_input_is_refused_in_words_and_changes_nothing() {
    let (mut e, slide) = slide_of("title-only");
    let before = crate::canonical::write(e.deck()).unwrap();
    let cases: Vec<(Value, Value, &str)> = vec![
        (nodes(&[]), edges(&[]), "at least one"),
        (nodes(&["A", "B"]), edges(&[("a", "z")]), "`z`"),
        (
            json!([{ "id": "a", "label": "A" }, { "id": "a", "label": "Again" }]),
            edges(&[]),
            "twice",
        ),
        (nodes(&["A"]), edges(&[("a", "a")]), "itself"),
        (
            json!([{ "id": "a", "label": "A", "color": "chartreuse" }]),
            edges(&[]),
            "chartreuse",
        ),
        (
            json!([{ "id": "a", "label": "A", "shape": "" }]),
            edges(&[]),
            "shape",
        ),
    ];
    for (n, ed, word) in cases {
        let error = draw(&mut e, &slide, n, ed, json!({}))
            .unwrap_err()
            .to_string();
        assert!(error.contains(word), "{word}: {error}");
    }
    assert!(matches!(
        draw(&mut e, "s-nope", nodes(&["A"]), edges(&[]), json!({})),
        Err(Error::NoSuchSlide { .. })
    ));
    let error = draw(
        &mut e,
        &slide,
        nodes(&["A"]),
        edges(&[]),
        json!({ "box": { "x": 0, "y": 0, "w": 10, "h": 10 } }),
    )
    .unwrap_err()
    .to_string();
    assert!(error.contains("box"), "{error}");
    assert_eq!(crate::canonical::write(e.deck()).unwrap(), before);
    assert_eq!(
        e.undo_label(),
        Some("add_slide"),
        "no refused diagram is on the undo stack"
    );
}

#[test]
fn the_same_input_makes_the_same_diagram_and_one_undo_takes_it_all_back() {
    let make = |seed: u64| {
        let mut e = Engine::new(Engine::create("D", "Light", 1).unwrap().into_deck(), seed);
        let slide = e.deck().slides[0].id.clone();
        draw(
            &mut e,
            &slide,
            nodes(&["A", "B", "C", "D"]),
            edges(&[("a", "b"), ("a", "c"), ("b", "d"), ("c", "d")]),
            json!({ "box": { "x": 100, "y": 100, "w": 700, "h": 300 } }),
        )
        .unwrap();
        (e, slide)
    };
    let (one, s1) = make(5);
    let (two, s2) = make(5);
    assert_eq!(
        crate::canonical::write(one.deck()).unwrap(),
        crate::canonical::write(two.deck()).unwrap()
    );
    let (other, s3) = make(6);
    let geometry = |e: &Engine, s: &str| {
        boxes(e, s)
            .into_iter()
            .map(|(_, n, r)| (n, r.x, r.y, r.w, r.h))
            .collect::<Vec<_>>()
    };
    assert_eq!(
        geometry(&one, &s1),
        geometry(&other, &s3),
        "ids differ with the seed; places do not"
    );
    assert_eq!(s1, s2);

    let (mut e, slide) = slide_of("title-only");
    let before = crate::canonical::write(e.deck()).unwrap();
    draw(
        &mut e,
        &slide,
        nodes(&["A", "B"]),
        edges(&[("a", "b")]),
        json!({}),
    )
    .unwrap();
    let after = crate::canonical::write(e.deck()).unwrap();
    assert_ne!(before, after);
    e.undo().unwrap();
    assert_eq!(crate::canonical::write(e.deck()).unwrap(), before);
    e.redo().unwrap();
    assert_eq!(crate::canonical::write(e.deck()).unwrap(), after);
}

#[test]
fn labels_on_edges_make_room_and_emphasis_and_colours_stay_readable() {
    let (mut e, slide) = slide_of("title-only");
    let ns = json!([
        { "id": "a", "label": "Ask", "emphasis": true },
        { "id": "b", "label": "Answer", "color": "#0b3d91" },
        { "id": "c", "label": "Cache", "color": "accent3", "shape": "ellipse" },
    ]);
    let es = json!([{ "from": "a", "to": "b", "label": "tool call" }, { "from": "b", "to": "c" }]);
    draw(&mut e, &slide, ns, es, json!({})).unwrap();
    let labelled = connectors(&e, &slide)
        .into_iter()
        .find(|c| c.label.is_some())
        .unwrap();
    assert_eq!(labelled.label.unwrap().plain_text(), "tool call");
    let list = boxes(&e, &slide);
    let (a, b) = (rect_named(&list, "Ask"), rect_named(&list, "Answer"));
    assert!(
        b.x - (a.x + a.w) >= 60.0,
        "room for the label between the boxes"
    );
    // Nothing the diagram made is a lint problem: contrast, overlap, margins, type size.
    let report = crate::lint::lint_deck(e.deck(), None);
    assert_eq!(report.issues, vec![], "{:?}", report.issues);
    let estimated = crate::lint::estimate::measures(e.deck());
    let report = crate::lint::lint_deck(e.deck(), Some(&estimated));
    assert_eq!(report.issues, vec![], "{:?}", report.issues);
}

fn graph() -> impl Strategy<Value = (usize, Vec<(usize, usize)>, bool)> {
    (1usize..=10).prop_flat_map(|n| {
        (
            Just(n),
            prop::collection::vec((0..n, 0..n), 0..14),
            any::<bool>(),
        )
    })
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(96))]

    #[test]
    fn any_small_graph_lays_out_without_overlap_inside_the_area_with_every_arrow_attached((n, pairs, down) in graph()) {
        let (mut e, slide) = slide_of("title-only");
        let names: Vec<String> = (0..n).map(|i| format!("Node {i}")).collect();
        let labels: Vec<&str> = names.iter().map(String::as_str).collect();
        let ids: Vec<String> = (0..n).map(|i| format!("node-{i}")).collect();
        let edge_list: Vec<(&str, &str)> = pairs.iter().filter(|(a, b)| a != b).map(|(a, b)| (ids[*a].as_str(), ids[*b].as_str())).collect();
        let direction = if down { "topDown" } else { "leftToRight" };
        let before = crate::canonical::write(e.deck()).unwrap();
        let result = draw(&mut e, &slide, nodes(&labels), edges(&edge_list), json!({ "direction": direction }));
        match result {
            Err(Error::Refused { message }) => {
                prop_assert!(message.contains("fit"), "{message}");
                prop_assert_eq!(crate::canonical::write(e.deck()).unwrap(), before, "a refused diagram changes nothing");
            }
            Err(other) => prop_assert!(false, "{other}"),
            Ok(_) => {
                let list = boxes(&e, &slide);
                prop_assert_eq!(list.len(), n);
                for (i, (_, _, a)) in list.iter().enumerate() {
                    prop_assert!(inside(AREA, *a), "{:?}", a);
                    for (_, _, b) in &list[i + 1..] {
                        prop_assert!(disjoint(*a, *b), "{:?} {:?}", a, b);
                    }
                }
                prop_assert_eq!(connectors(&e, &slide).len(), edge_list.len());
                assert_attached(&e, &slide);
                let again = crate::lint::lint_deck(e.deck(), None);
                prop_assert!(!again.has_errors(), "{:?}", again.issues);
                // The inverse gives the deck back byte for byte, and redo gives the diagram back.
                let drawn = crate::canonical::write(e.deck()).unwrap();
                prop_assert!(e.undo().is_some());
                prop_assert_eq!(crate::canonical::write(e.deck()).unwrap(), before);
                prop_assert!(e.redo().is_some());
                prop_assert_eq!(crate::canonical::write(e.deck()).unwrap(), drawn);
            }
        }
    }
}
