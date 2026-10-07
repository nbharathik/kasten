use super::*;
use crate::composites::expand as expand_element;
use crate::model::{Base, ChatMessage, Extra};

fn message(role: ChatRole, text: &str) -> ChatMessage {
    ChatMessage {
        role,
        text: text.to_owned(),
        extra: Extra::new(),
    }
}

fn chat(messages: Vec<ChatMessage>, w: f64, h: f64) -> ChatEl {
    ChatEl {
        base: Base::new("e-chat").place(64.0, 148.0, w, h),
        messages,
        extra: Extra::new(),
    }
}

fn parts_of(el: ChatEl) -> Vec<Element> {
    let theme = crate::themes::light();
    expand_element(&theme, "blank", &Element::Chat(el)).unwrap_or_default()
}

fn everyone() -> Vec<ChatMessage> {
    vec![
        message(ChatRole::System, "You are a helpful assistant."),
        message(ChatRole::User, "What is the weather in Oslo?"),
        message(ChatRole::ToolCall, "get_weather(city=\"Oslo\")"),
        message(ChatRole::ToolResult, "{\"temp\": 4, \"sky\": \"rain\"}"),
        message(ChatRole::Assistant, "It is 4 degrees and raining in Oslo."),
    ]
}

fn shape(part: &Element) -> &crate::model::ShapeEl {
    let Element::Shape(s) = part else {
        panic!("a bubble is a shape")
    };
    s
}

fn fill_of(part: &Element) -> Option<(String, Option<f64>)> {
    shape(part)
        .base
        .style
        .as_ref()
        .and_then(|s| s.fill.as_ref())
        .map(|f| (f.color.clone(), f.alpha))
}

fn sizes(part: &Element) -> Vec<f64> {
    shape(part)
        .text
        .as_ref()
        .map(|t| {
            t.paragraphs
                .iter()
                .flat_map(|p| p.runs.iter().filter_map(|r| r.size))
                .collect()
        })
        .unwrap_or_default()
}

#[test]
fn each_role_has_its_own_bubble() {
    let parts = parts_of(chat(everyone(), 832.0, 344.0));
    assert_eq!(parts.len(), 5);
    let rects: Vec<_> = parts
        .iter()
        .map(|p| p.base().rect().expect("a box"))
        .collect();
    // System: the whole width, on the left, bg2.
    assert_eq!((rects[0].0, rects[0].2), (64.0, 832.0));
    assert_eq!(fill_of(&parts[0]), Some(("bg2".into(), None)));
    // User: 80% of the width, against the right edge, accent1, words in the paper colour.
    assert!((rects[1].2 - 665.6).abs() < 0.011);
    assert!((rects[1].0 + rects[1].2 - (64.0 + 832.0)).abs() < 0.011);
    assert_eq!(fill_of(&parts[1]), Some(("accent1".into(), None)));
    let words = &shape(&parts[1]).text.as_ref().expect("text").paragraphs[1].runs[0];
    assert_eq!(words.color.as_deref(), Some("bg1"));
    // Tool call: an accent3 outline, no fill, the code font, an arrow before the call.
    assert_eq!(rects[2].0, 64.0);
    assert!(fill_of(&parts[2]).is_none());
    let stroke = shape(&parts[2])
        .base
        .style
        .as_ref()
        .and_then(|s| s.stroke.as_ref())
        .map(|s| s.color.clone());
    assert_eq!(stroke.as_deref(), Some("accent3"));
    let call = &shape(&parts[2]).text.as_ref().expect("text").paragraphs[1];
    assert_eq!(call.runs[0].t, "→ get_weather(city=\"Oslo\")");
    assert_eq!(call.runs[0].font.as_deref(), Some("code"));
    assert_eq!(call.style.as_deref(), Some("code"));
    // Tool result: an accent4 tint, left, in code.
    assert_eq!(fill_of(&parts[3]), Some(("accent4".into(), Some(0.18))));
    assert_eq!(rects[3].0, 64.0);
    // Assistant: bg2, left, in the body font.
    assert_eq!(fill_of(&parts[4]), Some(("bg2".into(), None)));
    assert_eq!(rects[4].0, 64.0);
    let reply = &shape(&parts[4]).text.as_ref().expect("text").paragraphs[1];
    assert_eq!(reply.runs[0].font.as_deref(), Some("body"));
    for p in &parts {
        assert_eq!(shape(p).shape, "roundRect");
        assert_eq!(
            shape(p).base.style.as_ref().and_then(|s| s.radius),
            Some(12.0)
        );
    }
}

#[test]
fn a_label_names_the_role_above_the_words() {
    let parts = parts_of(chat(everyone(), 832.0, 344.0));
    let labels: Vec<String> = parts
        .iter()
        .map(|p| {
            shape(p).text.as_ref().expect("text").paragraphs[0].runs[0]
                .t
                .clone()
        })
        .collect();
    assert_eq!(
        labels,
        ["System", "User", "Tool call", "Tool result", "Assistant"]
    );
    let label_size = shape(&parts[0]).text.as_ref().expect("text").paragraphs[0].runs[0]
        .size
        .expect("a size");
    let word_size = shape(&parts[0]).text.as_ref().expect("text").paragraphs[1].runs[0]
        .size
        .expect("a size");
    assert!(label_size < word_size);
}

