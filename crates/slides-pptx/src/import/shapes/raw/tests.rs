use slides_core::Element;

use super::super::base::nv_of;
use super::super::frame;
use super::*;
use crate::import::testing::{NS, with_rels, xml};
use crate::rawpart::{Kept, Target};

const CHART_FRAME: &str = r#"<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Chart 3" descr="Sales"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
<p:xfrm><a:off x="952500" y="952500"/><a:ext cx="4762500" cy="2857500"/></p:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId2"/></a:graphicData></a:graphic></p:graphicFrame>"#;

const REL: &str = r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/book.xlsx"/><Relationship Id="rId2" Type="https://x/link" Target="https://example.com/data" TargetMode="External"/></Relationships>"#;

fn raw_of(out: &[Element]) -> &slides_core::RawEl {
    match out.first() {
        Some(Element::Raw(r)) => r,
        other => panic!("a raw element, not {other:?}"),
    }
}

#[test]
fn a_chart_is_kept_with_its_xml_and_the_parts_it_points_at() {
    let node = xml(CHART_FRAME);
    let (out, warnings, notes) = with_rels(
        &[
            ("ppt/charts/chart1.xml", b"<c:chartSpace/>"),
            ("ppt/charts/_rels/chart1.xml.rels", REL.as_bytes()),
            ("ppt/embeddings/book.xlsx", b"PK-workbook"),
        ],
        &[("rId2", "chart", "../charts/chart1.xml")],
        |cx| {
            let nv = nv_of(node.at(&["p:nvGraphicFramePr", "p:cNvPr"]));
            let frame = node.child("p:xfrm").and_then(frame::read);
            let mut out = Vec::new();
            element(cx, &node, "pptx:chart", &nv, frame.as_ref(), None, &mut out);
            (out, cx.imp.warnings.count(), cx.imp.warnings.raw.len())
        },
    );
    assert_eq!((warnings, notes), (1, 1));
    let raw = raw_of(&out);
    assert_eq!(raw.original.as_deref(), Some("pptx:chart"));
    assert_eq!(
        (raw.base.x, raw.base.y, raw.base.w, raw.base.h),
        (Some(100.0), Some(100.0), Some(500.0), Some(300.0))
    );
    let alt = raw.base.alt.clone().unwrap_or_default();
    assert!(
        alt.starts_with("Sales") && alt.contains("PowerPoint chart"),
        "{alt}"
    );
    let xml = raw.xml.clone().unwrap_or_default();
    assert!(
        xml.starts_with("<p:graphicFrame xmlns:") && xml.contains(r#"r:id="rId2""#),
        "{xml}"
    );
    assert!(
        xml.contains("xmlns:c=") && xml.contains("xmlns:r="),
        "{xml}"
    );
    let kept = Kept::load(&raw.extra).unwrap_or_else(|| panic!("kept parts"));
    assert_eq!(kept.links.len(), 1);
    assert_eq!(kept.links[0].id, "rId2");
    let Target::Part(chart) = kept.links[0].to else {
        panic!("a part")
    };
    assert_eq!(kept.parts[chart].name, "ppt/charts/chart1.xml");
    assert_eq!(
        kept.parts[chart].links.len(),
        2,
        "its workbook, and an address"
    );
    let workbook = kept.parts[chart].links.iter().find_map(|l| match &l.to {
        Target::Part(at) => Some(*at),
        Target::External(_) => None,
    });
    assert_eq!(
        workbook.map(|at| kept.parts[at].data.clone()),
        Some(b"PK-workbook".to_vec())
    );
    assert!(
        kept.parts[chart]
            .links
            .iter()
            .any(|l| l.to == Target::External("https://example.com/data".into()))
    );
}

#[test]
fn a_smartart_diagrams_drawing_is_found_through_the_id_its_data_names() {
    let frame = format!(
        r#"<p:graphicFrame {NS}><p:nvGraphicFramePr><p:cNvPr id="5" name="Diagram 4"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="9525" cy="9525"/></p:xfrm>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" r:dm="rId3"/></a:graphicData></a:graphic></p:graphicFrame>"#
    );
    let node = xml(&frame);
    let data = br#"<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:extLst><a:ext xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="rId9"/></a:ext></dgm:extLst></dgm:dataModel>"#;
    let out = with_rels(
        &[
            ("ppt/diagrams/data1.xml", data),
            ("ppt/diagrams/drawing1.xml", b"<dsp:drawing/>"),
        ],
        &[
            ("rId3", "diagramData", "../diagrams/data1.xml"),
            ("rId9", "diagramDrawing", "../diagrams/drawing1.xml"),
        ],
        |cx| {
            let mut out = Vec::new();
            element(
                cx,
                &node,
                "pptx:smartart",
                &nv_of(None),
                None,
                None,
                &mut out,
            );
            out
        },
    );
    let kept = Kept::load(&raw_of(&out).extra).unwrap_or_else(|| panic!("kept parts"));
    let names: Vec<&str> = kept.parts.iter().map(|p| p.name.as_str()).collect();
    assert_eq!(
        names,
        ["ppt/diagrams/data1.xml", "ppt/diagrams/drawing1.xml"]
    );
    let ids: Vec<&str> = kept.links.iter().map(|l| l.id.as_str()).collect();
    assert_eq!(ids, ["rId3", "rId9"]);
}

#[test]
fn a_shape_with_nothing_to_point_at_keeps_only_its_xml() {
    let node = xml(
        r#"<p:sp><p:nvSpPr><p:cNvPr id="2" name="Freeform 1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:custGeom/></p:spPr></p:sp>"#,
    );
    let out = with_rels(&[], &[], |cx| {
        let mut out = Vec::new();
        element(
            cx,
            &node,
            "pptx:custom-shape",
            &nv_of(node.at(&["p:nvSpPr", "p:cNvPr"])),
            None,
            Some("assets/p.png".into()),
            &mut out,
        );
        out
    });
    let raw = raw_of(&out);
    assert!(raw.extra.is_empty());
    assert_eq!(raw.preview.as_deref(), Some("assets/p.png"));
    assert!(raw.xml.as_deref().unwrap_or_default().contains("custGeom"));
}

#[test]
fn a_link_back_into_the_presentation_is_not_part_of_the_object() {
    let node = xml(
        r#"<p:pic><p:nvPicPr><p:cNvPr id="3" name="x"><a:hlinkClick r:id="rId1" action="ppaction://hlinksldjump"/></p:cNvPr></p:nvPicPr></p:pic>"#,
    );
    let out = with_rels(
        &[("ppt/slides/slide2.xml", b"<p:sld/>")],
        &[("rId1", "slide", "slide2.xml")],
        |cx| {
            let mut out = Vec::new();
            element(
                cx,
                &node,
                "pptx:picture",
                &nv_of(None),
                None,
                None,
                &mut out,
            );
            out
        },
    );
    assert!(raw_of(&out).extra.is_empty());
}
