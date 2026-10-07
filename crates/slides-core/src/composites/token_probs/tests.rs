use super::*;
use crate::composites::expand as expand_element;
use crate::model::{Base, Extra};

fn next(token: &str, p: f64) -> NextToken {
    NextToken {
        token: token.to_owned(),
        p,
        extra: Extra::new(),
    }
}

fn probs(
    tokens: &[&str],
    candidates: Vec<NextToken>,
    chosen: Option<u32>,
    w: f64,
    h: f64,
) -> TokenProbsEl {
    TokenProbsEl {
        base: Base::new("e-tp").place(64.0, 148.0, w, h),
        tokens: tokens.iter().map(|t| (*t).to_owned()).collect(),
        next: candidates,
        chosen,
        extra: Extra::new(),
    }
}

fn parts_of(el: TokenProbsEl) -> Vec<Element> {
    let theme = crate::themes::light();
    expand_element(&theme, "blank", &Element::TokenProbs(el)).unwrap_or_default()
}

fn cat() -> TokenProbsEl {
    probs(
        &["The", " cat", " sat", " on", " the"],
        vec![
            next(" mat", 0.42),
            next(" floor", 0.3),
            next(" sofa", 0.14),
            next(" bed", 0.09),
            next(" roof", 0.05),
        ],
        Some(0),
        832.0,
        344.0,
    )
}

fn shapes(parts: &[Element]) -> Vec<&crate::model::ShapeEl> {
    parts
        .iter()
        .filter_map(|p| {
            if let Element::Shape(s) = p {
                Some(s)
            } else {
                None
            }
        })
        .collect()
}

/// Whether a shape is a bar: filled with an accent colour, not the grey of a chip or a track.
fn is_accent(shape: &crate::model::ShapeEl) -> bool {
    shape
        .base
        .style
        .as_ref()
        .and_then(|s| s.fill.as_ref())
        .is_some_and(|f| f.color.starts_with("accent"))
}

fn tracks(parts: &[Element]) -> Vec<&crate::model::ShapeEl> {
    shapes(parts)
        .into_iter()
        .filter(|s| {
            let style = s.base.style.as_ref();
            style.is_some_and(|st| st.stroke.is_none())
                && style
                    .and_then(|st| st.fill.as_ref())
                    .is_some_and(|f| f.color == "bg2")
        })
        .collect()
}

fn texts(parts: &[Element]) -> Vec<String> {
    parts
        .iter()
        .filter_map(|p| p.text().map(|t| t.plain_text()))
        .collect()
}

#[test]
fn whitespace_is_made_visible_and_percentages_are_short() {
    assert_eq!(visible(" cat"), "\u{b7}cat");
    assert_eq!(visible("a\nb\t"), "a\\nb\\t");
    assert_eq!(visible(""), "\"\"");
    assert_eq!(percent(0.425), "42.5%");
    assert_eq!(percent(0.3), "30%");
    assert_eq!(percent(0.072), "7.2%");
    assert_eq!(percent(1.0), "100%");
    assert_eq!(percent(0.0), "0%");
    assert_eq!(probability(f64::NAN), 0.0);
    assert_eq!(probability(-0.5), 0.0);
    assert_eq!(probability(7.0), 1.0);
    assert_eq!(cut("abcdefghijklmnopqrstuvwxyz", 8), "abcdefg\u{2026}");
    assert_eq!(cut("short", 8), "short");
}

#[test]
fn the_tokens_so_far_are_chips_in_a_row_and_the_candidates_are_bars_under_them() {
    let parts = parts_of(cat());
    let chips: Vec<_> = shapes(&parts)
        .into_iter()
        .filter(|s| s.base.style.as_ref().is_some_and(|st| st.stroke.is_some()))
        .collect();
    assert_eq!(chips.len(), 5);
    let ys: Vec<_> = chips.iter().map(|c| c.base.y).collect();
    assert!(
        ys.iter().all(|y| *y == Some(148.0)),
        "one row at the top of the box"
    );
    assert_eq!(chips[0].base.x, Some(64.0));
    for pair in chips.windows(2) {
        let (a, b) = (
            pair[0].base.rect().expect("a box"),
            pair[1].base.rect().expect("a box"),
        );
        assert!(b.0 > a.0 + a.2, "chips do not overlap");
    }
    let style = chips[0].base.style.as_ref().expect("a style");
    assert_eq!(style.fill.as_ref().map(|f| f.color.as_str()), Some("bg2"));
    assert_eq!(
        style.stroke.as_ref().map(|s| (s.color.as_str(), s.width)),
        Some(("text2", Some(1.0)))
    );
    let all = texts(&parts);
    assert_eq!(
        &all[..5],
        ["The", "\u{b7}cat", "\u{b7}sat", "\u{b7}on", "\u{b7}the"]
    );
    assert!(all.contains(&"\u{b7}mat".to_owned()) && all.contains(&"42%".to_owned()));
    // The chips are in the code font.
    let run = &chips[0].text.as_ref().expect("text").paragraphs[0].runs[0];
    assert_eq!(run.font.as_deref(), Some("code"));
}

