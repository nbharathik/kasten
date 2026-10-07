//! Making a deck from a Markdown outline: the layout of each slide is chosen
//! from what is on it, and the words go into that layout's slots.

use std::collections::BTreeMap;

use serde_json::{Value, json};

use super::read::slide_title;
use super::session::Agent;
use super::store::Store;
use super::{ToolError, ToolOutput, ToolResult};
use crate::canonical;
use crate::markdown::{self, escape_inline};
use crate::model::{Paragraph, PlaceholderKind};
use crate::ops::Engine;
use crate::outline::{self, OutlineSlide};
use crate::themes;

/// What a block of an outline is.
enum Block {
    Text(String),
    Code(String),
    Quote(String),
    Image { alt: String, src: String },
}

fn classify(paragraphs: &[Paragraph]) -> Block {
    let markdown = markdown::to_markdown(paragraphs);
    match paragraphs {
        [p] if p.runs.len() == 2 && p.runs[0].t == "!" && p.runs[1].link.is_some() => {
            Block::Image {
                alt: p.runs[1].t.clone(),
                src: p.runs[1].link.clone().unwrap_or_default(),
            }
        }
        [p] if p.style.as_deref() == Some("quote") => Block::Quote(markdown),
        many if !many.is_empty() && many.iter().all(|p| p.style.as_deref() == Some("code")) => {
            Block::Code(markdown)
        }
        _ => Block::Text(markdown),
    }
}

/// The words of a block as the Markdown that goes in a slot.
fn words(b: &Block) -> &str {
    match b {
        Block::Text(m) | Block::Code(m) | Block::Quote(m) => m,
        Block::Image { .. } => "",
    }
}

/// The layout for a slide that names none, from what is on it.
fn layout_for(blocks: &[Block]) -> &'static str {
    let images = blocks
        .iter()
        .filter(|b| matches!(b, Block::Image { .. }))
        .count();
    let others = blocks.len() - images;
    if images == 1 && others == 0 {
        "image-caption"
    } else if images >= 1 {
        "title-image"
    } else if blocks.iter().any(|b| matches!(b, Block::Code(_))) && blocks.len() == 1 {
        "code"
    } else if blocks.is_empty() {
        "section"
    } else if blocks.len() == 1 && matches!(blocks[0], Block::Quote(_)) {
        "quote"
    } else if blocks.len() == 2 {
        "two-columns"
    } else {
        "title-body"
    }
}

/// A slide as a layout's slots take it: the words for each slot by role, a picture, and what had no slot to go in.
struct Filled {
    content: BTreeMap<String, String>,
    image: Option<(String, String)>,
    dropped: usize,
}

fn join(blocks: &[&Block]) -> String {
    blocks
        .iter()
        .map(|b| words(b))
        .collect::<Vec<_>>()
        .join("\n")
}

fn fill(layout: &str, title: &str, blocks: &[Block]) -> Result<Filled, ToolError> {
    let title = escape_inline(title, false);
    let mut content = BTreeMap::new();
    let image = blocks.iter().find_map(|b| match b {
        Block::Image { alt, src } => Some((alt.clone(), src.clone())),
        _ => None,
    });
    let texts: Vec<&Block> = blocks
        .iter()
        .filter(|b| !matches!(b, Block::Image { .. }))
        .collect();
    let mut put = |role: &str, text: String| {
        if !text.is_empty() {
            content.insert(role.to_owned(), text);
        }
    };
    let mut used = texts.len();
    match layout {
        "title" | "section" => {
            put("title", title);
            put("subtitle", join(&texts));
        }
        "title-only" => {
            put("title", title);
            used = 0;
        }
        "two-columns" => {
            put("title", title);
            put(
                "body",
                texts
                    .first()
                    .map(|b| words(b).to_owned())
                    .unwrap_or_default(),
            );
            put("body2", join(texts.get(1..).unwrap_or_default()));
        }
        "title-image" => {
            put("title", title);
            put("body", join(&texts));
        }
        "image-caption" => {
            put("caption", title);
            used = 0;
        }
        "code" => {
            put("title", title);
            put("code", join(&texts));
        }
        "comparison" => {
            if texts.len() < 4 {
                return Err(ToolError::new(
                    "The comparison layout wants four blocks after its heading: a label, its text, a second label and its text.",
                ));
            }
            put("title", title);
            put("label", words(texts[0]).to_owned());
            put("body", words(texts[1]).to_owned());
            put("label2", words(texts[2]).to_owned());
            put("body2", join(&texts[3..]));
        }
        "big-number" => {
            put("number", title);
            put("label", join(&texts));
        }
        "quote" => {
            put(
                "quote",
                texts
                    .first()
                    .map(|b| words(b).trim_start_matches("> ").to_owned())
                    .unwrap_or_default(),
            );
            put("caption", title);
            used = texts.len().min(1);
        }
        "blank" => used = 0,
        _ => {
            put("title", title);
            put("body", join(&texts));
        }
    }
    let unused = if used < texts.len() {
        texts.len() - used
    } else {
        0
    };
    let dropped = if matches!(layout, "title-only" | "image-caption" | "blank") {
        texts.len()
    } else {
        unused
    };
    Ok(Filled {
        content,
        image,
        dropped,
    })
}

