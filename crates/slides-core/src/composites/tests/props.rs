//! However odd the text and the numbers, an expansion neither panics nor makes a
//! number that is not finite, a size below zero, or two parts with one id.

use std::collections::HashSet;

use proptest::prelude::*;

use super::samples::{self, KINDS};
use crate::composites::{expand, expanded_group};
use crate::model::Element;
use crate::themes;

/// Text of every shape: words, spaces, line breaks, tabs, accents, Chinese, emoji and controls.
fn text() -> impl Strategy<Value = String> {
    prop_oneof![
        "[a-zA-Z0-9 ]{0,60}",
        "[ -~\n\t]{0,200}",
        "\\PC{0,80}",
        Just(String::new()),
        Just("日本語のテキスト 🎉 é ñ \u{200b}".repeat(3)),
    ]
}

fn number() -> impl Strategy<Value = f64> {
    prop_oneof![
        -50.0..3000.0,
        Just(0.0),
        Just(f64::NAN),
        Just(f64::INFINITY),
        Just(-1.0),
        Just(1.0e15),
        Just(0.001),
    ]
}

/// Every number in an element, however deep, as a list.
fn numbers(value: &serde_json::Value, out: &mut Vec<f64>) {
    match value {
        serde_json::Value::Number(n) => out.extend(n.as_f64()),
        serde_json::Value::Array(items) => items.iter().for_each(|v| numbers(v, out)),
        serde_json::Value::Object(map) => map.values().for_each(|v| numbers(v, out)),
        _ => {}
    }
}

fn check(element: &Element) {
    let theme = themes::light();
    let made = expand(&theme, "blank", element).expect("a composite expands");
    let mut ids = HashSet::new();
    for part in &made {
        assert!(ids.insert(part.id().to_owned()), "{} twice", part.id());
        let (x, y, w, h) = part.base().rect().expect("every part has a box");
        assert!(
            [x, y, w, h].iter().all(|v| v.is_finite()) && w >= 0.0 && h >= 0.0,
            "{} {x} {y} {w} {h}",
            part.id()
        );
        let mut all = Vec::new();
        numbers(&serde_json::to_value(part).expect("json"), &mut all);
        assert!(all.iter().all(|n| n.is_finite()), "{}: {all:?}", part.id());
        for run in part
            .text()
            .iter()
            .flat_map(|t| t.paragraphs.iter().flat_map(|p| p.runs.iter()))
        {
            assert!(run.size.is_none_or(|s| s.is_finite() && s > 0.0));
        }
    }
    let group = expanded_group(&theme, "blank", element).expect("a group");
    assert_eq!(group.children().len(), made.len());
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 200, ..ProptestConfig::default() })]

    #[test]
    fn no_text_or_size_makes_an_expansion_panic_or_go_out_of_range(
        kind in 0..KINDS.len(),
        words in text(),
        more in text(),
        size in number(),
        count in 0usize..40,
        (x, y, w, h) in (number(), number(), number(), number()),
    ) {
        let mut element = samples::odd(KINDS[kind], &words, &more, size, count);
        let base = element.base_mut();
        base.x = Some(x);
        base.y = Some(y);
        base.w = Some(w);
        base.h = Some(h);
        check(&element);
    }

    #[test]
    fn the_same_input_gives_the_same_parts(kind in 0..KINDS.len(), words in text(), size in 1.0..60.0f64, count in 0usize..20) {
        let element = samples::odd(KINDS[kind], &words, &words, size, count);
        let theme = themes::light();
        let once = serde_json::to_string(&expand(&theme, "blank", &element)).expect("json");
        let twice = serde_json::to_string(&expand(&theme, "blank", &element.clone())).expect("json");
        prop_assert_eq!(once, twice);
    }
}

#[test]
fn a_hundred_kilobytes_of_text_is_fine_in_every_kind() {
    let words = "The quick brown fox jumps over the lazy dog, again and again.\n".repeat(1700);
    assert!(words.len() > 100_000);
    for kind in KINDS {
        let started = std::time::Instant::now();
        let element = samples::odd(kind, &words, &words, 24.0, 8);
        check(&element);
        assert!(
            started.elapsed().as_secs() < 20,
            "{kind} took {:?}",
            started.elapsed()
        );
    }
}

#[test]
fn a_hundred_kilobytes_in_one_line_and_in_one_word_is_fine_too() {
    let line = "word ".repeat(21_000);
    let word = "x".repeat(105_000);
    for kind in KINDS {
        for text in [&line, &word] {
            check(&samples::odd(kind, text, "short", 16.0, 3));
        }
    }
}
