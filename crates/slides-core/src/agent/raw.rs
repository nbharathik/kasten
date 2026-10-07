//! Raw elements are what an import makes of an object it could not turn into anything else: the
//! XML of a chart, a diagram or a freeform shape, and the parts that XML points at, kept so that an
//! export writes them back as they were. That is why an assistant does not make them: whatever it
//! wrote would be written into a PowerPoint file. Whatever operation an assistant runs, one whose
//! input holds a raw element that is not already in the deck is refused, and so is a change to one
//! that is (it can still be moved, resized, arranged, copied and deleted).

use serde_json::Value;

use super::ToolError;
use crate::model::{Deck, Element, RawEl};

const WHY: &str = "Raw elements come from importing a PowerPoint file, and an assistant cannot make or change them.";

/// Every raw element in the deck, at any depth: on its slides and in its master.
fn raws(deck: &Deck) -> Vec<&RawEl> {
    fn walk<'a>(list: &'a [Element], out: &mut Vec<&'a RawEl>) {
        for element in list {
            if let Element::Raw(raw) = element {
                out.push(raw);
            }
            walk(element.children(), out);
        }
    }
    let mut out = Vec::new();
    walk(&deck.theme.master, &mut out);
    for slide in &deck.slides {
        walk(&slide.elements, &mut out);
    }
    out
}

/// The raw elements an input brings, at any depth, as they were written.
fn brought(input: &Value, out: &mut Vec<Value>) {
    match input {
        Value::Object(map) => {
            if map.get("type").and_then(Value::as_str) == Some("raw") {
                out.push(input.clone());
            }
            map.values().for_each(|v| brought(v, out));
        }
        Value::Array(items) => items.iter().for_each(|v| brought(v, out)),
        _ => {}
    }
}

/// Whether the element with this id, on the slide or inside a group on it, is a raw one.
fn is_raw(list: &[Element], id: &str) -> bool {
    list.iter().any(|e| {
        if e.id() == id {
            return matches!(e, Element::Raw(_));
        }
        is_raw(e.children(), id)
    })
}

/// Refuses an operation that would make or change a raw element. `deck` is the deck it is about to
/// be applied to; an element identical to one that is already there is a copy, not a new thing.
/// Every operation is looked at: elements come in by `add_elements` and `paste_elements`, whole in
/// slides and decks, and in a patch of the theme's master.
pub(super) fn refuse(deck: &Deck, op: &str, input: &Value) -> Result<(), ToolError> {
    let mut found = Vec::new();
    brought(input, &mut found);
    if !found.is_empty() {
        let there = raws(deck);
        for value in found {
            // What cannot be read as an element is the operation's to refuse, in its own words.
            let Ok(Element::Raw(new)) = serde_json::from_value::<Element>(value) else {
                continue;
            };
            if !there.iter().any(|old| **old == new) {
                let which = match new.base.id.as_str() {
                    "" => "a raw element".to_owned(),
                    id => format!("the raw element `{id}`"),
                };
                return Err(ToolError::new(format!(
                    "`{op}` cannot bring in {which}. {WHY} Show what you mean with a text, shape, image or table element instead, or add the file's slides with import_pptx."
                )));
            }
        }
    }
    if op == "patch_elements"
        && let Some(slide) = input
            .get("slide")
            .and_then(Value::as_str)
            .and_then(|id| deck.slide(id))
    {
        for patch in input
            .get("patches")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let id = patch.get("id").and_then(Value::as_str).unwrap_or("");
            if is_raw(&slide.elements, id) {
                return Err(ToolError::new(format!(
                    "`{op}` cannot change the raw element `{id}`. {WHY} Leave it as it is, move or resize it with transform_elements, or take it away with delete_elements."
                )));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::model::{Base, Extra};

    fn raw(id: &str) -> Element {
        Element::Raw(RawEl {
            base: Base::new(id).place(100.0, 100.0, 200.0, 100.0),
            original: Some("pptx:chart".into()),
            xml: Some("<p:graphicFrame/>".into()),
            preview: None,
            extra: Extra::new(),
        })
    }

    #[test]
    fn raw_elements_are_found_at_any_depth_of_what_an_operation_is_given() {
        let input = json!({ "slides": [{ "elements": [
            { "type": "text", "id": "a" },
            { "type": "group", "id": "g", "children": [{ "type": "raw", "id": "deep" }] }
        ] }], "note": { "type": "rawish" } });
        let mut found = Vec::new();
        brought(&input, &mut found);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0]["id"], "deep");
    }

    #[test]
    fn an_element_is_a_copy_only_when_it_is_the_same_in_every_way() {
        let mut deck = crate::ops::Engine::create("T", "Light", 1)
            .unwrap_or_else(|e| panic!("{e}"))
            .into_deck();
        deck.slides[0].elements.push(raw("e-chart"));
        let same = serde_json::to_value(raw("e-chart")).unwrap_or_default();
        let input = json!({ "slide": "s", "elements": [same] });
        assert!(refuse(&deck, "add_elements", &input).is_ok());
        let mut other = raw("e-chart");
        if let Element::Raw(r) = &mut other {
            r.xml = Some("<p:graphicFrame><p:oleObj/></p:graphicFrame>".into());
        }
        let input = json!({ "slide": "s", "elements": [other] });
        let why = refuse(&deck, "add_elements", &input)
            .expect_err("changed")
            .message;
        assert!(
            why.contains("e-chart") && why.contains("importing a PowerPoint file"),
            "{why}"
        );
        // Whatever the operation is called, the elements it is given are looked at.
        assert!(refuse(&deck, "edit_theme", &input).is_err());
        assert!(
            refuse(
                &deck,
                "transform_elements",
                &json!({ "items": [{ "id": "e-chart", "x": 5 }] })
            )
            .is_ok()
        );
    }
}
