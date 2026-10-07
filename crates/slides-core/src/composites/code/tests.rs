use super::*;
use crate::composites::expand;
use crate::model::{Base, CodeTheme, Extra, StepState};

fn code(source: &str) -> CodeEl {
    CodeEl {
        base: Base::new("e-code").place(64.0, 148.0, 832.0, 344.0),
        language: "python".to_owned(),
        code: source.to_owned(),
        theme: None,
        line_numbers: false,
        first_line: None,
        focus: Vec::new(),
        font_size: None,
        extra: Extra::new(),
    }
}

#[test]
fn warming_up_can_be_done_again_and_changes_nothing_that_is_drawn() {
    let source = "def f(x):\n    return x + 1  # add one\n";
    let before = parts_of(code(source));
    warm_up();
    warm_up();
    assert_eq!(parts_of(code(source)), before);
    assert!(highlight::is_known("python"), "the definitions are loaded");
}

fn parts_of(el: CodeEl) -> Vec<Element> {
    let theme = crate::themes::light();
    expand(&theme, "blank", &Element::Code(el)).unwrap_or_default()
}

fn text_boxes(parts: &[Element]) -> Vec<&Element> {
    parts
        .iter()
        .filter(|p| matches!(p, Element::Text(_)))
        .collect()
}

fn words(part: &Element) -> String {
    part.text().map(|t| t.plain_text()).unwrap_or_default()
}

fn sizes(part: &Element) -> Vec<f64> {
    part.text()
        .map(|t| {
            t.paragraphs
                .iter()
                .flat_map(|p| p.runs.iter().filter_map(|r| r.size))
                .collect()
        })
        .unwrap_or_default()
}

const SAMPLE: &str = "def greet(name):\n    # say hello\n    return f'Hello {name}' + str(42)\n";

#[test]
fn a_block_is_a_panel_and_one_text_box_of_a_paragraph_for_each_line() {
    let parts = parts_of(code(SAMPLE));
    assert_eq!(parts.len(), 2, "no line numbers, no gutter");
    let Element::Shape(panel) = &parts[0] else {
        panic!("the panel comes first")
    };
    assert_eq!(panel.shape, "roundRect");
    assert_eq!(panel.base.rect(), Some((64.0, 148.0, 832.0, 344.0)));
    let style = panel
        .base
        .style
        .as_ref()
        .map(|s| (s.radius, s.fill.as_ref().map(|f| f.color.as_str())));
    assert_eq!(
        style,
        Some((Some(12.0), Some("#161b22"))),
        "dark by default"
    );
    assert_eq!(
        parts[1].id(),
        "e-code.3",
        "the gutter's number is kept free"
    );
    let lines = parts[1].text().map(|t| t.paragraphs.len());
    assert_eq!(lines, Some(3));
    assert_eq!(
        words(&parts[1]),
        "def greet(name):\n    # say hello\n    return f'Hello {name}' + str(42)"
    );
}

#[test]
fn the_size_is_the_themes_code_size_when_it_fits_and_the_line_is_one_and_a_third_tall() {
    let parts = parts_of(code(SAMPLE));
    // The Light theme sets code at 16 pt: 21.33 units, 28.8 units a line.
    assert!(sizes(&parts[1]).iter().all(|s| *s == 16.0));
    let (_, y, _, h) = parts[1].base().rect().expect("a box");
    assert_eq!(y, 148.0 + 16.0, "16 units of padding at the top");
    assert_eq!(h, 86.4, "three lines of 28.8");
    let spacing = parts[1].text().and_then(|t| t.paragraphs[0].line_spacing);
    assert_eq!(spacing, Some(1.35));
    let style = parts[1].text().and_then(|t| t.paragraphs[0].style.clone());
    assert_eq!(style.as_deref(), Some("code"));
}

#[test]
fn a_font_size_is_the_most_the_code_is_set_at() {
    let mut el = code(SAMPLE);
    el.font_size = Some(12.0);
    assert!(sizes(&parts_of(el)[1]).iter().all(|s| *s == 12.0));
    let mut el = code(SAMPLE);
    el.font_size = Some(24.0);
    assert!(
        sizes(&parts_of(el)[1]).iter().all(|s| *s == 24.0),
        "there is room for 24 pt"
    );
    let mut el = code(SAMPLE);
    el.font_size = Some(60.0);
    let s = sizes(&parts_of(el)[1])[0];
    assert!(
        s < 60.0 && s > 24.0,
        "60 pt does not fit, but the most that does is used: {s}"
    );
}

