//! Whatever is on a slide, its outline reads back as the same title, blocks
//! and notes: text of every shape is put on one slide and read again.

use proptest::prelude::*;

use serde_json::json;

use super::{add, engine};
use crate::markdown;
use crate::model::{Base, Deck, Element, Paragraph, Text};
use crate::ops::Engine;
use crate::outline::{outline_of, parse_outline};

fn cases() -> u32 {
    std::env::var("PROPTEST_CASES")
        .ok()
        .and_then(|n| n.parse().ok())
        .unwrap_or(1000)
}

fn pick(tokens: &[&'static str]) -> impl Strategy<Value = &'static str> + use<> {
    prop::sample::select(tokens.to_vec())
}

/// A deck with a title slide and a second slide of the title-only layout.
fn deck() -> Deck {
    let mut e = engine();
    add(&mut e, "title-only", json!({ "title": "x" }));
    e.deck().clone()
}

/// The lines of notes: headings, fences, escapes and the marker itself.
fn notes() -> impl Strategy<Value = String> {
    let line = pick(&[
        "",
        "",
        "text",
        "## Heading",
        "##",
        "\\## escaped",
        "\\\\## twice",
        "```",
        "~~~",
        "````",
        "Notes:",
        "notes:",
        "# one",
        "### three",
        "- item",
        "   ",
        "<!-- c -->",
        "\\",
        "  ## indented",
        "a  ",
        "b \\",
    ]);
    prop::collection::vec(line, 0..10).prop_map(|lines| lines.join("\n"))
}

/// A one-line title full of the characters that mean something.
fn title() -> impl Strategy<Value = String> {
    let part = pick(&[
        "a", "Q&A", " ", "  ", "*", "**", "_", "x_y", "`", "[", "](u)", "<!--", "-->", "<", ">",
        "\\", "#", "$", "$5", "<u>", "</u>", "~~", "1.", "(", ")", "é", "-", ",",
    ]);
    prop::collection::vec(part, 0..10).prop_map(|parts| parts.concat())
}

/// Markdown-ish text for a text box.
fn body() -> impl Strategy<Value = String> {
    let part = pick(&[
        "a",
        "b c",
        " ",
        "*",
        "**x**",
        "_",
        "`",
        "[l](u)",
        "<u>",
        "$m$",
        "\\",
        "\n",
        "\n\n",
        "  \n",
        "- ",
        "1. ",
        "# ",
        "## ",
        "> ",
        "```\n",
        "```",
        "~~~",
        "Notes:",
        "<!-- c -->",
        "\\## x",
        "Notes:\n",
        "\n## x\n",
        "$$",
        "$a$",
        "<https://x.y>",
        "\\\n",
        "~~",
        "**",
        "|",
        "\n~~~\n",
        "\n```\n",
        "\n<!-- c -->\n",
        "Notes:  \n",
        "\n\n## ",
        "`` ",
    ]);
    prop::collection::vec(part, 0..14).prop_map(|parts| parts.concat())
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(cases()))]

    #[test]
    fn notes_read_back_as_written(notes in notes()) {
        let mut deck = deck();
        deck.slides[1].notes = notes.clone();
        let got = parse_outline(&outline_of(&deck));
        prop_assert_eq!(got.slides.len(), 2);
        prop_assert_eq!(&got.slides[1].notes, notes.trim());
        prop_assert!(got.slides[1].blocks.is_empty());
    }

    #[test]
    fn titles_read_back_as_written(title in title()) {
        let mut deck = deck();
        deck.title = title.clone();
        deck.slides[1].elements[0] = Element::text_el(
            Base::new("t-title").place(0.0, 0.0, 100.0, 50.0),
            Text::plain(title.clone()),
        );
        deck.slides[1].elements[0].base_mut().placeholder = Some("title".to_owned());
        let md = outline_of(&deck);
        let got = parse_outline(&md);
        prop_assert_eq!(got.slides.len(), 2, "{}", md);
        prop_assert_eq!(&got.title, title.trim(), "{}", md);
        prop_assert_eq!(&got.slides[1].title, title.trim(), "{}", md);
        prop_assert_eq!(&got.slides[1].layout, &Some("title-only".to_owned()));
    }

    #[test]
    fn a_text_box_reads_back_as_the_paragraphs_it_holds(source in body()) {
        let mut deck = deck();
        let paragraphs = markdown::parse(&source);
        deck.slides[1].elements.push(Element::text_el(
            Base::new("t-body").place(0.0, 100.0, 100.0, 50.0),
            Text::from_paragraphs(paragraphs.clone()),
        ));
        let md = outline_of(&deck);
        let got = parse_outline(&md);
        prop_assert_eq!(got.slides.len(), 2, "{}", md);
        // Headings become plain paragraphs, since a heading line would start
        // a slide, and code that spans lines does too. A plain paragraph with
        // no words is not written.
        let plain: Vec<Paragraph> = paragraphs
            .into_iter()
            .map(|mut p| {
                if matches!(p.style.as_deref(), Some("title" | "subtitle")) {
                    p.style = None;
                }
                for run in p.runs.iter_mut().filter(|r| r.t.contains('\n')) {
                    (run.code, run.math) = (false, false);
                }
                p
            })
            .filter(|p| p.list.is_some() || p.style.is_some() || !p.text().is_empty())
            .collect();
        let plain = markdown::parse(&markdown::to_markdown(&plain));
        let want: Vec<Vec<Paragraph>> = if markdown::to_markdown(&plain).trim().is_empty() {
            vec![]
        } else {
            vec![plain]
        };
        prop_assert_eq!(&got.slides[1].blocks, &want, "{}", md);
        prop_assert_eq!(&got.slides[1].notes, "", "{}", md);
    }
}

