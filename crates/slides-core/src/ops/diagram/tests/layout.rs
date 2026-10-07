//! Where the boxes and arrows of a diagram go.

use serde_json::json;

use super::*;
use crate::model::Side;
use crate::resolve::Rect;

#[test]
fn a_chain_reads_left_to_right_in_one_row_with_arrows_between() {
    let (mut e, slide) = slide_of("title-only");
    let made = draw(
        &mut e,
        &slide,
        nodes(&["Model", "Host", "Tool", "Result"]),
        edges(&[("model", "host"), ("host", "tool"), ("tool", "result")]),
        json!({}),
    )
    .unwrap();
    let list = boxes(&e, &slide);
    assert_eq!(list.len(), 4);
    let rects: Vec<Rect> = ["Model", "Host", "Tool", "Result"]
        .iter()
        .map(|n| rect_named(&list, n))
        .collect();
    assert!(
        rects.windows(2).all(|w| w[0].x + w[0].w < w[1].x),
        "left to right with room between"
    );
    assert!(
        rects
            .windows(2)
            .all(|w| (w[0].y - w[1].y).abs() < 0.01 && (w[0].h - w[1].h).abs() < 0.01),
        "one row of one size"
    );
    let arrows = connectors(&e, &slide);
    assert_eq!(arrows.len(), 3);
    assert!(
        arrows
            .iter()
            .all(|c| c.from.as_ref().unwrap().side == Side::Right
                && c.to.as_ref().unwrap().side == Side::Left)
    );
    assert_attached(&e, &slide);
    assert_eq!(made.output["connectors"].as_array().unwrap().len(), 3);
    assert_eq!(
        made.output["nodes"]["host"].as_str().unwrap(),
        list.iter().find(|(_, n, _)| n == "Host").unwrap().0
    );
    assert!(rects.iter().all(|r| inside(AREA, *r)), "{rects:?}");
}

#[test]
fn top_down_runs_the_other_way() {
    let (mut e, slide) = slide_of("title-only");
    draw(
        &mut e,
        &slide,
        nodes(&["Plan", "Act", "Check"]),
        edges(&[("plan", "act"), ("act", "check")]),
        json!({ "direction": "topDown" }),
    )
    .unwrap();
    let list = boxes(&e, &slide);
    let rects: Vec<Rect> = ["Plan", "Act", "Check"]
        .iter()
        .map(|n| rect_named(&list, n))
        .collect();
    assert!(
        rects
            .windows(2)
            .all(|w| w[0].y + w[0].h < w[1].y && (w[0].x - w[1].x).abs() < 0.01)
    );
    assert!(
        connectors(&e, &slide)
            .iter()
            .all(|c| c.from.as_ref().unwrap().side == Side::Bottom
                && c.to.as_ref().unwrap().side == Side::Top)
    );
    assert_attached(&e, &slide);
    assert!(rects.iter().all(|r| inside(AREA, *r)));
}

#[test]
fn a_fan_out_is_centred_on_its_parent_and_never_overlaps() {
    let (mut e, slide) = slide_of("title-only");
    draw(
        &mut e,
        &slide,
        nodes(&["Root", "One", "Two", "Three"]),
        edges(&[("root", "one"), ("root", "two"), ("root", "three")]),
        json!({}),
    )
    .unwrap();
    let list = boxes(&e, &slide);
    let root = rect_named(&list, "Root");
    let two = rect_named(&list, "Two");
    assert!(
        (root.y + root.h / 2.0 - (two.y + two.h / 2.0)).abs() < 0.01,
        "the middle child is level with the parent"
    );
    let all: Vec<Rect> = list.iter().map(|(_, _, r)| *r).collect();
    for (i, a) in all.iter().enumerate() {
        assert!(inside(AREA, *a));
        for b in &all[i + 1..] {
            assert!(disjoint(*a, *b), "{a:?} {b:?}");
        }
    }
    assert_attached(&e, &slide);
}

