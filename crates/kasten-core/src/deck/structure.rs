//! The rules of the deck format that can be read from a deck's JSON, so that
//! text put together by a merge is not committed as a deck the editor and the
//! tools then refuse to open. They are the rules the Slides engine checks when
//! it opens a deck: every slide has an id, and no two share one; every slide is
//! on a layout its theme has; element ids are present and never repeat on a
//! slide; every section starts at a slide; the first slide is not a backup
//! slide; a theme's layouts have names of their own. Core does not depend on
//! the Slides engine, so they are written out here, over the JSON, in the
//! order the engine checks them, and kasten-mcp's tests hold the two together.

use std::collections::HashSet;

use serde_json::Value;

use crate::error::{Error, Result};

fn field<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

fn which(id: &str) -> &'static str {
    if id.is_empty() {
        "an empty"
    } else {
        "a repeated"
    }
}

/// Why the deck in `text` is not one the tools and the editor can work on, as
/// a clause (“section `A` starts at `s-9`, which is not a slide”), or `None`
/// when it is. The first rule it breaks is the one told.
pub fn structure_problem(text: &str) -> Option<String> {
    problem(text).err()
}

/// Checks the structure of the deck in `text`.
pub fn check_structure(text: &str) -> Result<()> {
    problem(text).map_err(|why| Error::Invalid(format!("Not a usable deck: {why}")))
}

fn problem(text: &str) -> std::result::Result<(), String> {
    let deck: Value = serde_json::from_str(text).map_err(|_| "it is not JSON".to_owned())?;
    let slides = deck
        .get("slides")
        .and_then(Value::as_array)
        .ok_or("it has no slides list")?;
    // A deck without a theme is as much as an old test file: only a theme that lists layouts can be held to them.
    let layouts = deck.pointer("/theme/layouts").and_then(Value::as_array);
    let mut ids = HashSet::new();
    for (i, slide) in slides.iter().enumerate() {
        let id = field(slide, "id");
        if id.is_empty() || !ids.insert(id) {
            return Err(format!("slide {} has {} id `{id}`", i + 1, which(id)));
        }
        if i == 0 && slide.get("backup").and_then(Value::as_bool) == Some(true) {
            return Err(
                "the first slide cannot be a backup slide: there is no slide above it to stack under"
                    .to_owned(),
            );
        }
        if let Some(layouts) = layouts {
            let layout = field(slide, "layout");
            if !layouts.iter().any(|l| field(l, "name") == layout) {
                return Err(format!(
                    "slide `{id}` uses the layout `{layout}`, which the theme does not have"
                ));
            }
        }
        check_elements(slide.get("elements"), id, &mut HashSet::new())?;
    }
    for section in deck
        .get("sections")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let starts = field(section, "startsAt");
        if !ids.contains(starts) {
            return Err(format!(
                "section `{}` starts at `{starts}`, which is not a slide",
                field(section, "title")
            ));
        }
    }
    let mut names = HashSet::new();
    for layout in layouts.into_iter().flatten() {
        let name = field(layout, "name");
        if !names.insert(name) {
            return Err(format!("the theme has two layouts called `{name}`"));
        }
    }
    Ok(())
}

