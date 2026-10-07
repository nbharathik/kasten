use super::*;
use crate::import::package::tests::zip_of;
use crate::import::package::{Limits, Package};

const A: &str = r#"xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships""#;

const TYPES: &[u8] =
    br#"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>"#;

fn rels(items: &[(&str, &str, &str)]) -> Vec<u8> {
    let body: String = items
        .iter()
        .map(|(id, kind, target)| {
            format!(r#"<Relationship Id="{id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/{kind}" Target="{target}"/>"#)
        })
        .collect();
    format!(r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{body}</Relationships>"#).into_bytes()
}

fn master_xml() -> String {
    format!(
        r#"<p:sldMaster {A}><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></p:bgPr></p:bg><p:spTree>
        <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
          <p:spPr><a:xfrm><a:off x="609600" y="342900"/><a:ext cx="7924800" cy="914400"/></a:xfrm></p:spPr>
          <p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:r><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody></p:sp>
        <p:sp><p:nvSpPr><p:cNvPr id="3" name="Bar"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr></p:sp>
        <p:sp><p:nvSpPr><p:cNvPr id="4" name="Text"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>
          <p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></a:lstStyle><a:p><a:r><a:t>Click to edit Master text styles</a:t></a:r></a:p></p:txBody></p:sp>
        </p:spTree></p:cSld>
        <p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
        <p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/><p:sldLayoutId id="2" r:id="rId9"/></p:sldLayoutIdLst>
        <p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:buChar char="x"/><a:defRPr sz="3200"/></a:lvl1pPr></p:bodyStyle></p:txStyles></p:sldMaster>"#
    )
}

fn layout_xml() -> String {
    format!(
        r#"<p:sldLayout {A} type="obj" showMasterSp="0"><p:cSld name="Title and Content"><p:spTree>
        <p:sp><p:nvSpPr><p:cNvPr id="2" name="T"/><p:cNvSpPr/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Click to add title</a:t></a:r></a:p></p:txBody></p:sp>
        <p:sp><p:nvSpPr><p:cNvPr id="3" name="B"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="95250" y="190500"/><a:ext cx="1905000" cy="952500"/></a:xfrm></p:spPr></p:sp>
        <p:sp><p:nvSpPr><p:cNvPr id="4" name="Logo"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp>
        </p:spTree></p:cSld></p:sldLayout>"#
    )
}

fn theme_xml() -> &'static str {
    r#"<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="T"><a:themeElements><a:clrScheme name="x"><a:dk1><a:srgbClr val="111111"/></a:dk1><a:lt1><a:srgbClr val="EEEEEE"/></a:lt1></a:clrScheme></a:themeElements></a:theme>"#
}

fn package() -> Vec<u8> {
    zip_of(&[
        ("[Content_Types].xml", TYPES),
        ("ppt/slideMasters/slideMaster1.xml", master_xml().as_bytes()),
        (
            "ppt/slideMasters/_rels/slideMaster1.xml.rels",
            &rels(&[
                ("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"),
                ("rId2", "theme", "../theme/theme1.xml"),
            ]),
        ),
        ("ppt/slideLayouts/slideLayout1.xml", layout_xml().as_bytes()),
        ("ppt/theme/theme1.xml", theme_xml().as_bytes()),
    ])
}

#[test]
fn a_master_gives_its_styles_slots_and_decorations() {
    let bytes = package();
    let mut pkg = Package::open(&bytes, Limits::default()).unwrap_or_else(|e| panic!("{e}"));
    let m = read_master(&mut pkg, "ppt/slideMasters/slideMaster1.xml", None)
        .unwrap_or_else(|| panic!("a master"));
    assert_eq!(m.theme.name, "T");
    assert_eq!(
        m.map,
        ColorMap::from_node(
            &crate::import::dom::parse(
                format!(r#"<p:clrMap {A} bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"/>"#).as_bytes()
            )
            .unwrap_or_else(|e| panic!("{e}"))
            .root
        )
    );
    assert_eq!(m.placeholders.len(), 2);
    let title = &m.placeholders[0];
    assert_eq!((title.class, title.idx), (PhClass::Title, None));
    assert_eq!(title.body.anchor, Some(slides_core::VAlign::Middle));
    assert_eq!(
        title.rect,
        Some(Rect {
            x: 64.0,
            y: 36.0,
            w: 832.0,
            h: 96.0
        })
    );
    assert_eq!(title.prompt, "Click to edit Master title style");
    let body = &m.placeholders[1];
    assert_eq!((body.class, body.idx), (PhClass::Body, Some(1)));
    assert_eq!(body.rect, None);
    assert_eq!(body.lst.level(0).run.size, Some(20.0));
    assert_eq!(
        m.decorations.len(),
        1,
        "the bar, which is not a placeholder"
    );
    assert_eq!(m.title.level(0).run.size, Some(44.0));
    assert_eq!(m.body.level(0).run.size, Some(32.0));
    assert!(m.background.is_some());
    assert_eq!(
        m.layouts,
        vec!["ppt/slideLayouts/slideLayout1.xml".to_owned()],
        "a layout that is not there is left out"
    );
}

#[test]
fn a_layout_gives_its_slots_its_name_and_whether_the_master_shows() {
    let bytes = package();
    let mut pkg = Package::open(&bytes, Limits::default()).unwrap_or_else(|e| panic!("{e}"));
    let m = read_master(&mut pkg, "ppt/slideMasters/slideMaster1.xml", None)
        .unwrap_or_else(|| panic!("a master"));
    let l = read_layout(&mut pkg, "ppt/slideLayouts/slideLayout1.xml", 0, &m, &m.map)
        .unwrap_or_else(|| panic!("a layout"));
    assert_eq!(l.label, "Title and Content");
    assert!(l.hide_master);
    assert_eq!(l.kind.as_deref(), Some("obj"));
    assert_eq!(l.placeholders.len(), 2);
    assert_eq!(l.placeholders[0].class, PhClass::Title);
    assert_eq!(
        (l.placeholders[1].class, l.placeholders[1].idx),
        (PhClass::Body, Some(1))
    );
    assert_eq!(
        l.placeholders[1].rect,
        Some(Rect {
            x: 10.0,
            y: 20.0,
            w: 200.0,
            h: 100.0
        })
    );
    assert_eq!(l.decorations.len(), 1);
    assert_eq!(l.map, m.map);
}
