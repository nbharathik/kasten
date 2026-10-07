use super::*;
use crate::import::testing::{NS, package};

const P14: &str = r#"xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main""#;

fn rels(items: &[(&str, &str, &str)]) -> String {
    let body: String = items
        .iter()
        .map(|(id, kind, target)| format!(r#"<Relationship Id="{id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/{kind}" Target="{target}"/>"#))
        .collect();
    format!(
        r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{body}</Relationships>"#
    )
}

#[test]
fn the_size_the_slides_the_masters_and_the_sections_are_read() {
    let pres = format!(
        r#"<p:presentation {NS} {P14}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
        <p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/><p:sldId id="258" r:id="rId9"/></p:sldIdLst>
        <p:sldSz cx="12192000" cy="6858000"/>
        <p:defaultTextStyle><a:lvl1pPr/></p:defaultTextStyle>
        <p:extLst><p:ext uri="{{521415D9-36F7-43E2-AB2F-B90AF26B5E84}}"><p14:sectionLst>
          <p14:section name="Intro" id="{{1}}"><p14:sldIdLst><p14:sldId id="256"/></p14:sldIdLst></p14:section>
          <p14:section name="Rest" id="{{2}}"><p14:sldIdLst><p14:sldId id="257"/><p14:sldId id="258"/></p14:sldIdLst></p14:section>
        </p14:sectionLst></p:ext></p:extLst></p:presentation>"#
    );
    let r = rels(&[
        ("rId1", "slideMaster", "slideMasters/slideMaster1.xml"),
        ("rId2", "slide", "slides/slide1.xml"),
        ("rId3", "slide", "slides/slide2.xml"),
        ("rId9", "slide", "slides/gone.xml"),
    ]);
    let root = rels(&[("rId1", "officeDocument", "ppt/presentation.xml")]);
    let mut pkg = package(&[
        ("_rels/.rels", root.as_bytes()),
        ("ppt/presentation.xml", pres.as_bytes()),
        ("ppt/_rels/presentation.xml.rels", r.as_bytes()),
        ("ppt/slides/slide1.xml", b"<p:sld/>"),
        ("ppt/slides/slide2.xml", b"<p:sld/>"),
        ("ppt/slideMasters/slideMaster1.xml", b"<p:sldMaster/>"),
    ]);
    let p = read(&mut pkg).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(p.size, Some((1280.0, 720.0)));
    let parts: Vec<&str> = p.slides.iter().map(|s| s.part.as_str()).collect();
    assert_eq!(
        parts,
        ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml"],
        "a slide whose part is missing is not listed"
    );
    assert_eq!(p.slides[1].number, 257);
    assert_eq!(p.masters, ["ppt/slideMasters/slideMaster1.xml"]);
    assert_eq!(
        p.sections,
        [
            ("Intro".to_owned(), vec![256]),
            ("Rest".to_owned(), vec![257, 258])
        ]
    );
    assert!(p.default_text.is_some());
    assert_eq!(numbers(&p.slides)[&257], 1);
}

#[test]
fn a_presentation_with_no_size_or_list_is_still_read_and_a_missing_one_is_an_error() {
    let pres = format!(r#"<p:presentation {NS}/>"#);
    let mut pkg = package(&[("ppt/presentation.xml", pres.as_bytes())]);
    let p = read(&mut pkg).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!((p.size, p.slides.len(), p.masters.len()), (None, 0, 0));
    let mut none = package(&[]);
    assert!(read(&mut none).is_err());
}
