use super::*;
use crate::import::dom;

fn node(xml: &str) -> Node {
    dom::parse(xml.as_bytes())
        .unwrap_or_else(|e| panic!("{e}"))
        .root
}

fn resolve(xml: &str) -> Paint {
    let palette = Palette::default();
    let map = ColorMap::standard();
    let cx = ColorCx {
        palette: &palette,
        map: &map,
        deck_map: &map,
    };
    cx.resolve(&node(xml), None)
        .unwrap_or_else(|| panic!("no colour in {xml}"))
}

const NS: &str = r#"xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main""#;

#[test]
fn rgb_and_system_and_preset_colours_are_hex() {
    assert_eq!(
        resolve(&format!(r#"<a:srgbClr {NS} val="1A73E8"/>"#)).value,
        "#1a73e8"
    );
    assert_eq!(
        resolve(&format!(
            r#"<a:sysClr {NS} val="windowText" lastClr="101010"/>"#
        ))
        .value,
        "#101010"
    );
    assert_eq!(
        resolve(&format!(r#"<a:prstClr {NS} val="red"/>"#)).value,
        "#ff0000"
    );
}

#[test]
fn a_scheme_colour_with_nothing_done_to_it_is_the_decks_token() {
    for (theme, token) in [
        ("tx1", "text1"),
        ("bg1", "bg1"),
        ("tx2", "text2"),
        ("bg2", "bg2"),
        ("accent3", "accent3"),
        ("dk1", "text1"),
        ("lt1", "bg1"),
    ] {
        let p = resolve(&format!(r#"<a:schemeClr {NS} val="{theme}"/>"#));
        assert_eq!(p, Paint::solid(token), "{theme}");
    }
    // Link colours have no token.
    assert_eq!(
        resolve(&format!(r#"<a:schemeClr {NS} val="hlink"/>"#)).value,
        "#0000ff"
    );
}

#[test]
fn alpha_stays_alpha_and_other_modifiers_make_the_colour_hex() {
    let p = resolve(&format!(
        r#"<a:schemeClr {NS} val="accent1"><a:alpha val="30000"/></a:schemeClr>"#
    ));
    assert_eq!(
        p,
        Paint {
            value: "accent1".into(),
            alpha: Some(0.3)
        }
    );
    let p = resolve(&format!(
        r#"<a:schemeClr {NS} val="tx1"><a:tint val="75000"/></a:schemeClr>"#
    ));
    assert_eq!(p.value, "#898989", "the grey of a default footer");
    let p = resolve(&format!(
        r#"<a:srgbClr {NS} val="FF0000"><a:lumMod val="50000"/></a:srgbClr>"#
    ));
    assert_eq!(p.value, "#800000");
    let p = resolve(&format!(
        r#"<a:srgbClr {NS} val="000000"><a:lumMod val="50000"/><a:lumOff val="50000"/></a:srgbClr>"#
    ));
    assert_eq!(p.value, "#808080", "modifiers apply in order");
    let p = resolve(&format!(
        r#"<a:srgbClr {NS} val="FFFFFF"><a:shade val="50000"/></a:srgbClr>"#
    ));
    assert_eq!(p.value, "#bcbcbc");
}

#[test]
fn placeholder_colour_takes_the_colour_a_style_reference_gives() {
    let palette = Palette::default();
    let map = ColorMap::standard();
    let cx = ColorCx {
        palette: &palette,
        map: &map,
        deck_map: &map,
    };
    let ph = Paint {
        value: "accent2".into(),
        alpha: Some(0.5),
    };
    let n = node(&format!(
        r#"<a:schemeClr {NS} val="phClr"><a:tint val="50000"/></a:schemeClr>"#
    ));
    let p = cx
        .resolve(&n, Some(&ph))
        .unwrap_or_else(|| panic!("colour"));
    assert!(p.value.starts_with('#'));
    assert_eq!(p.alpha, Some(0.5));
    let plain = node(&format!(r#"<a:schemeClr {NS} val="phClr"/>"#));
    assert_eq!(cx.resolve(&plain, Some(&ph)), Some(ph));
}

#[test]
fn an_inverted_mapping_swaps_which_slot_text_and_page_are() {
    let palette = Palette::default();
    let inverted = ColorMap::from_node(&node(
        r#"<p:clrMap xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"/>"#,
    ));
    let cx = ColorCx {
        palette: &palette,
        map: &inverted,
        deck_map: &inverted,
    };
    let colors = cx.deck_colors();
    assert_eq!(colors[0], ("text1", Rgb(255, 255, 255)));
    assert_eq!(colors[2], ("bg1", Rgb(0, 0, 0)));
    // dk1 is the page here, so it is the bg1 token.
    let dk1 = node(&format!(r#"<a:schemeClr {NS} val="dk1"/>"#));
    assert_eq!(cx.resolve(&dk1, None), Some(Paint::solid("bg1")));
}

#[test]
fn a_part_with_its_own_mapping_gets_hex_where_the_decks_token_would_lie() {
    let palette = Palette::default();
    let deck = ColorMap::standard();
    let own = ColorMap::from_node(&node(
        r#"<a:overrideClrMapping xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"/>"#,
    ));
    let cx = ColorCx {
        palette: &palette,
        map: &own,
        deck_map: &deck,
    };
    // tx1 in this part is light 1, which the deck calls bg1.
    let tx1 = node(&format!(r#"<a:schemeClr {NS} val="tx1"/>"#));
    assert_eq!(cx.resolve(&tx1, None), Some(Paint::solid("bg1")));
}

#[test]
fn hsl_and_averages_round_trip() {
    let (h, s, l) = modify::to_hsl(Rgb(0x1a, 0x73, 0xe8));
    assert_eq!(modify::from_hsl(h, s, l), Rgb(0x1a, 0x73, 0xe8));
    assert_eq!(
        modify::average(&[(Rgb(0, 0, 0), 1.0), (Rgb(200, 100, 50), 1.0)]),
        Some(Rgb(100, 50, 25))
    );
    assert_eq!(Rgb::from_hex("#abc"), Some(Rgb(0xaa, 0xbb, 0xcc)));
    assert_eq!(Rgb::from_hex("nothex"), None);
}
