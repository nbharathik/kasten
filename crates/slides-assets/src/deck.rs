//! Which pictures a deck uses, for "used in" and for checking that they are
//! there. A deck is read as plain JSON, so any version of the format works:
//! the pictures are the ones its image elements name, the previews of what
//! could not be imported, the posters of embedded pages and videos, and slide
//! backgrounds, wherever they sit.

use std::collections::BTreeSet;

use serde_json::{Map, Value};

/// The pictures of a deck, slide by slide.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckImages {
    /// Each slide's id, in order, with the paths of its pictures.
    pub slides: Vec<(String, BTreeSet<String>)>,
    /// The pictures of everything that is not a slide: the theme's master,
    /// which shows on every slide that uses it.
    pub theme: BTreeSet<String>,
}

fn collect(value: &Value, found: &mut BTreeSet<String>) {
    match value {
        Value::Array(items) => items.iter().for_each(|item| collect(item, found)),
        Value::Object(fields) => {
            let named = |key: &str| {
                fields
                    .get(key)
                    .and_then(Value::as_str)
                    .filter(|path| !path.is_empty())
            };
            let path = match fields.get("type").and_then(Value::as_str) {
                Some("image") => named("src"),
                Some("raw") => named("preview"),
                // The picture an embedded page or a video shows before it plays.
                Some("embed" | "video") => named("poster"),
                _ => None,
            };
            found.extend(path.map(str::to_owned));
            if let Some(image) = fields
                .get("background")
                .and_then(|b| b.get("image"))
                .and_then(Value::as_str)
                .filter(|path| !path.is_empty())
            {
                found.insert(image.to_owned());
            }
            fields.values().for_each(|field| collect(field, found));
        }
        _ => {}
    }
}

/// The paths of the pictures a deck uses, sorted and without repeats. Text
/// that is not a deck names none.
pub fn images_of(text: &str) -> Vec<String> {
    let mut found = BTreeSet::new();
    if let Ok(value) = serde_json::from_str::<Value>(text) {
        collect(&value, &mut found);
    }
    found.into_iter().collect()
}

/// The pictures of the deck in `text`, by slide; None when the text is not a
/// deck.
pub fn images_by_slide(text: &str) -> Option<DeckImages> {
    let Value::Object(deck) = serde_json::from_str::<Value>(text).ok()? else {
        return None;
    };
    let mut out = DeckImages {
        slides: Vec::new(),
        theme: BTreeSet::new(),
    };
    for (key, value) in &deck {
        if key != "slides" {
            // As a one-key object, so a `background` of the deck itself counts.
            let mut alone = Map::new();
            alone.insert(key.clone(), value.clone());
            collect(&Value::Object(alone), &mut out.theme);
            continue;
        }
        for slide in value.as_array().map(Vec::as_slice).unwrap_or_default() {
            let id = slide.get("id").and_then(Value::as_str).unwrap_or_default();
            let mut found = BTreeSet::new();
            collect(slide, &mut found);
            out.slides.push((id.to_owned(), found));
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DECK: &str = r#"{
      "format": "kasten-deck",
      "theme": {"master": [{"type": "image", "src": "assets/logo.png"}]},
      "slides": [
        {"id": "s-1", "elements": []},
        {"id": "s-2", "background": {"image": "assets/bg.png"},
         "elements": [{"type": "group", "children": [{"type": "image", "src": "assets/a.png"}]}]},
        {"id": "s-3", "elements": [{"type": "raw", "preview": "assets/p.png"}, {"type": "image", "src": ""},
         {"type": "video", "src": "assets/clip.mp4", "poster": "assets/poster.png"},
         {"type": "embed", "url": "https://example.com", "poster": "assets/page.png"}]}
      ]
    }"#;

    #[test]
    fn pictures_are_kept_apart_by_slide_and_from_the_theme() {
        let found = images_by_slide(DECK).unwrap();
        let names = |set: &BTreeSet<String>| set.iter().cloned().collect::<Vec<_>>();
        assert_eq!(found.slides.len(), 3);
        assert_eq!(
            (found.slides[0].0.as_str(), names(&found.slides[0].1)),
            ("s-1", vec![])
        );
        assert_eq!(names(&found.slides[1].1), ["assets/a.png", "assets/bg.png"]);
        assert_eq!(
            names(&found.slides[2].1),
            ["assets/p.png", "assets/page.png", "assets/poster.png"],
            "the posters of a video and an embedded page count; the video itself is not a picture"
        );
        assert_eq!(names(&found.theme), ["assets/logo.png"]);
        assert_eq!(images_by_slide("not json"), None);
        assert_eq!(images_by_slide("[1]"), None);
    }

    #[test]
    fn all_of_a_decks_pictures_sorted_and_once() {
        assert_eq!(
            images_of(DECK),
            [
                "assets/a.png",
                "assets/bg.png",
                "assets/logo.png",
                "assets/p.png",
                "assets/page.png",
                "assets/poster.png"
            ]
        );
        assert!(images_of("nonsense").is_empty());
    }

    #[test]
    fn a_background_of_the_deck_itself_is_the_themes() {
        let deck =
            r#"{"format":"kasten-deck","background":{"image":"assets/wall.png"},"slides":[]}"#;
        assert_eq!(images_by_slide(deck).unwrap().theme.len(), 1);
    }
}
