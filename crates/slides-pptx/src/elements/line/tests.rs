use serde_json::json;
use slides_core::{Arrow, Engine, Stroke, Style};

use super::*;
use crate::elements::{Env, write_all};
use crate::testing::{MapMedia, with_deck};

/// A blank slide with the elements, written as a slide would write them.
fn slide_xml(elements: serde_json::Value) -> (String, Vec<String>) {
    let mut engine = Engine::create("t", "Light", 3).unwrap_or_else(|e| panic!("{e}"));
    let slide = engine
        .apply("add_slide", json!({ "layout": "blank" }))
        .unwrap_or_else(|e| panic!("{e}"))
        .output["slide"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    engine
        .apply(
            "add_elements",
            json!({ "slide": slide, "elements": elements }),
        )
        .unwrap_or_else(|e| panic!("{e}"));
    let deck = engine.into_deck();
    let slide = deck
        .slide(&slide)
        .cloned()
        .unwrap_or_else(|| panic!("the slide"));
    with_deck(&deck, &MapMedia::default(), |cx| {
        cx.slide = Some(slide.id.clone());
        cx.layout = slide.layout.clone();
        cx.ids.assign(&slide.elements);
        let mut x = Xml::fragment();
        write_all(&mut x, cx, &slide.elements, &Env::default());
        (
            x.into_string(),
            cx.shared
                .warnings
                .iter()
                .map(|w| w.message.clone())
                .collect(),
        )
    })
}

fn boxes() -> serde_json::Value {
    json!([
        { "type": "shape", "id": "a", "shape": "rect", "x": 0, "y": 0, "w": 100, "h": 50 },
        { "type": "shape", "id": "b", "shape": "ellipse", "x": 300, "y": 100, "w": 100, "h": 50 },
    ])
}

fn with_connector(route: &str, extra: serde_json::Value) -> String {
    let mut elements = boxes().as_array().cloned().unwrap_or_default();
    let mut connector = json!({
        "type": "connector", "id": "k", "route": route, "x": 0, "y": 0, "w": 1, "h": 1,
        "from": { "el": "a", "side": "right" }, "to": { "el": "b", "side": "left" },
        "style": { "stroke": { "color": "text2", "width": 1.5 }, "endArrow": "triangle" }
    });
    if let (Some(target), Some(more)) = (connector.as_object_mut(), extra.as_object()) {
        target.extend(more.clone());
    }
    elements.push(connector);
    slide_xml(json!(elements)).0
}

#[test]
fn a_free_line_runs_corner_to_corner_with_its_stroke_and_arrowheads() {
    let (out, warnings) = slide_xml(json!([{
        "type": "line", "id": "l", "x": 60, "y": 340, "w": 300, "h": 0,
        "style": { "stroke": { "color": "text2", "width": 3, "dash": "dash" }, "endArrow": "triangle" }
    }]));
    assert_eq!(
        out,
        concat!(
            r#"<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="2" name="Line 2"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>"#,
            r#"<p:spPr><a:xfrm><a:off x="571500" y="3238500"/><a:ext cx="2857500" cy="0"/></a:xfrm>"#,
            r#"<a:prstGeom prst="line"><a:avLst/></a:prstGeom>"#,
            r#"<a:ln w="28575" cap="flat" cmpd="sng"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill>"#,
            r#"<a:prstDash val="dash"/><a:round/><a:tailEnd type="triangle" w="med" len="med"/></a:ln></p:spPr></p:cxnSp>"#
        )
    );
    assert!(warnings.is_empty(), "{warnings:?}");
}

#[test]
fn the_route_picks_the_connector_geometry() {
    let line = |route: &str| {
        slide_xml(json!([{ "type": "line", "id": "l", "route": route, "x": 0, "y": 0, "w": 10, "h": 10 }])).0
    };
    assert!(line("elbow").contains(r#"prst="bentConnector3""#));
    assert!(line("curved").contains(r#"prst="curvedConnector3""#));
    assert!(line("straight").contains(r#"prst="line""#));
    assert!(with_connector("straight", json!({})).contains(r#"prst="straightConnector1""#));
    assert!(with_connector("elbow", json!({})).contains(r#"prst="bentConnector3""#));
}

#[test]
fn a_connector_names_the_shapes_and_sites_it_joins() {
    let out = with_connector("straight", json!({}));
    // a is a rectangle (its right side is site 3), b an ellipse (its left side is site 2).
    assert!(
        out.contains(
            r#"<p:cNvCxnSpPr><a:stCxn id="2" idx="3"/><a:endCxn id="3" idx="2"/></p:cNvCxnSpPr>"#
        ),
        "{out}"
    );
    assert!(
        out.contains(
            r#"<a:xfrm><a:off x="952500" y="238125"/><a:ext cx="1905000" cy="952500"/></a:xfrm>"#
        ),
        "{out}"
    );
}

#[test]
fn a_connector_that_runs_backwards_is_flipped() {
    let out = slide_xml(json!([
        { "type": "shape", "id": "a", "shape": "rect", "x": 300, "y": 100, "w": 100, "h": 50 },
        { "type": "shape", "id": "b", "shape": "rect", "x": 0, "y": 0, "w": 100, "h": 50 },
        { "type": "connector", "id": "k", "route": "straight", "x": 0, "y": 0, "w": 1, "h": 1,
          "from": { "el": "a", "side": "left" }, "to": { "el": "b", "side": "right" } },
    ]))
    .0;
    assert!(out.contains(r#"<a:xfrm flipH="1" flipV="1">"#), "{out}");
}

#[test]
fn an_end_on_a_shape_with_no_known_site_stays_where_it_is_unattached() {
    let (out, warnings) = slide_xml(json!([
        { "type": "shape", "id": "a", "shape": "triangle", "x": 0, "y": 0, "w": 100, "h": 50 },
        { "type": "shape", "id": "b", "shape": "rect", "x": 300, "y": 100, "w": 100, "h": 50 },
        { "type": "connector", "id": "k", "route": "straight", "x": 0, "y": 0, "w": 1, "h": 1,
          "from": { "el": "a", "side": "right" }, "to": { "el": "b", "side": "left" } },
    ]));
    assert!(
        out.contains(r#"<p:cNvCxnSpPr><a:endCxn id="3" idx="1"/></p:cNvCxnSpPr>"#),
        "{out}"
    );
    assert_eq!(warnings.len(), 1, "{warnings:?}");
    assert!(warnings[0].contains("triangle"), "{warnings:?}");
}

#[test]
fn a_flipped_or_turned_target_moves_the_site_or_takes_none() {
    let target = |extra: serde_json::Value| {
        let mut a = json!({ "type": "shape", "id": "a", "shape": "rect", "x": 0, "y": 0, "w": 100, "h": 50 });
        if let (Some(t), Some(m)) = (a.as_object_mut(), extra.as_object()) {
            t.extend(m.clone());
        }
        slide_xml(json!([
            a,
            { "type": "shape", "id": "b", "shape": "rect", "x": 300, "y": 100, "w": 100, "h": 50 },
            { "type": "connector", "id": "k", "route": "straight", "x": 0, "y": 0, "w": 1, "h": 1,
              "from": { "el": "a", "side": "right" }, "to": { "el": "b", "side": "left" } },
        ]))
    };
    assert!(
        target(json!({ "flipH": true }))
            .0
            .contains(r#"<a:stCxn id="2" idx="1"/>"#),
        "flipped: right is the left site"
    );
    let (out, warnings) = target(json!({ "rotation": 90 }));
    assert!(
        out.contains("<a:endCxn") && !out.contains("<a:stCxn"),
        "{out}"
    );
    assert!(
        warnings.iter().any(|w| w.contains("turned")),
        "{warnings:?}"
    );
}

#[test]
fn a_line_without_a_stroke_is_still_drawn() {
    let (out, _) =
        slide_xml(json!([{ "type": "line", "id": "l", "x": 0, "y": 0, "w": 10, "h": 10 }]));
    assert!(
        out.contains(r#"<a:ln w="14288""#) && out.contains(r#"<a:schemeClr val="tx1"/>"#),
        "{out}"
    );
}

#[test]
fn a_label_sits_on_a_chip_at_the_midpoint_and_follows_the_connector_in_the_stack() {
    let out = with_connector(
        "straight",
        json!({ "label": { "paragraphs": [{ "runs": [{ "t": "calls" }] }] } }),
    );
    let (connector, label) = out.split_once("</p:cxnSp>").unwrap_or_default();
    assert!(connector.contains(r#"name="Connector 4""#), "{out}");
    // The midpoint of the box (100, 25)..(300, 125) is (200, 75); 5 letters of 18.67 units make a 61-unit chip.
    assert!(
        label.starts_with(
            r#"<p:sp><p:nvSpPr><p:cNvPr id="5" name="Connector 4 label"/><p:cNvSpPr txBox="1"/>"#
        ),
        "{label}"
    );
    assert!(
        label.contains(r#"<a:schemeClr val="bg1"/></a:solidFill>"#),
        "{label}"
    );
    assert!(
        label.contains(r#"wrap="none""#)
            && label.contains(r#"algn="ctr""#)
            && label.contains(r#"sz="1400""#),
        "{label}"
    );
    assert!(label.contains("<a:t>calls</a:t>"), "{label}");
}

#[test]
fn a_blank_label_is_not_written() {
    let out = with_connector(
        "straight",
        json!({ "label": { "paragraphs": [{ "runs": [{ "t": "  " }] }] } }),
    );
    assert_eq!(out.matches("<p:sp>").count(), 2, "{out}");
}

#[test]
fn the_chip_is_sized_as_the_editor_sizes_it() {
    let theme = slides_core::themes::light();
    let (w, h) = label_box(&theme, &Text::plain("calls"));
    // 14 pt is 18.667 units: five letters of 0.55 em plus insets, and a line of 1.25 em plus insets.
    assert!((w - (5.0 * 18.6667 * 0.55 + 19.2)).abs() < 0.01, "{w}");
    assert!((h - (18.6667 * 1.25 + 9.6)).abs() < 0.01, "{h}");
    let long = Text::plain("x".repeat(200));
    assert_eq!(label_box(&theme, &long).0, 320.0);
    // An empty label is still as wide as one letter.
    assert!((label_box(&theme, &Text::plain("")).0 - (18.6667 * 0.55 + 19.2)).abs() < 0.01);
    let two = Text::plain("a\nb");
    assert!((label_box(&theme, &two).1 - (2.0 * 18.6667 * 1.25 + 9.6)).abs() < 0.01);
}

#[test]
fn a_stroke_and_arrow_from_the_style_reach_the_connector() {
    let style = Style {
        stroke: Some(Stroke {
            color: "accent2".into(),
            width: Some(2.0),
            dash: None,
            alpha: None,
            extra: slides_core::Extra::new(),
        }),
        start_arrow: Some(Arrow::Diamond),
        ..Style::default()
    };
    let out = with_connector(
        "elbow",
        json!({ "style": serde_json::to_value(&style).unwrap_or_default() }),
    );
    assert!(
        out.contains(r#"<a:headEnd type="diamond" w="lg" len="lg"/></a:ln>"#),
        "{out}"
    );
}
