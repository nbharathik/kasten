//! A kept object is written back where the element is now, with the parts it points at.

use slides_core::{Base, Element, Extra, RawEl};

use super::super::xml_of;
use crate::rawpart::{Kept, Link, Part, Target};
use crate::testing::with_cx;

const NS: &str = r#"xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships""#;

fn freeform() -> RawEl {
    RawEl {
        base: Base::new("e-free").place(100.0, 50.0, 200.0, 80.0),
        original: Some("pptx:custom-shape".into()),
        xml: Some(format!(
            r#"<p:sp {NS}><p:nvSpPr><p:cNvPr id="7" name="Pentagon" descr="by hand"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1" y="2"/><a:ext cx="3" cy="4"/></a:xfrm><a:custGeom><a:pathLst><a:path w="10" h="10"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:close/></a:path></a:pathLst></a:custGeom></p:spPr></p:sp>"#
        )),
        preview: None,
        extra: Extra::new(),
    }
}

fn chart() -> RawEl {
    let kept = Kept {
        links: vec![Link {
            id: "rId5".into(),
            kind: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart".into(),
            to: Target::Part(0),
        }],
        parts: vec![
            Part {
                name: "ppt/charts/chart1.xml".into(),
                content_type: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml".into(),
                data: b"<c:chartSpace/>".to_vec(),
                links: vec![Link {
                    id: "rId1".into(),
                    kind: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/package".into(),
                    to: Target::Part(1),
                }],
            },
            Part {
                name: "ppt/embeddings/book.xlsx".into(),
                content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".into(),
                data: vec![80, 75, 3, 4],
                links: Vec::new(),
            },
        ],
    };
    let mut extra = Extra::new();
    kept.store(&mut extra);
    RawEl {
        base: Base::new("e-chart").place(40.0, 60.0, 400.0, 300.0),
        original: Some("pptx:chart".into()),
        xml: Some(format!(
            r#"<p:graphicFrame {NS}><p:nvGraphicFramePr><p:cNvPr id="9" name="Chart 8"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId5"/></a:graphicData></a:graphic></p:graphicFrame>"#
        )),
        preview: None,
        extra,
    }
}

