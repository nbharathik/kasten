use super::*;
use crate::import::color::{ColorMap, Palette};
use crate::import::dom;

fn parse(xml: &str) -> Node {
    dom::parse(
        format!(r#"<x xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">{xml}</x>"#)
            .as_bytes(),
    )
    .unwrap_or_else(|e| panic!("{e}"))
    .root
}

fn with_reader<T>(f: impl FnOnce(&Reader) -> T) -> T {
    let palette = Palette::default();
    let map = ColorMap::standard();
    let fonts = FontNames {
        heading: "Cambria".into(),
        body: "Calibri".into(),
    };
    let reader = Reader {
        colors: ColorCx {
            palette: &palette,
            map: &map,
            deck_map: &map,
        },
        fonts: &fonts,
    };
    f(&reader)
}

#[test]
fn a_run_says_only_what_the_file_says() {
    let n = parse(
        r#"<a:rPr lang="en-US" sz="2400" b="1" i="0" u="sng" strike="noStrike" baseline="30000"><a:solidFill><a:schemeClr val="accent2"/></a:solidFill><a:latin typeface="+mj-lt"/></a:rPr>"#,
    );
    let p = with_reader(|r| run_props(n.child("a:rPr").unwrap_or(&n), r, None));
    assert_eq!(p.size, Some(24.0));
    assert_eq!(
        (p.bold, p.italic, p.underline, p.strike),
        (Some(true), Some(false), Some(true), Some(false))
    );
    assert_eq!(p.color, Some(Paint::solid("accent2")));
    assert_eq!(p.font.as_deref(), Some("heading"));
    assert_eq!(p.baseline, Some(30000));
    let none = with_reader(|r| run_props(&parse(r#"<a:rPr/>"#), r, None));
    assert_eq!(none, RunProps::default());
}

#[test]
fn a_typeface_that_is_a_theme_font_is_the_role_and_others_are_kept() {
    let read = |xml: &str| {
        let n = parse(xml);
        with_reader(|r| run_props(n.child("a:rPr").unwrap_or(&n), r, None).font)
    };
    assert_eq!(
        read(r#"<a:rPr><a:latin typeface="Calibri"/></a:rPr>"#).as_deref(),
        Some("body")
    );
    assert_eq!(
        read(r#"<a:rPr><a:latin typeface="cambria"/></a:rPr>"#).as_deref(),
        Some("heading")
    );
    assert_eq!(
        read(r#"<a:rPr><a:latin typeface="Georgia"/></a:rPr>"#).as_deref(),
        Some("Georgia")
    );
    assert_eq!(
        read(r#"<a:rPr><a:latin typeface="+mn-lt"/></a:rPr>"#).as_deref(),
        Some("body")
    );
    assert_eq!(read(r#"<a:rPr><a:latin typeface=""/></a:rPr>"#), None);
}

#[test]
fn a_paragraph_reads_alignment_spacing_and_bullet() {
    let n = parse(
        r#"<a:pPr algn="ctr" lvl="1"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1000"/></a:spcBef><a:spcAft><a:spcPct val="20000"/></a:spcAft><a:buAutoNum type="arabicPeriod"/></a:pPr>"#,
    );
    let l = with_reader(|r| level(n.child("a:pPr").unwrap_or(&n), r, None));
    assert_eq!(l.align, Some(Align::Center));
    assert_eq!(l.line, Some(Spacing::Percent(0.9)));
    assert_eq!(l.before, Some(Spacing::Points(10.0)));
    assert_eq!(l.after, Some(Spacing::Percent(0.2)));
    assert_eq!(l.bullet, Some(Bullet::Number));
    let none = parse(r#"<a:pPr><a:buNone/></a:pPr>"#);
    let plain = with_reader(|r| level(none.child("a:pPr").unwrap_or(&none), r, None));
    assert_eq!(plain.bullet, Some(Bullet::None));
}

#[test]
fn a_list_style_has_nine_levels_and_the_default_fills_the_gaps() {
    let n = parse(
        r#"<a:lstStyle><a:defPPr algn="r"><a:defRPr sz="1800"/></a:defPPr><a:lvl1pPr algn="l"><a:defRPr sz="3200" b="1"/></a:lvl1pPr><a:lvl3pPr><a:buChar char="x"/></a:lvl3pPr></a:lstStyle>"#,
    );
    let levels = with_reader(|r| list_style(n.child("a:lstStyle").unwrap_or(&n), r, None));
    assert_eq!(levels.0.len(), 9);
    assert_eq!(levels.level(0).align, Some(Align::Left));
    assert_eq!(levels.level(0).run.size, Some(32.0));
    assert_eq!(levels.level(0).run.bold, Some(true));
    assert_eq!(
        levels.level(1).align,
        Some(Align::Right),
        "from the default"
    );
    assert_eq!(levels.level(1).run.size, Some(18.0));
    assert_eq!(levels.level(2).bullet, Some(Bullet::Char));
    assert_eq!(levels.level(30), Level::default());
}

#[test]
fn a_property_left_open_is_found_lower_down() {
    let top = Level {
        run: RunProps {
            size: Some(20.0),
            ..RunProps::default()
        },
        ..Level::default()
    };
    let below = Level {
        align: Some(Align::Center),
        run: RunProps {
            size: Some(10.0),
            bold: Some(true),
            ..RunProps::default()
        },
        ..Level::default()
    };
    let merged = top.over(&below);
    assert_eq!(merged.run.size, Some(20.0));
    assert_eq!(merged.run.bold, Some(true));
    assert_eq!(merged.align, Some(Align::Center));
}