#[test]
fn long_lines_and_many_lines_shrink_the_type_down_to_ten_points() {
    let wide = format!("x = '{}'", "w".repeat(60));
    let size_of = |source: &str| sizes(&parts_of(code(source))[1])[0];
    let s = size_of(&wide);
    assert!((10.0..16.0).contains(&s), "{s}");
    // The longest line, 66 columns of 0.6 em, has to fit the panel's width less its padding.
    let needed = 66.0 * 0.6 * s * 4.0 / 3.0;
    assert!(needed <= 832.0 - 2.0 * 20.0, "{needed}");
    assert_eq!(s, 14.5, "the largest half point that fits");
    let tall = "pass\n".repeat(12);
    let t = size_of(&tall);
    assert!(
        t < 16.0 && 12.0 * t * 4.0 / 3.0 * 1.35 <= 344.0 - 32.0,
        "{t}"
    );
    assert_eq!(t, 14.0);
    let far_too_much = "pass\n".repeat(100);
    assert_eq!(
        size_of(&far_too_much),
        10.0,
        "the floor, and it overflows rather than vanishing"
    );
    assert_eq!(size_of(&"x".repeat(2000)), 10.0);
}

#[test]
fn line_numbers_are_a_dimmer_right_aligned_column_that_counts_from_the_first_line() {
    let mut el = code(SAMPLE);
    el.line_numbers = true;
    el.first_line = Some(98);
    let parts = parts_of(el);
    assert_eq!(parts.len(), 3);
    assert_eq!(parts[1].id(), "e-code.2");
    assert_eq!(words(&parts[1]), "98\n99\n100");
    let first = &parts[1].text().expect("text").paragraphs[0];
    assert_eq!(first.align, Some(Align::Right));
    assert_eq!(first.runs[0].color.as_deref(), Some("#7e858f"));
    let (gx, _, gw, _) = parts[1].base().rect().expect("a box");
    let (cx, _, _, _) = parts[2].base().rect().expect("a box");
    assert!(gx + gw < cx, "the numbers end before the code starts");
    assert!(cx - (gx + gw) > 10.0, "with a gap");
    assert_eq!(parts[1].base().step_states.len(), 0);
}

#[test]
fn a_focus_list_makes_a_box_for_each_line_with_the_states_of_each_step() {
    let mut el = code("a = 1\nb = 2\nc = 3\nd = 4");
    el.focus = vec!["1".into(), "2-3".into(), "4".into()];
    let parts = parts_of(el);
    let boxes = text_boxes(&parts);
    assert_eq!(boxes.len(), 4);
    assert_eq!(boxes[0].id(), "e-code.3");
    assert_eq!(boxes[3].id(), "e-code.6");
    assert_eq!(words(boxes[1]), "b = 2");
    let dim = StepState::Dimmed;
    let norm = StepState::Normal;
    // Line 1 is the focus at step 1 and dims from step 2 on; nothing is stored for step 0.
    assert_eq!(
        boxes[0].base().step_states.iter().collect::<Vec<_>>(),
        [(&2, &dim)]
    );
    assert_eq!(
        boxes[1].base().step_states.iter().collect::<Vec<_>>(),
        [(&1, &dim), (&2, &norm), (&3, &dim)]
    );
    assert_eq!(
        boxes[3].base().step_states.iter().collect::<Vec<_>>(),
        [(&1, &dim), (&3, &norm)]
    );
    // The boxes stack at the height of a line.
    let ys: Vec<f64> = boxes.iter().map(|b| b.base().y.unwrap_or(0.0)).collect();
    assert!(
        (ys[1] - ys[0] - 28.8).abs() < 0.011 && (ys[2] - ys[1] - 28.8).abs() < 0.011,
        "{ys:?}"
    );
    assert_eq!(steps_needed_for(&parts), 3);
}

fn steps_needed_for(parts: &[Element]) -> u32 {
    parts
        .iter()
        .flat_map(|p| p.base().step_states.keys().copied())
        .max()
        .unwrap_or(0)
}

