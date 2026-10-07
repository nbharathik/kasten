//! Tests of the outline: reading Markdown into slides, writing a deck out,
//! and that what is written reads back.

mod parse;
mod render;
mod roundtrip;

use serde_json::{Value, json};

use super::OutlineSlide;
use crate::markdown;
use crate::ops::Engine;

pub(super) fn engine() -> Engine {
    Engine::create("Test deck", "Light", 1).unwrap()
}

/// Adds a slide of `layout` filled from `content` and returns its id.
pub(super) fn add(e: &mut Engine, layout: &str, content: Value) -> String {
    let out = e
        .apply("add_slide", json!({ "layout": layout, "content": content }))
        .unwrap();
    out.output["slide"].as_str().unwrap().to_owned()
}

/// A slide as reading its outline should give it: the blocks are Markdown.
pub(super) fn slide(title: &str, blocks: &[&str]) -> OutlineSlide {
    OutlineSlide {
        title: title.to_owned(),
        blocks: blocks.iter().map(|b| markdown::parse(b)).collect(),
        ..OutlineSlide::default()
    }
}