pub fn create_deck(agent: &mut Agent, store: &mut dyn Store, args: &Value) -> ToolResult {
    let source = args
        .get("outline")
        .and_then(Value::as_str)
        .filter(|o| !o.trim().is_empty())
        .ok_or_else(|| ToolError::new("`outline` is the deck as Markdown: `# Deck title`, then a `## Slide title` line for each slide with its text under it. Write the outline first, then let create_deck lay it out."))?;
    let outline = outline::parse_outline(source);
    if outline.slides.is_empty() {
        return Err(ToolError::new(
            "The outline has no slides: start each slide with a `## Title` line.",
        ));
    }
    let title = args
        .get("title")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| Some(outline.title.clone()).filter(|t| !t.trim().is_empty()))
        .unwrap_or_else(|| outline.slides[0].title.clone());
    let theme = args
        .get("theme")
        .and_then(Value::as_str)
        .unwrap_or(themes::DEFAULT);
    let seed = store.entropy();
    let mut engine = Engine::create(&title, theme, seed)?;
    let mut warnings: Vec<String> = Vec::new();
    let known = store.assets().unwrap_or_default();

    // The cover: the outline's own first slide when it is a title slide, else one made from the deck's title.
    let cover_id = engine.deck().slides[0].id.clone();
    let slot = |engine: &Engine, role: &str| {
        engine.deck().slides[0]
            .elements
            .iter()
            .find(|e| e.base().placeholder.as_deref() == Some(role))
            .map(|e| e.id().to_owned())
    };
    let mut rest: &[OutlineSlide] = &outline.slides;
    let cover = match rest.first() {
        Some(first) if first.layout.as_deref() == Some("title") => {
            rest = &rest[1..];
            Some(first)
        }
        _ => None,
    };
    let subtitle = match cover {
        Some(first) => first
            .blocks
            .iter()
            .map(|b| markdown::to_markdown(b))
            .collect::<Vec<_>>()
            .join("\n"),
        None => args
            .get("subtitle")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
    };
    if let (Some(first), Some(id)) = (cover, slot(&engine, "title")) {
        engine.apply(
            "set_text",
            json!({ "slide": cover_id, "id": id, "markdown": escape_inline(&first.title, false) }),
        )?;
    }
    if let Some(id) = slot(&engine, "subtitle") {
        if subtitle.trim().is_empty() {
            engine.apply("delete_elements", json!({ "slide": cover_id, "ids": [id] }))?;
        } else {
            engine.apply(
                "set_text",
                json!({ "slide": cover_id, "id": id, "markdown": subtitle }),
            )?;
        }
    }
    if let Some(first) = cover.filter(|c| !c.notes.trim().is_empty()) {
        engine.apply(
            "set_notes",
            json!({ "slide": cover_id, "notes": first.notes }),
        )?;
    }

    let mut lines = vec![
        json!({ "n": 1, "id": cover_id, "layout": "title", "title": title, "why": "the deck's cover" }),
    ];
    for (i, s) in rest.iter().enumerate() {
        let blocks: Vec<Block> = s.blocks.iter().map(|b| classify(b)).collect();
        let (layout, why) = match &s.layout {
            Some(name) if engine.deck().theme.layout(name).is_some() => {
                (name.clone(), "named in the outline".to_owned())
            }
            Some(name) => {
                let names: Vec<&str> = engine
                    .deck()
                    .theme
                    .layouts
                    .iter()
                    .map(|l| l.name.as_str())
                    .collect();
                return Err(ToolError::new(format!(
                    "Slide {} (\"{}\") names the layout `{name}`, which the theme lacks. The layouts are: {}.",
                    i + 2,
                    s.title,
                    names.join(", ")
                )));
            }
            None => {
                let layout = layout_for(&blocks);
                if blocks.is_empty() {
                    warnings.push(format!("Slide {} (\"{}\") has nothing under its title, so it is a section divider. If it is to hold a diagram, a picture or words, put a layout after its title, such as `<!-- layout: title-only -->`, or change it later with apply_layout.", i + 2, s.title));
                }
                (
                    layout.to_owned(),
                    format!(
                        "chosen for {} block{}",
                        blocks.len(),
                        if blocks.len() == 1 { "" } else { "s" }
                    ),
                )
            }
        };
        let filled = fill(&layout, &s.title, &blocks)?;
        if filled.dropped > 0 {
            warnings.push(format!("Slide {} (\"{}\"): the {layout} layout has no place for {} block{}, so they were left out; pick another layout with `<!-- layout: name -->`.", i + 2, s.title, filled.dropped, if filled.dropped == 1 { "" } else { "s" }));
        }
        let mut input = json!({ "layout": layout, "content": filled.content });
        if !s.notes.trim().is_empty() {
            input["notes"] = json!(s.notes);
        }
        let added = engine.apply("add_slide", input)?.output;
        let slide = added["slide"].as_str().unwrap_or_default().to_owned();
        // A text slot nothing was written for would only sit there asking to be filled.
        let bare: Vec<String> = engine
            .deck()
            .theme
            .layout(&layout)
            .map(|l| {
                l.placeholders
                    .iter()
                    .filter(|p| {
                        p.kind == PlaceholderKind::Text && !filled.content.contains_key(&p.role)
                    })
                    .map(|p| p.role.clone())
                    .collect()
            })
            .unwrap_or_default();
        let gone: Vec<String> = bare
            .iter()
            .filter_map(|role| added["elements"][role].as_str().map(str::to_owned))
            .collect();
        if !gone.is_empty() {
            engine.apply("delete_elements", json!({ "slide": slide, "ids": gone }))?;
        }
        if let (Some((alt, src)), Some(id)) = (&filled.image, added["elements"]["image"].as_str()) {
            engine.apply("patch_elements", json!({ "slide": slide, "patches": [{ "id": id, "patch": { "src": src, "alt": alt } }] }))?;
            if !known.iter().any(|a| &a.path == src) {
                warnings.push(format!("Slide {} uses the picture `{src}`, which is not in the store; add_asset puts it there.", i + 2));
            }
        }
        if s.hidden || s.backup {
            engine.apply(
                "set_slide_flags",
                json!({ "ids": [slide], "hidden": s.hidden, "backup": s.backup }),
            )?;
        }
        lines.push(json!({ "n": lines.len() + 1, "id": slide, "layout": layout, "title": s.title, "why": why }));
    }

    let deck = engine.into_deck();
    let text = canonical::write(&deck)?;
    let made = store.create(&title, &text)?;
    agent.remember(made.clone());
    let problems = agent.problems(store, &deck, &[]);
    let titles: Vec<String> = deck.slides.iter().map(|s| slide_title(&deck, s)).collect();
    Ok(ToolOutput::json(json!({
        "deck": made.name,
        "hash": made.hash,
        "title": deck.title,
        "theme": deck.theme.name,
        "slides": lines,
        "titles": titles,
        "warnings": warnings,
        "lint": problems,
    })))
}
