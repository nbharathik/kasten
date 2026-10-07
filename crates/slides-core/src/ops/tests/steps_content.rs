//! A slide's steps cannot be lowered past what its content asks for: a code block with lines in focus
//! needs a step for each, or the last of them could never be reached.

use serde_json::json;

use super::steps_kit::steps_of;
use super::{bytes, engine, first_slide};
use crate::error::Error;
use crate::ops::Engine;

/// A slide with a code block whose focus takes three steps.
fn code_slide() -> (Engine, String) {
    let mut e = engine();
    let slide = first_slide(&e);
    e.apply(
        "add_elements",
        json!({ "slide": slide, "elements": [{
            "type": "code", "id": "code", "x": 40, "y": 80, "w": 600, "h": 300,
            "language": "python", "code": "a = 1\nb = 2\nc = 3\nd = 4", "focus": ["1", "2-3", "4"]
        }] }),
    )
    .unwrap();
    (e, slide)
}

#[test]
fn a_code_block_with_lines_in_focus_gives_the_slide_its_steps() {
    let (e, slide) = code_slide();
    assert_eq!(steps_of(&e, &slide), 3);
}

#[test]
fn the_steps_cannot_be_set_below_what_the_focus_lines_need_and_the_refusal_says_why() {
    let (mut e, slide) = code_slide();
    let before = bytes(e.deck());
    let result = e.apply("set_slide_steps", json!({ "slide": slide, "steps": 1 }));
    let Err(Error::Refused { message }) = result else {
        panic!("expected a refusal, got {result:?}");
    };
    assert!(message.contains("code"), "{message}");
    assert!(message.contains('3'), "{message}");
    assert_eq!(
        bytes(e.deck()),
        before,
        "a refused operation changes nothing"
    );
}

#[test]
fn the_steps_may_be_set_to_what_the_content_needs_or_more() {
    let (mut e, slide) = code_slide();
    e.apply("set_slide_steps", json!({ "slide": slide, "steps": 3 }))
        .unwrap();
    assert_eq!(steps_of(&e, &slide), 3);
    e.apply("set_slide_steps", json!({ "slide": slide, "steps": 6 }))
        .unwrap();
    assert_eq!(steps_of(&e, &slide), 6);
}

#[test]
fn a_slide_without_such_content_can_still_go_down_to_none() {
    let mut e = engine();
    let slide = first_slide(&e);
    e.apply("set_slide_steps", json!({ "slide": slide, "steps": 4 }))
        .unwrap();
    e.apply("set_slide_steps", json!({ "slide": slide, "steps": 0 }))
        .unwrap();
    assert_eq!(steps_of(&e, &slide), 0);
}
