use slides_core::{Base, Element, Extra, ImageEl};

use super::*;
use crate::elements::xml_of;
use crate::samples;
use crate::testing::{MapMedia, deck, with_deck};

const PATH: &str = "math/5236592fa920b5e6.png";

fn formula(alt: Option<&str>, w: f64, h: f64) -> Element {
    let mut base = Base::new("e-math.1").place(100.0, 50.0, w, h);
    base.alt = alt.map(str::to_owned);
    Element::Image(ImageEl {
        base,
        src: PATH.into(),
        crop: None,
        mask: None,
        extra: Extra::new(),
    })
}

struct Out {
    xml: String,
    warnings: Vec<String>,
}

fn export(element: &Element, media: &MapMedia) -> Out {
    with_deck(&deck(), media, |cx| Out {
        xml: xml_of(cx, element),
        warnings: cx
            .shared
            .warnings
            .iter()
            .map(|w| w.message.clone())
            .collect(),
    })
}

#[test]
fn only_paths_the_deck_names_math_are_formulas() {
    assert!(is_formula("math/abc.png"));
    assert!(is_formula("  math/abc.png"));
    assert!(!is_formula("assets/math/abc.png"));
    assert!(!is_formula("assets/figure.png"));
    assert!(!is_formula(""));
}

#[test]
fn a_formula_without_its_picture_is_its_latex_as_italic_centred_text() {
    let out = export(
        &formula(Some("\\frac{a}{b} + x^2"), 400.0, 100.0),
        &MapMedia::default(),
    );
    assert!(
        out.xml.starts_with("<p:sp>") && !out.xml.contains("<p:pic>"),
        "{}",
        out.xml
    );
    assert!(out.xml.contains(r#"txBox="1""#), "a text box: {}", out.xml);
    assert!(
        out.xml.contains("<a:t>\\frac{a}{b} + x^2</a:t>"),
        "{}",
        out.xml
    );
    assert!(out.xml.contains(r#"i="1""#), "italic: {}", out.xml);
    assert!(
        out.xml.contains(r#"algn="ctr""#) && out.xml.contains(r#"anchor="ctr""#),
        "centred: {}",
        out.xml
    );
    assert!(
        out.xml.contains(r#"<a:schemeClr val="tx1"/>"#),
        "the theme's text colour: {}",
        out.xml
    );
    assert!(
        out.xml.contains(r#"descr="\frac{a}{b} + x^2""#),
        "the alt text stays: {}",
        out.xml
    );
    assert!(
        !out.xml.contains(r#"<a:alpha val="25000"/>"#),
        "not the grey stand-in: {}",
        out.xml
    );
    assert!(
        out.xml
            .contains(r#"<a:off x="952500" y="476250"/><a:ext cx="3810000" cy="952500"/>"#),
        "in the picture's box: {}",
        out.xml
    );
}

#[test]
fn the_export_says_the_picture_was_missing_and_what_was_done() {
    let out = export(&formula(Some("x^2"), 400.0, 100.0), &MapMedia::default());
    assert_eq!(out.warnings.len(), 1, "{:?}", out.warnings);
    let warning = &out.warnings[0];
    assert!(
        warning.contains(PATH) && warning.contains("not found"),
        "{warning}"
    );
    assert!(warning.contains("LaTeX"), "{warning}");
    assert!(
        warning.contains("picture"),
        "so the fixture check that lists what is expected still passes"
    );
}

#[test]
fn with_its_picture_a_formula_is_a_picture() {
    let mut media = MapMedia::default();
    media
        .0
        .insert(PATH.into(), samples::solid(1200, 300, [0, 0, 0]));
    let out = export(&formula(Some("x^2"), 400.0, 100.0), &media);
    assert!(out.xml.starts_with("<p:pic>"), "{}", out.xml);
    assert!(out.warnings.is_empty(), "{:?}", out.warnings);
}

#[test]
fn a_formula_with_no_source_text_is_the_grey_box_it_always_was() {
    for alt in [None, Some(""), Some("   ")] {
        let out = export(&formula(alt, 400.0, 100.0), &MapMedia::default());
        assert!(
            out.xml.starts_with("<p:sp>") && !out.xml.contains("txBox"),
            "{alt:?}: {}",
            out.xml
        );
        assert!(
            out.xml.contains(r#"<a:alpha val="25000"/>"#),
            "{alt:?}: {}",
            out.xml
        );
        assert!(out.warnings[0].contains("grey box"), "{:?}", out.warnings);
    }
}

#[test]
fn a_picture_that_is_not_a_formula_still_gets_the_grey_box_even_with_alt_text() {
    let mut base = Base::new("e-1").place(0.0, 0.0, 100.0, 50.0);
    base.alt = Some("A figure".into());
    let picture = Element::Image(ImageEl {
        base,
        src: "assets/figure.png".into(),
        crop: None,
        mask: None,
        extra: Extra::new(),
    });
    let out = export(&picture, &MapMedia::default());
    assert!(!out.xml.contains("txBox"), "{}", out.xml);
    assert!(out.warnings[0].contains("grey box"));
}

#[test]
fn source_that_looks_like_markup_is_escaped() {
    let out = export(
        &formula(Some("a < b & \"c\""), 400.0, 100.0),
        &MapMedia::default(),
    );
    assert!(out.xml.contains("a &lt; b &amp; "), "{}", out.xml);
    assert!(!out.xml.contains("a < b"), "{}", out.xml);
}

#[test]
fn the_source_shrinks_to_fit_its_box_and_stops_at_ten_points() {
    let short = size_for("x^2", 400.0, 100.0);
    assert_eq!(short, 32.0);
    let long = size_for(&"x + ".repeat(20), 400.0, 100.0);
    assert!((10.0..32.0).contains(&long), "{long}");
    assert_eq!(size_for(&"x".repeat(1000), 400.0, 100.0), 10.0);
    assert_eq!(size_for("x", 10.0, 10.0), 10.0);
    assert!(
        size_for("x^2", 400.0, 20.0) < 32.0,
        "a short box needs smaller type"
    );
}

#[test]
fn the_same_formula_gives_the_same_bytes() {
    let element = formula(Some("\\int_0^1 x\\,dx"), 400.0, 100.0);
    let a = export(&element, &MapMedia::default()).xml;
    let b = export(&element, &MapMedia::default()).xml;
    assert_eq!(a, b);
}