#[test]
fn an_edge_that_skips_a_layer_passes_between_the_boxes_not_through_them() {
    let (mut e, slide) = slide_of("title-only");
    draw(
        &mut e,
        &slide,
        nodes(&["A", "B", "C"]),
        edges(&[("a", "b"), ("b", "c"), ("a", "c")]),
        json!({}),
    )
    .unwrap();
    let list = boxes(&e, &slide);
    let b = rect_named(&list, "B");
    let skip = connectors(&e, &slide).into_iter().find(|c| {
        let from = list
            .iter()
            .find(|(id, _, _)| Some(id) == c.from.as_ref().map(|a| &a.el))
            .unwrap();
        let to = list
            .iter()
            .find(|(id, _, _)| Some(id) == c.to.as_ref().map(|a| &a.el))
            .unwrap();
        from.1 == "A" && to.1 == "C"
    });
    let (start, end) = ends(&skip.unwrap());
    // The line from A to C runs level, above or below B: it does not cross B's box.
    let crosses = |y: f64| y > b.y && y < b.y + b.h;
    assert!(
        !crosses(start.1) && !crosses(end.1),
        "{start:?} {end:?} vs {b:?}"
    );
    assert_attached(&e, &slide);
}

#[test]
fn a_cycle_is_laid_out_and_its_way_back_is_attached_too() {
    let (mut e, slide) = slide_of("title-only");
    draw(
        &mut e,
        &slide,
        nodes(&["Think", "Act", "Observe"]),
        edges(&[("think", "act"), ("act", "observe"), ("observe", "think")]),
        json!({}),
    )
    .unwrap();
    let list = boxes(&e, &slide);
    assert_eq!(list.len(), 3);
    let back = connectors(&e, &slide)
        .into_iter()
        .find(|c| c.from.as_ref().map(|a| a.side.clone()) == Some(Side::Left))
        .expect("the way back leaves a left side");
    assert_eq!(back.to.as_ref().unwrap().side, Side::Right);
    assert_attached(&e, &slide);
    let observe = rect_named(&list, "Observe");
    let think = rect_named(&list, "Think");
    assert!(
        observe.x > think.x,
        "the cycle is drawn forward and closed by one arrow going back"
    );
}

#[test]
fn the_default_area_is_below_the_title_and_a_box_of_your_own_is_used() {
    let (mut e, slide) = slide_of("title-only");
    draw(
        &mut e,
        &slide,
        nodes(&["A", "B"]),
        edges(&[("a", "b")]),
        json!({}),
    )
    .unwrap();
    let deck = e.deck();
    let slide_ref = deck.slide(&slide).unwrap();
    let title = crate::resolve::box_of(&deck.theme, slide_ref, &slide_ref.elements[0]).unwrap();
    assert!(
        boxes(&e, &slide)
            .iter()
            .all(|(_, _, r)| r.y >= title.y + title.h),
        "below the title"
    );

    let (mut e, slide) = slide_of("blank");
    let area = Rect {
        x: 500.0,
        y: 100.0,
        w: 400.0,
        h: 300.0,
    };
    draw(
        &mut e,
        &slide,
        nodes(&["A", "B", "C"]),
        edges(&[("a", "b"), ("b", "c")]),
        json!({ "box": { "x": 500, "y": 100, "w": 400, "h": 300 } }),
    )
    .unwrap();
    let list = boxes(&e, &slide);
    assert!(list.iter().all(|(_, _, r)| inside(area, *r)), "{list:?}");
    let xs: Vec<f64> = list.iter().map(|(_, _, r)| r.x).collect();
    let (left, right) = (
        xs.iter().cloned().fold(f64::MAX, f64::min),
        list.iter().map(|(_, _, r)| r.x + r.w).fold(0.0, f64::max),
    );
    assert!(
        ((left - area.x) - (area.x + area.w - right)).abs() < 1.0,
        "centred in its box"
    );
}