#[test]
fn syntax_colours_come_from_the_kind_of_word_and_the_light_theme_has_its_own() {
    let dark = parts_of(code(SAMPLE));
    let runs = dark[1]
        .text()
        .expect("text")
        .paragraphs
        .iter()
        .flat_map(|p| p.runs.iter())
        .collect::<Vec<_>>();
    let color_of = |word: &str| {
        runs.iter()
            .find(|r| r.t.contains(word))
            .and_then(|r| r.color.clone())
    };
    let (keyword, string, comment) = (color_of("def"), color_of("Hello"), color_of("# say"));
    assert_eq!(keyword.as_deref(), Some("#ff857d"));
    assert_eq!(string.as_deref(), Some("#7ee787"));
    assert_ne!(keyword, string);
    assert_ne!(comment, string);
    let mut el = code(SAMPLE);
    el.theme = Some(CodeTheme::Light);
    let light = parts_of(el);
    let Element::Shape(panel) = &light[0] else {
        panic!("panel")
    };
    assert_eq!(
        panel
            .base
            .style
            .as_ref()
            .and_then(|s| s.fill.as_ref())
            .map(|f| f.color.as_str()),
        Some("#f6f8fa")
    );
    let first = light[1].text().expect("text").paragraphs[0].runs[0]
        .color
        .clone();
    assert_eq!(first.as_deref(), Some("#a11b24"));
}

#[test]
fn an_unknown_language_and_empty_code_are_plain_but_still_a_block() {
    let mut el = code("just words\nmore");
    el.language = "no-such".into();
    let parts = parts_of(el);
    let colours: Vec<_> = parts[1]
        .text()
        .expect("text")
        .paragraphs
        .iter()
        .flat_map(|p| p.runs.iter())
        .filter_map(|r| r.color.clone())
        .collect();
    assert!(colours.iter().all(|c| c == "#e6edf3"));
    let empty = parts_of(code(""));
    assert_eq!(empty.len(), 2);
    assert_eq!(words(&empty[1]).trim(), "");
    assert!(
        sizes(&empty[1]).iter().all(|s| *s == 16.0),
        "a blank line is measured at the size it is set in"
    );
}

#[test]
fn tabs_are_expanded_and_the_final_newline_makes_no_empty_line() {
    let parts = parts_of(code("if x:\n\treturn 1\n"));
    assert_eq!(words(&parts[1]), "if x:\n    return 1");
    let crlf = parts_of(code("a\r\nb\r\n"));
    assert_eq!(words(&crlf[1]), "a\nb");
    assert_eq!(source_lines("a\n\n"), ["a", ""]);
}

#[test]
fn the_parts_of_a_tiny_or_empty_box_stay_inside_it() {
    let theme = crate::themes::light();
    for (w, h) in [(0.0, 0.0), (5.0, 300.0), (300.0, 5.0), (40.0, 40.0)] {
        let mut el = code(SAMPLE);
        el.base = Base::new("e-code").place(100.0, 100.0, w, h);
        el.line_numbers = true;
        el.focus = vec!["1".into()];
        let parts = expand(&theme, "blank", &Element::Code(el)).expect("parts");
        for p in &parts {
            let (x, y, pw, ph) = p.base().rect().expect("a box");
            assert!(
                x >= 100.0 - 0.011
                    && y >= 100.0 - 0.011
                    && x + pw <= 100.0 + w + 0.011
                    && y + ph <= 100.0 + h + 0.011,
                "{w}x{h}: {x} {y} {pw} {ph}"
            );
        }
    }
}

#[test]
fn a_block_with_a_hundred_kilobytes_of_code_is_finite_and_quick() {
    let big = "value = compute(items, key='name')  # comment\n".repeat(2200);
    let started = std::time::Instant::now();
    let mut el = code(&big);
    el.focus = vec!["1-3".into()];
    el.line_numbers = true;
    let parts = parts_of(el);
    assert!(started.elapsed().as_secs() < 10, "{:?}", started.elapsed());
    for p in &parts {
        let (x, y, w, h) = p.base().rect().expect("a box");
        assert!([x, y, w, h].iter().all(|v| v.is_finite() && *v >= 0.0));
    }
    // More lines than get a box each are one box.
    assert_eq!(text_boxes(&parts).len(), 2);
}

#[test]
fn a_style_of_the_code_element_is_left_to_the_parts() {
    let parts = parts_of(code(SAMPLE));
    assert!(parts.iter().all(|p| p.base().placeholder.is_none()));
}
