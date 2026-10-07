//! What the in-app chat needs to know about decks besides the tools: the
//! text of a deck or slide chip, which goes before the person's words as
//! context, and a line for each deck tool's call, in words for the person.
//! They are here, and not in the app, so they are tested with the tools.

use kasten_core::Kasten;
use serde_json::Value;
use slides_core::canonical;
use slides_core::model::{Deck, Element, Slide};
use slides_core::outline::outline_of;

/// The most characters of a deck's outline that go with a chip.
const OUTLINE_CHARS: usize = 8_000;
/// The most characters of a slide's JSON.
const SLIDE_CHARS: usize = 16_000;
/// The most selected elements described one by one.
const SELECTED: usize = 12;

/// A chip's words: what the deck or slide is called and what to tell the model.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Context {
    /// The deck's title, for the block's attributes and the note about what was cut.
    pub title: String,
    pub body: String,
}

/// At most `max` characters of `text`, cut at a line end when one is near.
fn cut(text: &str, max: usize) -> (String, bool) {
    let Some((end, _)) = text.char_indices().nth(max) else {
        return (text.to_owned(), false);
    };
    let head = &text[..end];
    let kept = match head.rfind('\n') {
        Some(line) if line > end / 2 => &head[..line],
        _ => head,
    };
    (kept.to_owned(), true)
}

fn words_of(element: &Element) -> String {
    let words = element
        .text()
        .map(|t| {
            t.plain_text()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();
    match words.char_indices().nth(60) {
        Some((at, _)) => format!("{}…", &words[..at]),
        None => words,
    }
}

fn describe(element: &Element) -> String {
    let words = words_of(element);
    let mut what = element.kind().to_owned();
    if let Some(role) = &element.base().placeholder {
        what.push_str(&format!(", the {role} slot"));
    }
    if words.is_empty() {
        format!("{} ({what})", element.id())
    } else {
        format!("{} ({what}: “{words}”)", element.id())
    }
}

fn title_of(slide: &Slide, deck: &Deck) -> String {
    let words = |e: &Element| Some(words_of(e)).filter(|w| !w.is_empty());
    slide
        .elements
        .iter()
        .filter(|e| e.base().placeholder.as_deref() == Some("title"))
        .find_map(words)
        .or_else(|| slide.elements.iter().find_map(words))
        .unwrap_or_else(|| {
            deck.theme
                .layout(&slide.layout)
                .map_or_else(|| slide.layout.clone(), |l| l.label.clone())
        })
}

fn read(kasten: &Kasten, reference: &str) -> Result<(String, Deck), String> {
    let path = kasten.resolve_deck(reference).map_err(|e| e.to_string())?;
    let file = kasten.deck(&path).map_err(|e| e.to_string())?;
    let deck = canonical::parse(&file.text).map_err(|e| format!("The deck cannot be read: {e}"))?;
    Ok((path, deck))
}

fn outline(deck: &Deck) -> String {
    let (text, cut_short) = cut(outline_of(deck).trim_end(), OUTLINE_CHARS);
    if cut_short {
        format!("{text}\n…\n(The outline is cut here; get_outline has all of it.)")
    } else {
        text
    }
}

/// A deck as a chip: what it is and its outline.
pub fn deck_context(kasten: &Kasten, reference: &str) -> Result<Context, String> {
    let (path, deck) = read(kasten, reference)?;
    let body = format!(
        "The deck {path}: “{}”, the {} theme, {} slide{}, {} by {} units.\n\nIts outline:\n{}",
        deck.title,
        deck.theme.name,
        deck.slides.len(),
        if deck.slides.len() == 1 { "" } else { "s" },
        deck.size.w,
        deck.size.h,
        outline(&deck),
    );
    Ok(Context {
        title: deck.title,
        body,
    })
}

/// A slide as a chip: which one and which elements of it are selected, the
/// deck's outline, the theme, and the slide in the deck's own JSON.
pub fn slide_context(
    kasten: &Kasten,
    reference: &str,
    slide: &str,
    selected: &[String],
) -> Result<Context, String> {
    let (path, deck) = read(kasten, reference)?;
    let Some(at) = deck.index_of(slide) else {
        return Ok(Context {
            title: deck.title.clone(),
            body: format!(
                "The slide {slide} of {path} is not in the deck any more. get_deck lists the slides there are."
            ),
        });
    };
    let this = &deck.slides[at];
    let mut lines = vec![format!(
        "The person is looking at slide {} of {} in the deck {path}: “{}” (id {}, layout {}, the {} theme).",
        at + 1,
        deck.slides.len(),
        title_of(this, &deck),
        this.id,
        this.layout,
        deck.theme.name,
    )];
    let chosen: Vec<&Element> = selected.iter().filter_map(|id| this.element(id)).collect();
    if chosen.is_empty() {
        lines.push("No element of the slide is selected.".to_owned());
    } else {
        lines.push(format!(
            "Selected on the slide, which is what “this”, “it” or “the selection” means: {}{}.",
            chosen
                .iter()
                .take(SELECTED)
                .map(|e| describe(e))
                .collect::<Vec<_>>()
                .join("; "),
            if chosen.len() > SELECTED {
                format!("; and {} more", chosen.len() - SELECTED)
            } else {
                String::new()
            }
        ));
    }
    let mut value = serde_json::to_value(this).unwrap_or(Value::Null);
    canonical::canonicalize(&mut value);
    let (json, cut_short) = cut(
        &serde_json::to_string_pretty(&value).unwrap_or_default(),
        SLIDE_CHARS,
    );
    lines.push(format!(
        "\nThe deck's outline:\n{}\n\nThis slide in the deck's own format:\n{json}{}",
        outline(&deck),
        if cut_short {
            "\n…\n(The slide is cut here; get_slide has all of it.)"
        } else {
            ""
        },
    ));
    Ok(Context {
        title: deck.title,
        body: lines.join("\n"),
    })
}
