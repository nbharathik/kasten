use super::*;

fn bounds() -> Rect {
    Rect {
        x: 10.0,
        y: 10.0,
        w: 100.0,
        h: 50.0,
    }
}

#[test]
fn parts_are_numbered_in_order_and_a_skipped_number_stays_unused() {
    let mut parts = Parts::new("e-1", bounds());
    parts.text(bounds(), plain_text("a"));
    parts.skip();
    parts.text(bounds(), plain_text("b"));
    let ids: Vec<String> = parts.finish().iter().map(|p| p.id().to_owned()).collect();
    assert_eq!(ids, ["e-1.1", "e-1.3"]);
}

#[test]
fn parts_are_rounded_and_cut_to_the_box_unless_they_may_pass_it() {
    let mut parts = Parts::new("e-1", bounds());
    parts.text(
        Rect {
            x: 0.0,
            y: 0.0,
            w: 500.0,
            h: 500.0,
        },
        plain_text("a"),
    );
    parts.text(
        Rect {
            x: 10.004,
            y: 10.0,
            w: 33.333_333,
            h: 5.0,
        },
        plain_text("b"),
    );
    let out = parts.finish();
    assert_eq!(out[0].base().rect(), Some((10.0, 10.0, 100.0, 50.0)));
    // The edges are rounded, not the size: 10.004 to 43.337 is 10 to 43.34.
    assert_eq!(out[1].base().rect(), Some((10.0, 10.0, 33.34, 5.0)));
    let mut free = Parts::unbounded("e-1");
    free.text(
        Rect {
            x: 0.0,
            y: 0.0,
            w: 500.0,
            h: 500.0,
        },
        plain_text("a"),
    );
    assert_eq!(
        free.finish()[0].base().rect(),
        Some((0.0, 0.0, 500.0, 500.0))
    );
}

#[test]
fn builders_set_what_they_say() {
    let style = filled("bg2")
        .radius(12.0)
        .stroke("text2", 1.0)
        .stroke_alpha(0.5)
        .dashed();
    assert_eq!(style.radius, Some(12.0));
    let stroke = style
        .stroke
        .as_ref()
        .map(|s| (s.width, s.alpha, s.dash.is_some()));
    assert_eq!(stroke, Some((Some(1.0), Some(0.5), true)));
    let r = run("x", 14.0).color("accent1").bold().font("code");
    assert_eq!(
        (r.size, r.bold, r.font.as_deref()),
        (Some(14.0), true, Some("code"))
    );
    let p = para(vec![r])
        .style("code")
        .spacing(1.3)
        .after(2.0)
        .align(Align::Right);
    assert_eq!(
        (p.style.as_deref(), p.line_spacing, p.space_after),
        (Some("code"), Some(1.3), Some(2.0))
    );
    assert_eq!(shown(""), " ");
    assert_eq!(shown("x"), "x");
}