#[test]
fn a_freeform_comes_back_as_its_own_geometry_at_the_place_of_the_element() {
    let mut el = freeform();
    el.base.rotation = Some(30.0);
    el.base.flip_h = true;
    let (out, warnings) = with_cx(|cx| {
        let out = xml_of(cx, &Element::Raw(el));
        (out, cx.shared.warnings.len())
    });
    assert_eq!(warnings, 0);
    assert!(out.contains("<a:custGeom>"), "{out}");
    assert!(out.contains(r#"descr="by hand""#), "{out}");
    // The element's number, and its place, turn and mirror.
    assert!(out.contains(r#"<p:cNvPr id="2" name="Pentagon""#), "{out}");
    assert!(
        out.contains(r#"<a:xfrm rot="1800000" flipH="1"><a:off x="952500" y="476250"/><a:ext cx="1905000" cy="762000"/></a:xfrm>"#),
        "{out}"
    );
}

#[test]
fn a_chart_comes_back_with_its_workbook_under_new_relationship_numbers() {
    let el = chart();
    let (out, rels, parts) = with_cx(|cx| {
        // Something else already holds the first number.
        cx.rels.add(crate::rels::IMAGE, "../media/image1.png");
        let out = xml_of(cx, &Element::Raw(el));
        let rels = String::from_utf8(cx.rels.to_xml()).unwrap_or_default();
        (out, rels, !cx.shared.kept.is_empty())
    });
    assert!(
        out.contains(r#"r:id="rId2""#) && !out.contains("rId5"),
        "{out}"
    );
    assert!(
        out.contains(
            r#"<p:xfrm><a:off x="381000" y="571500"/><a:ext cx="3810000" cy="2857500"/></p:xfrm>"#
        ),
        "{out}"
    );
    assert!(
        rels.contains(r#"Id="rId2""#) && rels.contains(r#"Target="../charts/chart1.xml""#),
        "{rels}"
    );
    assert!(parts, "the chart and its workbook are kept for the package");
}

#[test]
fn the_kept_parts_are_added_to_the_package_with_their_own_relationships() {
    let el = chart();
    let bytes = with_cx(|cx| {
        xml_of(cx, &Element::Raw(el));
        let mut package = crate::package::Package::new();
        std::mem::take(&mut cx.shared.kept).add_to(&mut package);
        package
            .names()
            .into_iter()
            .map(str::to_owned)
            .collect::<Vec<_>>()
    });
    assert_eq!(
        bytes,
        [
            "ppt/charts/chart1.xml",
            "ppt/charts/_rels/chart1.xml.rels",
            "ppt/embeddings/book.xlsx"
        ]
    );
}

#[test]
fn xml_that_points_at_nothing_kept_or_can_act_is_not_written() {
    let mut dangling = freeform();
    dangling.xml = dangling
        .xml
        .map(|x| x.replace("<p:cNvSpPr/>", r#"<p:cNvSpPr r:id="rId99"/>"#));
    let mut program = freeform();
    program.xml = program.xml.map(|x| {
        x.replace(
            "<p:cNvSpPr/>",
            r#"<p:cNvSpPr><a:hlinkClick action="ppaction://program"/></p:cNvSpPr>"#,
        )
    });
    let mut not_a_shape = freeform();
    not_a_shape.xml = Some(format!(r#"<p:script {NS}/>"#));
    let mut damaged = chart();
    damaged
        .extra
        .insert("pptx".into(), serde_json::json!({ "links": "no" }));
    for (what, el) in [
        ("dangling id", dangling),
        ("program action", program),
        ("not a shape", not_a_shape),
        ("damaged record", damaged),
    ] {
        let (out, warned) = with_cx(|cx| {
            let out = xml_of(cx, &Element::Raw(el));
            (
                out,
                cx.shared
                    .warnings
                    .iter()
                    .any(|w| w.message.contains("no picture to show")),
            )
        });
        assert_eq!(out, "", "{what}");
        assert!(warned, "{what}: the element is reported as left out");
    }
}

#[test]
fn an_address_that_is_not_the_web_is_not_written_and_the_object_falls_back() {
    let mut el = chart();
    let mut kept = Kept::load(&el.extra).unwrap_or_default();
    kept.links[0].to = Target::External("file://host/share/x".into());
    el.extra = Extra::new();
    kept.store(&mut el.extra);
    let out = with_cx(|cx| xml_of(cx, &Element::Raw(el)));
    assert_eq!(out, "");
}

const REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";

fn ole_object(part_type: &str, part_name: &str, kind: &str) -> RawEl {
    let kept = Kept {
        links: vec![Link {
            id: "rId7".into(),
            kind: format!("{REL}{kind}"),
            to: Target::Part(0),
        }],
        parts: vec![Part {
            name: part_name.into(),
            content_type: part_type.into(),
            data: vec![0xd0, 0xcf, 0x11, 0xe0],
            links: Vec::new(),
        }],
    };
    let mut extra = Extra::new();
    kept.store(&mut extra);
    RawEl {
        base: Base::new("e-ole").place(40.0, 60.0, 200.0, 100.0),
        original: Some("pptx:ole-object".into()),
        xml: Some(format!(
            r#"<p:graphicFrame {NS}><p:nvGraphicFramePr><p:cNvPr id="4" name="Object 3"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/presentationml/2006/ole"><p:oleObj progId="Package" r:id="rId7"><p:embed/></p:oleObj></a:graphicData></a:graphic></p:graphicFrame>"#
        )),
        preview: None,
        extra,
    }
}

/// What writing the element did: its XML, what the package got, and the warnings.
fn written_with(el: RawEl) -> (String, Vec<String>, Vec<String>) {
    with_cx(|cx| {
        let out = xml_of(cx, &Element::Raw(el));
        let mut package = crate::package::Package::new();
        std::mem::take(&mut cx.shared.kept).add_to(&mut package);
        let names = package.names().into_iter().map(str::to_owned).collect();
        let warnings = cx
            .shared
            .warnings
            .iter()
            .map(|w| w.message.clone())
            .collect();
        (out, names, warnings)
    })
}

#[test]
fn an_embedded_object_is_never_written_and_the_export_says_what_it_left_out() {
    let ole = "application/vnd.openxmlformats-officedocument.oleObject";
    let (out, names, warnings) = written_with(ole_object(
        ole,
        "ppt/embeddings/oleObject1.bin",
        "oleObject",
    ));
    assert_eq!(out, "", "the object is not written");
    assert!(
        names.is_empty(),
        "nothing of it is in the package: {names:?}"
    );
    assert!(
        warnings
            .iter()
            .any(|w| w.contains("ppt/embeddings/oleObject1.bin") && w.contains("was left out")),
        "the part is named: {warnings:?}"
    );
    assert!(
        warnings.iter().any(|w| w.contains("pptx:ole-object")),
        "{warnings:?}"
    );

    // An object of another program is not written whatever its part says it is.
    let (out, names, _) = written_with(ole_object("image/png", "ppt/media/image9.png", "image"));
    assert_eq!(out, "");
    assert!(names.iter().all(|n| !n.contains("image9")), "{names:?}");
    // Nor when the part is a workbook: one that is not a chart's is an object of another program.
    let sheet = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    let (out, names, _) = written_with(ole_object(sheet, "ppt/embeddings/Sheet1.xlsx", "package"));
    assert_eq!(out, "");
    assert!(names.is_empty(), "{names:?}");
}

#[test]
fn a_chart_keeps_what_it_shows_and_loses_an_embedded_file_hung_on_it() {
    let mut el = chart();
    let mut kept = Kept::load(&el.extra).unwrap_or_default();
    kept.parts[0].links.push(Link {
        id: "rId2".into(),
        kind: format!("{REL}oleObject"),
        to: Target::Part(2),
    });
    kept.parts[0].links.push(Link {
        id: "rId3".into(),
        kind: format!("{REL}hyperlink"),
        to: Target::External("https://example.com/source".into()),
    });
    kept.parts[0].links.push(Link {
        id: "rId4".into(),
        kind: format!("{REL}image"),
        to: Target::External("https://tracker.example/pixel.png".into()),
    });
    kept.parts.push(Part {
        name: "ppt/embeddings/payload.bin".into(),
        content_type: "application/octet-stream".into(),
        data: vec![7; 16],
        links: Vec::new(),
    });
    el.extra = Extra::new();
    kept.store(&mut el.extra);
    let (out, names, warnings) = written_with(el);
    assert!(
        out.contains("<c:chart") && out.contains("r:id=\"rId1\""),
        "the chart itself is written: {out}"
    );
    assert_eq!(
        names,
        [
            "ppt/charts/chart1.xml",
            "ppt/charts/_rels/chart1.xml.rels",
            "ppt/embeddings/book.xlsx"
        ],
        "the chart and its workbook, and not the embedded file"
    );
    assert!(
        warnings
            .iter()
            .any(|w| w.contains("payload.bin") && w.contains("was left out")),
        "{warnings:?}"
    );
    assert!(
        warnings
            .iter()
            .any(|w| w.contains("tracker.example") && w.contains("not a hyperlink")),
        "{warnings:?}"
    );
    assert!(
        !warnings.iter().any(|w| w.contains("example.com/source")),
        "the hyperlink is kept: {warnings:?}"
    );
}

#[test]
fn a_hyperlink_is_written_back_and_a_linked_picture_is_not() {
    let linked = |kind: &str| {
        let mut el = freeform();
        let kept = Kept {
            links: vec![Link {
                id: "rId3".into(),
                kind: format!("{REL}{kind}"),
                to: Target::External("https://example.com/x".into()),
            }],
            parts: Vec::new(),
        };
        el.extra = Extra::new();
        kept.store(&mut el.extra);
        el.xml = el.xml.map(|x| {
            x.replace(
                "<p:cNvSpPr/>",
                r#"<p:cNvSpPr><a:hlinkClick r:id="rId3"/></p:cNvSpPr>"#,
            )
        });
        el
    };
    let (out, rels) = with_cx(|cx| {
        let out = xml_of(cx, &Element::Raw(linked("hyperlink")));
        (out, String::from_utf8(cx.rels.to_xml()).unwrap_or_default())
    });
    assert!(out.contains("<a:hlinkClick r:id=\"rId1\""), "{out}");
    assert!(
        rels.contains(r#"Target="https://example.com/x""#)
            && rels.contains(r#"TargetMode="External""#),
        "{rels}"
    );
    // The same address as a picture that is fetched when the file is opened.
    let (out, warned) = with_cx(|cx| {
        let out = xml_of(cx, &Element::Raw(linked("image")));
        (
            out,
            cx.shared
                .warnings
                .iter()
                .any(|w| w.message.contains("not a hyperlink")),
        )
    });
    assert_eq!(out, "");
    assert!(warned);
}
