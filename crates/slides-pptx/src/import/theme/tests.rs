use super::*;
use crate::import::master::{read_layout, read_master};
use crate::import::testing::package;

const A: &str = r#"xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships""#;

fn rels(items: &[(&str, &str, &str)]) -> String {
    let body: String = items
        .iter()
        .map(|(id, kind, target)| format!(r#"<Relationship Id="{id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/{kind}" Target="{target}"/>"#))
        .collect();
    format!(
        r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{body}</Relationships>"#
    )
}

fn ph(
    kind: &str,
    idx: Option<u32>,
    prompt: &str,
    xfrm: Option<(i64, i64, i64, i64)>,
    lst: &str,
) -> String {
    let idx = idx.map_or(String::new(), |i| format!(r#" idx="{i}""#));
    let xfrm = xfrm.map_or("<p:spPr/>".to_owned(), |(x, y, w, h)| format!(r#"<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm></p:spPr>"#));
    format!(
        r#"<p:sp><p:nvSpPr><p:cNvPr id="2" name="p"/><p:cNvSpPr/><p:nvPr><p:ph type="{kind}"{idx}/></p:nvPr></p:nvSpPr>{xfrm}<p:txBody><a:bodyPr/>{lst}<a:p><a:r><a:t>{prompt}</a:t></a:r></a:p></p:txBody></p:sp>"#
    )
}

fn build_from(layout_shapes: &[(&str, String)]) -> (Built, Vec<LayoutInfo>) {
    let master = format!(
        r#"<p:sldMaster {A}><p:cSld><p:spTree>{}{}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"/>
        <p:sldLayoutIdLst>{}</p:sldLayoutIdLst>
        <p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4000" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>
        <p:bodyStyle><a:lvl1pPr><a:buChar char="x"/><a:defRPr sz="2800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle></p:txStyles></p:sldMaster>"#,
        ph(
            "title",
            None,
            "Master title",
            Some((609600, 342900, 7924800, 914400)),
            ""
        ),
        ph(
            "body",
            Some(1),
            "Master text",
            Some((609600, 1600200, 7924800, 4525963)),
            ""
        ),
        (1..=layout_shapes.len())
            .map(|n| format!(r#"<p:sldLayoutId id="{n}" r:id="rId{n}"/>"#))
            .collect::<String>(),
    );
    let mut layout_rels = Vec::new();
    let mut parts: Vec<(String, Vec<u8>)> = vec![(
        "ppt/slideMasters/slideMaster1.xml".into(),
        master.into_bytes(),
    )];
    for (n, (label, shapes)) in layout_shapes.iter().enumerate() {
        parts.push((format!("ppt/slideLayouts/slideLayout{}.xml", n + 1), format!(r#"<p:sldLayout {A}><p:cSld name="{label}"><p:spTree>{shapes}</p:spTree></p:cSld></p:sldLayout>"#).into_bytes()));
        layout_rels.push((
            format!("rId{}", n + 1),
            "slideLayout",
            format!("../slideLayouts/slideLayout{}.xml", n + 1),
        ));
    }
    let items: Vec<(&str, &str, &str)> = layout_rels
        .iter()
        .map(|(a, b, c)| (a.as_str(), *b, c.as_str()))
        .collect();
    parts.push((
        "ppt/slideMasters/_rels/slideMaster1.xml.rels".into(),
        rels(&items).into_bytes(),
    ));
    let refs: Vec<(&str, &[u8])> = parts
        .iter()
        .map(|(n, b)| (n.as_str(), b.as_slice()))
        .collect();
    let mut pkg = package(&refs);
    let m = read_master(&mut pkg, "ppt/slideMasters/slideMaster1.xml", None)
        .unwrap_or_else(|| panic!("master"));
    let mut layouts: Vec<LayoutInfo> = m
        .layouts
        .clone()
        .iter()
        .map(|p| read_layout(&mut pkg, p, 0, &m, &m.map).unwrap_or_else(|| panic!("layout")))
        .collect();
    let built = build(
        std::slice::from_ref(&m),
        &mut layouts,
        &Levels::empty(),
        (960.0, 540.0),
    );
    (built, layouts)
}

#[test]
fn the_masters_title_and_body_styles_are_the_decks() {
    let (built, _) = build_from(&[("Blank", String::new())]);
    let title = &built.theme.text_styles["title"];
    assert_eq!(
        (
            title.size,
            title.bold,
            title.font.as_str(),
            title.color.as_str()
        ),
        (40.0, true, "heading", "text1")
    );
    let body = &built.theme.text_styles["body"];
    assert_eq!(
        (body.size, body.bold, body.font.as_str()),
        (28.0, false, "body")
    );
    assert!(
        built.theme.text_styles.contains_key("caption"),
        "the built-in styles an editor expects are there"
    );
    assert_eq!(built.theme.colors.text1, "#000000");
    assert_eq!(built.theme.fonts.body.family, "Calibri");
    assert_eq!(built.theme.fonts.body.fallback[0], "Carlito");
}

#[test]
fn a_layout_gets_a_name_from_its_label_and_slots_with_roles_boxes_and_styles() {
    let (built, layouts) = build_from(&[
        (
            "Title + body",
            [
                ph("title", None, "Click to add title", None, ""),
                ph(
                    "body",
                    Some(1),
                    "Click to add text",
                    Some((95250, 190500, 1905000, 952500)),
                    "",
                ),
                ph("dt", Some(10), "date", None, ""),
            ]
            .concat(),
        ),
        (
            "Two columns",
            [
                ph("title", None, "Click to add title", None, ""),
                ph("body", Some(1), "Click to add text", None, ""),
                ph("body", Some(2), "Click to add text", None, ""),
            ]
            .concat(),
        ),
    ]);
    assert_eq!(built.names, ["title-body", "two-columns"]);
    let l = &built.theme.layouts[0];
    assert_eq!(l.label, "Title + body");
    assert_eq!(l.placeholders.len(), 2, "a footer slot is not modelled");
    let title = &l.placeholders[0];
    assert_eq!(
        (title.role.as_str(), title.style.as_deref()),
        ("title", Some("title"))
    );
    assert_eq!(
        (title.x, title.y, title.w, title.h),
        (64.0, 36.0, 832.0, 96.0),
        "the master's box"
    );
    let body = &l.placeholders[1];
    assert_eq!(
        (body.role.as_str(), body.list.clone(), body.kind.clone()),
        ("body", Some(ListKind::Bullet), PlaceholderKind::Text)
    );
    assert_eq!(
        (body.x, body.y, body.w, body.h),
        (10.0, 20.0, 200.0, 100.0),
        "its own box"
    );
    let two = &built.theme.layouts[1];
    let roles: Vec<&str> = two.placeholders.iter().map(|p| p.role.as_str()).collect();
    assert_eq!(roles, ["title", "body", "body2"]);
    assert_eq!(layouts[0].placeholders[1].role.as_deref(), Some("body"));
    assert_eq!(layouts[0].placeholders[2].role, None);
}

#[test]
fn a_slot_set_differently_gets_a_style_of_its_own_and_prompts_can_name_the_role() {
    let subtitle = r#"<a:lstStyle><a:lvl1pPr algn="ctr"><a:buNone/><a:defRPr sz="3200"/></a:lvl1pPr></a:lstStyle>"#;
    let (built, _) = build_from(&[(
        "Title",
        [
            ph(
                "ctrTitle",
                None,
                "Click to add title",
                None,
                r#"<a:lstStyle><a:lvl1pPr><a:defRPr sz="6000"/></a:lvl1pPr></a:lstStyle>"#,
            ),
            ph("subTitle", Some(1), "Click to add subtitle", None, subtitle),
            ph("body", Some(2), "Click to add caption", None, ""),
            ph("body", Some(3), "Click to add label", None, ""),
            ph("body", Some(4), "Click to add label", None, ""),
        ]
        .concat(),
    )]);
    let l = &built.theme.layouts[0];
    assert_eq!(
        l.placeholders[0].style.as_deref(),
        Some("display"),
        "bigger than the master's title"
    );
    assert_eq!(built.theme.text_styles["display"].size, 60.0);
    assert_eq!(l.placeholders[1].style.as_deref(), Some("subtitle"));
    assert_eq!(built.theme.text_styles["subtitle"].size, 32.0);
    assert_eq!(
        built.theme.text_styles["subtitle"].align,
        Some(slides_core::Align::Center)
    );
    assert_eq!(l.placeholders[1].list, None);
    let roles: Vec<&str> = l.placeholders.iter().map(|p| p.role.as_str()).collect();
    assert_eq!(roles, ["title", "subtitle", "caption", "label", "label2"]);
}

#[test]
fn a_deck_with_no_layouts_gets_a_blank_one_and_names_never_repeat() {
    let (built, _) = build_from(&[]);
    assert_eq!(built.names, ["blank"]);
    let (built, _) = build_from(&[
        ("Same", String::new()),
        ("Same", String::new()),
        ("", String::new()),
    ]);
    assert_eq!(built.names, ["same", "same-2", "layout"]);
    assert_eq!(slug("Title + body"), "title-body");
    assert_eq!(slug("  Über  Alles! "), "über-alles");
}