#[test]
fn a_bar_is_as_long_as_its_probability_and_the_pick_is_in_the_accent() {
    let parts = parts_of(cat());
    let bars: Vec<_> = shapes(&parts)
        .into_iter()
        .filter(|s| is_accent(s))
        .collect();
    assert_eq!(bars.len(), 5);
    let widths: Vec<f64> = bars.iter().map(|b| b.base.w.expect("a width")).collect();
    // 0.42 : 0.30 is 42 : 30, within the rounding of a hundredth.
    assert!(
        (widths[0] / widths[1] - 0.42 / 0.30).abs() < 0.01,
        "{widths:?}"
    );
    assert!((widths[1] / widths[4] - 6.0).abs() < 0.05);
    let fill = |i: usize| {
        bars[i]
            .base
            .style
            .as_ref()
            .and_then(|s| s.fill.as_ref())
            .map(|f| (f.color.clone(), f.alpha))
    };
    assert_eq!(fill(0), Some(("accent1".into(), None)));
    assert_eq!(fill(1), Some(("accent2".into(), Some(0.55))));
    // Rows go down the box in order, all left-aligned at one x.
    let ys: Vec<f64> = bars.iter().map(|b| b.base.y.expect("y")).collect();
    assert!(ys.windows(2).all(|w| w[1] > w[0]));
    assert!(bars.iter().all(|b| b.base.x == bars[0].base.x));
    // The percentage stands after the track, which is as long as 100%, and its % signs line up on the right.
    let pct = parts
        .iter()
        .find(|p| p.text().is_some_and(|t| t.plain_text() == "42%"))
        .expect("a percentage");
    let rows = tracks(&parts);
    assert_eq!(rows.len(), 5, "a track for each candidate");
    let track_end = rows[0].base.x.expect("x") + rows[0].base.w.expect("w");
    assert!(pct.base().x.expect("x") > track_end);
    assert_eq!(
        pct.text().and_then(|t| t.paragraphs[0].align.clone()),
        Some(Align::Right)
    );
    assert!(
        rows.iter().all(|t| t.base.w == rows[0].base.w),
        "one length for every track"
    );
    // The bars lie on their tracks.
    for (bar, track) in bars.iter().zip(&rows) {
        assert_eq!(
            (bar.base.x, bar.base.y, bar.base.h),
            (track.base.x, track.base.y, track.base.h)
        );
        assert!(bar.base.w <= track.base.w);
    }
}

#[test]
fn a_label_is_the_token_with_its_whitespace_shown_and_the_pick_is_bold() {
    let parts = parts_of(cat());
    let label = parts
        .iter()
        .find(|p| p.text().is_some_and(|t| t.plain_text() == "\u{b7}mat"))
        .expect("a label");
    let run = &label.text().expect("text").paragraphs[0].runs[0];
    assert!(run.bold);
    assert_eq!(
        label.text().and_then(|t| t.paragraphs[0].align.clone()),
        Some(Align::Right)
    );
    let other = parts
        .iter()
        .find(|p| p.text().is_some_and(|t| t.plain_text() == "\u{b7}floor"))
        .expect("a label");
    assert!(!other.text().expect("text").paragraphs[0].runs[0].bold);
}

#[test]
fn only_eight_candidates_are_shown_and_the_rest_are_counted() {
    let many: Vec<NextToken> = (0..11).map(|i| next(&format!("t{i}"), 0.09)).collect();
    let parts = parts_of(probs(&["A"], many, Some(2), 832.0, 344.0));
    let all = texts(&parts);
    assert!(all.contains(&"+3 more".to_owned()), "{all:?}");
    assert_eq!(
        all.iter()
            .filter(|t| t.starts_with('t') && t.len() == 2)
            .count(),
        8
    );
    // A pick further down takes the last row.
    let many: Vec<NextToken> = (0..11).map(|i| next(&format!("t{i}"), 0.09)).collect();
    let parts = parts_of(probs(&["A"], many, Some(9), 832.0, 344.0));
    let all = texts(&parts);
    assert!(
        all.contains(&"t9".to_owned()) && !all.contains(&"t7".to_owned()),
        "{all:?}"
    );
    assert!(all.contains(&"+3 more".to_owned()));
}

