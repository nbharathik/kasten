//! A picture that says it covers its box (the poster of a page or a video) is cut to the
//! shape of the box instead of being stretched to it.

use super::*;

/// A picture that fills its box without being stretched, as a poster does.
fn covering(src: &str, w: f64, h: f64) -> ImageEl {
    let mut el = image(src, Base::new("e-1").place(0.0, 0.0, w, h));
    el.cover();
    el
}

#[test]
fn a_picture_that_covers_a_wide_box_is_cut_at_the_top_and_bottom() {
    // 100 by 200 into a box twice as wide as it is tall: three quarters of the height go, half at each edge.
    let out = run(covering("assets/tall.png", 200.0, 100.0));
    assert!(
        out.xml
            .contains(r#"<a:srcRect l="0" t="37500" r="0" b="37500"/><a:stretch>"#),
        "{}",
        out.xml
    );
    assert!(
        out.xml.contains(r#"<a:picLocks noChangeAspect="1"/>"#),
        "what is left has the shape of the box: {}",
        out.xml
    );
    assert!(out.warnings.is_empty(), "{:?}", out.warnings);
}

#[test]
fn a_picture_that_covers_a_tall_box_is_cut_at_the_sides() {
    // 200 by 100 into a box half as wide as it is tall.
    let out = run(covering("assets/wide.png", 100.0, 200.0));
    assert!(
        out.xml
            .contains(r#"<a:srcRect l="37500" t="0" r="37500" b="0"/><a:stretch>"#),
        "{}",
        out.xml
    );
}

#[test]
fn a_picture_of_the_shape_of_its_box_is_not_cut() {
    let out = run(covering("assets/wide.png", 400.0, 200.0));
    assert!(!out.xml.contains("a:srcRect"), "{}", out.xml);
    assert!(
        out.xml.contains(r#"<a:picLocks noChangeAspect="1"/>"#),
        "{}",
        out.xml
    );
}

#[test]
fn a_picture_that_does_not_say_it_covers_is_still_stretched() {
    let out = run(image(
        "assets/tall.png",
        Base::new("e-1").place(0.0, 0.0, 200.0, 100.0),
    ));
    assert!(!out.xml.contains("a:srcRect"), "{}", out.xml);
    assert!(out.xml.contains("<a:picLocks/>"), "{}", out.xml);
}

#[test]
fn a_crop_of_its_own_comes_before_covering() {
    let mut el = covering("assets/wide.png", 100.0, 100.0);
    el.crop = Some(Crop {
        left: 0.1,
        top: 0.0,
        right: 0.1,
        bottom: 0.0,
        extra: Extra::new(),
    });
    let out = run(el);
    assert!(
        out.xml
            .contains(r#"<a:srcRect l="10000" t="0" r="10000" b="0"/><a:stretch>"#),
        "{}",
        out.xml
    );
}

#[test]
fn a_rounded_poster_is_cut_and_rounded() {
    let mut el = covering("assets/tall.png", 200.0, 100.0);
    el.mask = Some(Mask::RoundRect);
    let out = run(el);
    assert!(
        out.xml.contains(r#"<a:srcRect l="0" t="37500""#),
        "{}",
        out.xml
    );
    assert!(out.xml.contains(r#"prst="roundRect""#), "{}", out.xml);
}

#[test]
fn what_an_import_kept_is_never_cut() {
    // A preview picture has no say in how it fits: the mark belongs to pictures.
    let raw = Element::Raw(RawEl {
        base: Base::new("e-raw").place(0.0, 0.0, 200.0, 100.0),
        original: Some("pptx:chart".into()),
        xml: None,
        preview: Some("assets/tall.png".into()),
        extra: Extra::new(),
    });
    let out = run_element(raw, false);
    assert!(!out.xml.contains("a:srcRect"), "{}", out.xml);
}