/// The title a slide should have in its outline.
fn title_of(slide: &crate::model::Slide) -> String {
    slide
        .elements
        .iter()
        .find(|e| e.base().placeholder.as_deref() == Some("title"))
        .and_then(Element::text)
        .map(|t| t.plain_text())
        .unwrap_or_default()
}

/// The other text on a slide, as paragraphs, with headings made plain. A
/// slide with no title slot is named by its first text, which is not "other".
fn blocks_of(slide: &crate::model::Slide) -> Vec<Vec<Paragraph>> {
    let titled = slide
        .elements
        .iter()
        .any(|e| e.base().placeholder.as_deref() == Some("title"));
    let mut texts = slide
        .elements
        .iter()
        .filter(|e| e.base().placeholder.as_deref() != Some("title"))
        .filter_map(Element::text)
        .filter(|t| !t.is_blank());
    if !titled {
        texts.next();
    }
    texts
        .map(|t| {
            t.paragraphs
                .iter()
                .cloned()
                .map(|mut p| {
                    if matches!(p.style.as_deref(), Some("title" | "subtitle")) {
                        p.style = None;
                    }
                    p
                })
                .collect()
        })
        .collect()
}

fn a_deck_with_everything() -> Deck {
    let mut e = Engine::create("Everything, *almost*", "Serif", 12).unwrap();
    add(
        &mut e,
        "title-body",
        json!({ "title": "Why decks are files", "body": "- **Plain files** diff in git\n- *Agents* can edit them\n  - and render the result\n- Speaker notes stay with the slide" }),
    );
    let two = add(
        &mut e,
        "two-columns",
        json!({ "title": "Two columns", "body": "1. First\n2. Second\n3. Third", "body2": "A paragraph with `code`, a [link](https://example.com) and math $e^{i\\pi}+1=0$." }),
    );
    e.apply(
        "set_notes",
        json!({ "slide": two, "notes": "Pause here.\n\n- ask the room\n\n## Q and A" }),
    )
    .unwrap();
    add(
        &mut e,
        "quote",
        json!({ "quote": "Make it work, make it right, make it fast.", "caption": "Kent Beck" }),
    );
    let code = add(
        &mut e,
        "code",
        json!({ "title": "Code", "code": "```rust\nfn main() {\n\n    println!(\"## hi\");\n}\n```" }),
    );
    let hidden = add(
        &mut e,
        "big-number",
        json!({ "number": "42", "label": "the answer" }),
    );
    e.apply(
        "set_slide_flags",
        json!({ "ids": [hidden.clone(), code], "hidden": true }),
    )
    .unwrap();
    let backup = add(&mut e, "title-only", json!({ "title": "Backup: details" }));
    e.apply(
        "set_slide_flags",
        json!({ "ids": [backup], "backup": true }),
    )
    .unwrap();
    e.deck().clone()
}

#[test]
fn an_outline_reads_back_as_the_deck_it_came_from() {
    let deck = a_deck_with_everything();
    let md = outline_of(&deck);
    let got = parse_outline(&md);
    assert_eq!(got.title, deck.title);
    assert_eq!(got.slides.len(), deck.slides.len(), "{md}");
    for (read, slide) in got.slides.iter().zip(&deck.slides) {
        let layout = (slide.layout != "title-body").then(|| slide.layout.clone());
        assert_eq!(read.layout, layout, "{md}");
        assert_eq!((read.hidden, read.backup), (slide.hidden, slide.backup));
        assert_eq!(read.notes, slide.notes.trim());
        if slide
            .elements
            .iter()
            .any(|e| e.base().placeholder.as_deref() == Some("title"))
        {
            assert_eq!(read.title, title_of(slide), "{md}");
        }
        assert_eq!(read.blocks, blocks_of(slide), "{md}");
    }
}