#[test]
fn chips_wrap_onto_rows_and_the_type_shrinks_to_keep_everything_in_the_box() {
    let words: Vec<String> = (0..40).map(|i| format!(" word{i}")).collect();
    let refs: Vec<&str> = words.iter().map(String::as_str).collect();
    let parts = parts_of(probs(
        &refs,
        vec![next("x", 0.5), next("y", 0.5)],
        None,
        832.0,
        344.0,
    ));
    let ys: std::collections::BTreeSet<i64> = shapes(&parts)
        .iter()
        .filter(|s| s.base.style.as_ref().is_some_and(|st| st.stroke.is_some()))
        .map(|s| (s.base.y.expect("y") * 100.0) as i64)
        .collect();
    assert!(ys.len() > 1, "more than one row");
    for p in &parts {
        let (x, y, w, h) = p.base().rect().expect("a box");
        assert!(
            x >= 64.0 - 0.011
                && y >= 148.0 - 0.011
                && x + w <= 64.0 + 832.0 + 0.011
                && y + h <= 148.0 + 344.0 + 0.011,
            "{x} {y} {w} {h}"
        );
    }
}

#[test]
fn tokens_that_cannot_fit_even_at_the_smallest_size_lose_their_beginning() {
    let words: Vec<String> = (0..3000).map(|i| format!(" w{i}")).collect();
    let refs: Vec<&str> = words.iter().map(String::as_str).collect();
    let parts = parts_of(probs(
        &refs,
        vec![next("x", 0.6), next("y", 0.4)],
        Some(0),
        832.0,
        344.0,
    ));
    let all = texts(&parts);
    assert_eq!(all[0], "...", "a chip of dots stands for what was left out");
    assert!(
        all.contains(&"\u{b7}w2999".to_owned()),
        "the latest token stays"
    );
    assert!(!all.contains(&"\u{b7}w0".to_owned()));
    assert!(parts.len() < 600, "{}", parts.len());
    for p in &parts {
        let (x, y, w, h) = p.base().rect().expect("a box");
        assert!(
            y >= 148.0 - 0.011 && y + h <= 148.0 + 344.0 + 0.011 && x + w <= 64.0 + 832.0 + 0.011
        );
    }
}

#[test]
fn either_half_alone_is_fine_and_nothing_at_all_is_nothing() {
    let only_tokens = parts_of(probs(&["a", "b"], Vec::new(), None, 400.0, 200.0));
    assert_eq!(only_tokens.len(), 2);
    let only_bars = parts_of(probs(&[], vec![next("a", 0.5)], None, 400.0, 200.0));
    assert_eq!(
        only_bars.len(),
        4,
        "a label, a track, a bar and a percentage"
    );
    assert!(parts_of(probs(&[], Vec::new(), None, 400.0, 200.0)).is_empty());
    let odd = parts_of(probs(
        &["a"],
        vec![next("x", f64::NAN), next("y", -2.0), next("z", 9.0)],
        Some(99),
        400.0,
        300.0,
    ));
    for p in &odd {
        let (x, y, w, h) = p.base().rect().expect("a box");
        assert!([x, y, w, h].iter().all(|v| v.is_finite() && *v >= 0.0));
    }
}

#[test]
fn a_box_with_no_room_gives_finite_parts_inside_it() {
    for (w, h) in [(0.0, 0.0), (30.0, 30.0), (832.0, 20.0), (10.0, 344.0)] {
        for p in parts_of(probs(
            &["The", " cat"],
            vec![next("a", 0.5), next("b", 0.5)],
            Some(0),
            w,
            h,
        )) {
            let (x, y, pw, ph) = p.base().rect().expect("a box");
            assert!(
                x >= 64.0 - 0.011
                    && y >= 148.0 - 0.011
                    && x + pw <= 64.0 + w + 0.011
                    && y + ph <= 148.0 + h + 0.011,
                "{w}x{h}"
            );
        }
    }
}