/// Element ids are present and unique on their slide, the children of groups included.
fn check_elements<'a>(
    list: Option<&'a Value>,
    slide: &str,
    seen: &mut HashSet<&'a str>,
) -> std::result::Result<(), String> {
    for element in list.and_then(Value::as_array).into_iter().flatten() {
        let id = field(element, "id");
        if id.is_empty() || !seen.insert(id) {
            return Err(format!(
                "slide `{slide}` has {} element id `{id}`",
                which(id)
            ));
        }
        if field(element, "type") == "group" {
            check_elements(element.get("children"), slide, seen)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;

    /// A deck the Slides engine wrote: the dev vault's sample.
    fn sample() -> Value {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/dev-vault/library/tool-use-in-language-models.deck");
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    fn refuses(deck: &Value, why: &str) {
        let err = check_structure(&deck.to_string()).unwrap_err().to_string();
        assert!(err.starts_with("Not a usable deck: "), "{err}");
        assert!(err.contains(why), "{err}");
    }

    #[test]
    fn a_deck_the_engine_wrote_passes() {
        let deck = sample();
        assert!(deck["slides"].as_array().unwrap().len() >= 3);
        check_structure(&deck.to_string()).unwrap();
        assert_eq!(structure_problem(&deck.to_string()), None);
        // Sections that start at slides it has pass too.
        let mut sectioned = deck.clone();
        let second = deck["slides"][1]["id"].clone();
        sectioned["sections"] = json!([{ "title": "Part two", "startsAt": second }]);
        check_structure(&sectioned.to_string()).unwrap();
        // A deck with no theme is held to no layouts.
        check_structure(
            r#"{"format":"kasten-deck","formatVersion":1,"slides":[{"id":"s-1","layout":"x"}]}"#,
        )
        .unwrap();
    }

    #[test]
    fn the_problem_is_told_without_a_prefix() {
        let mut deck = sample();
        deck["sections"] = json!([{ "title": "Lost", "startsAt": "s-gone" }]);
        assert_eq!(
            structure_problem(&deck.to_string()).unwrap(),
            "section `Lost` starts at `s-gone`, which is not a slide"
        );
    }

    #[test]
    fn slide_ids_are_present_and_never_repeat() {
        let mut deck = sample();
        let first = deck["slides"][0].clone();
        deck["slides"].as_array_mut().unwrap().push(first);
        refuses(&deck, "has a repeated id");
        let mut deck = sample();
        deck["slides"][1]["id"] = json!("");
        refuses(&deck, "slide 2 has an empty id");
        let mut deck = sample();
        deck["slides"][1].as_object_mut().unwrap().remove("id");
        refuses(&deck, "slide 2 has an empty id");
    }

    #[test]
    fn a_section_starts_at_a_slide_that_is_there() {
        let mut deck = sample();
        deck["sections"] = json!([{ "title": "Lost", "startsAt": "s-gone" }]);
        refuses(
            &deck,
            "section `Lost` starts at `s-gone`, which is not a slide",
        );
    }

    #[test]
    fn a_slide_is_on_a_layout_the_theme_has_and_the_first_is_no_backup() {
        let mut deck = sample();
        deck["slides"][2]["layout"] = json!("no-such-layout");
        refuses(
            &deck,
            "uses the layout `no-such-layout`, which the theme does not have",
        );
        let mut deck = sample();
        deck["slides"][0]["backup"] = json!(true);
        refuses(&deck, "the first slide cannot be a backup slide");
        let mut deck = sample();
        let twin = deck["theme"]["layouts"][0].clone();
        deck["theme"]["layouts"].as_array_mut().unwrap().push(twin);
        refuses(&deck, "the theme has two layouts called");
    }

    #[test]
    fn element_ids_are_present_and_unique_on_a_slide_groups_included() {
        let deck = json!({ "format": "kasten-deck", "formatVersion": 1, "slides": [
            { "id": "s-1", "layout": "x", "elements": [
                { "id": "e-1", "type": "text" },
                { "id": "e-2", "type": "group", "children": [{ "id": "e-1", "type": "text" }] },
            ]},
        ]});
        refuses(&deck, "slide `s-1` has a repeated element id `e-1`");
        // Another slide may reuse an id: that is how Morph pairs elements.
        let ok = json!({ "format": "kasten-deck", "formatVersion": 1, "slides": [
            { "id": "s-1", "layout": "x", "elements": [{ "id": "e-1" }] },
            { "id": "s-2", "layout": "x", "elements": [{ "id": "e-1" }] },
        ]});
        check_structure(&ok.to_string()).unwrap();
        let empty = json!({ "format": "kasten-deck", "formatVersion": 1, "slides": [
            { "id": "s-1", "layout": "x", "elements": [{ "type": "text" }] },
        ]});
        refuses(&empty, "an empty element id");
        // Only a group has children the engine looks into.
        let other = json!({ "format": "kasten-deck", "formatVersion": 1, "slides": [
            { "id": "s-1", "layout": "x", "elements": [
                { "id": "e-1", "type": "shape", "children": [{ "id": "e-1" }, {}] },
            ]},
        ]});
        check_structure(&other.to_string()).unwrap();
    }

    #[test]
    fn text_that_is_not_a_deck_is_refused_with_a_reason() {
        refuses(&json!([1]), "no slides list");
        assert!(
            check_structure("nonsense")
                .unwrap_err()
                .to_string()
                .contains("not JSON")
        );
    }
}