#[test]
fn bubbles_stack_with_a_gap_of_eight_and_the_text_is_the_largest_that_fits() {
    let parts = parts_of(chat(everyone(), 832.0, 344.0));
    let rects: Vec<_> = parts
        .iter()
        .map(|p| p.base().rect().expect("a box"))
        .collect();
    for pair in rects.windows(2) {
        let gap = pair[1].1 - (pair[0].1 + pair[0].3);
        assert!((gap - 8.0).abs() < 0.021, "{gap}");
    }
    let last = rects[4];
    assert!(
        last.1 + last.3 <= 148.0 + 344.0 + 0.011,
        "everything fits the box"
    );
    let s = sizes(&parts[0])[1];
    assert!((12.0..=20.0).contains(&s));
    // A half point more would not have fit.
    let bigger = parts_of(chat(everyone(), 832.0, 344.0 - 0.0));
    assert_eq!(sizes(&bigger[0])[1], s);
    let shorter = parts_of(chat(everyone(), 832.0, 200.0));
    assert!(
        sizes(&shorter[0])[1] < s,
        "a shorter box sets the words smaller"
    );
    let roomy = parts_of(chat(vec![message(ChatRole::User, "Hi")], 832.0, 344.0));
    assert_eq!(sizes(&roomy[0])[1], 20.0, "20 points is the most");
}

#[test]
fn what_cannot_fit_at_twelve_points_runs_past_the_bottom_whole() {
    let many: Vec<ChatMessage> = (0..30)
        .map(|i| {
            message(
                if i % 2 == 0 {
                    ChatRole::User
                } else {
                    ChatRole::Assistant
                },
                "A line or two of a longer message, to fill some space in the box.",
            )
        })
        .collect();
    let parts = parts_of(chat(many, 832.0, 300.0));
    assert_eq!(parts.len(), 30, "none is left out");
    assert!(
        sizes(&parts[0])
            .iter()
            .all(|s| *s <= 12.0 || (*s - 12.0).abs() < 0.01 || *s == 9.0)
    );
    assert_eq!(sizes(&parts[29])[1], 12.0);
    let bottom = parts
        .iter()
        .map(|p| p.base().y.unwrap_or(0.0) + p.base().h.unwrap_or(0.0))
        .fold(0.0, f64::max);
    assert!(
        bottom > 148.0 + 300.0,
        "the last bubbles pass the box: {bottom}"
    );
    for p in &parts {
        let h = p.base().h.expect("a height");
        assert!(h > 20.0, "not squeezed to nothing: {h}");
    }
}

#[test]
fn long_messages_wrap_and_make_taller_bubbles() {
    let short = parts_of(chat(
        vec![message(ChatRole::Assistant, "Ok.")],
        832.0,
        344.0,
    ));
    let long_text = "word ".repeat(80);
    let long = parts_of(chat(
        vec![message(ChatRole::Assistant, &long_text)],
        832.0,
        344.0,
    ));
    assert!(long[0].base().h > short[0].base().h);
}

#[test]
fn an_empty_conversation_and_odd_text_are_fine() {
    assert!(parts_of(chat(Vec::new(), 832.0, 344.0)).is_empty());
    let odd = parts_of(chat(
        vec![
            message(ChatRole::User, ""),
            message(ChatRole::ToolCall, "→ already(1)"),
            message(ChatRole::System, "line one\nline two\n\nline four"),
        ],
        300.0,
        400.0,
    ));
    assert_eq!(odd.len(), 3);
    assert_eq!(
        shape(&odd[0]).text.as_ref().expect("text").paragraphs[1].runs[0].t,
        " "
    );
    assert_eq!(
        shape(&odd[1]).text.as_ref().expect("text").paragraphs[1].runs[0].t,
        "→ already(1)"
    );
    assert!(odd[2].base().h > odd[0].base().h);
}

#[test]
fn a_box_with_no_room_still_gives_finite_bubbles() {
    for (w, h) in [(0.0, 0.0), (10.0, 10.0), (1.0e7, 5.0)] {
        for p in parts_of(chat(everyone(), w, h)) {
            let (x, y, pw, ph) = p.base().rect().expect("a box");
            assert!(
                [x, y, pw, ph].iter().all(|v| v.is_finite() && *v >= 0.0),
                "{w}x{h}"
            );
        }
    }
}

#[test]
fn bubbles_that_fit_stay_inside_the_box() {
    for p in parts_of(chat(everyone(), 832.0, 344.0)) {
        let (x, y, w, h) = p.base().rect().expect("a box");
        assert!(
            x >= 64.0 - 0.011
                && y >= 148.0 - 0.011
                && x + w <= 64.0 + 832.0 + 0.011
                && y + h <= 148.0 + 344.0 + 0.011
        );
    }
}
