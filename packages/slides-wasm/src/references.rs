//! The bibliography a page has: BibTeX text the host gave once (`setReferences`), read
//! into one set that citations are written from, checked against, and listed from. It is
//! the host's, like the fonts a page has, not any deck's: every deck opened in the page
//! sees the same set, and giving a new one is not a change to a deck.

use std::cell::RefCell;
use std::sync::Arc;

use slides_core::citations::{Cites, Numbering, Refs};
use slides_core::{Element, Theme};
use wasm_bindgen::prelude::{JsValue, wasm_bindgen};

use super::{SlidesEngine, fail, json};

thread_local! {
    static SHARED: RefCell<Option<Arc<Refs>>> = const { RefCell::new(None) };
}

/// The page's bibliography, if the host gave one.
pub(crate) fn shared() -> Option<Arc<Refs>> {
    SHARED.with(|shared| shared.borrow().clone())
}

/// Gives the page its bibliography as BibTeX text: every `.bib` file the host has, one after
/// another (a key in two entries is the first one's). An empty text is a bibliography with
/// nothing in it, so every key is unknown; `undefined` takes the bibliography away, and then
/// keys are written as they are and lint does not check them.
#[wasm_bindgen(js_name = setReferences)]
pub fn set_references(bibtex: Option<String>) {
    SHARED.with(|shared| {
        *shared.borrow_mut() = bibtex.map(|text| Arc::new(Refs::from_bibtex(&text)));
    });
}

/// The works of the page's bibliography as JSON, in the order written (`Reference[]`),
/// or `null` when the host gave none.
#[wasm_bindgen]
pub fn references() -> Result<String, JsValue> {
    match shared() {
        Some(refs) => json(&refs.references()),
        None => Ok("null".to_owned()),
    }
}

/// The key of the bibliography that looks most like `key`, if one is near enough to be a typo.
#[wasm_bindgen(js_name = closestReference)]
pub fn closest_reference(key: &str) -> Option<String> {
    shared()?.closest(key).map(str::to_owned)
}

/// A composite as a group, written from the page's bibliography and numbered by `order`.
pub(crate) fn expanded(
    theme: &Theme,
    layout: &str,
    element: &Element,
    order: Option<&str>,
) -> Result<Option<Element>, JsValue> {
    let numbering = order
        .map(|text| {
            serde_json::from_str::<Vec<String>>(text)
                .map(Numbering::new)
                .map_err(|e| fail(slides_core::Error::bad_input("expand", e)))
        })
        .transpose()?;
    let refs = shared();
    let cites = Cites {
        refs: refs.as_deref(),
        numbering: numbering.as_ref(),
    };
    Ok(slides_core::composites::expanded_group_with(
        theme, layout, element, &cites,
    ))
}

#[wasm_bindgen]
impl SlidesEngine {
    /// The works the deck cites, as a JSON array of keys in the order of their numbers.
    #[wasm_bindgen(js_name = citationOrder)]
    pub fn citation_order(&self) -> Result<String, JsValue> {
        json(&Numbering::of(self.inner.deck()).keys().collect::<Vec<_>>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BIB: &str = "@article{a, title={Deep learning}, author={LeCun, Yann and Bengio, Yoshua}, journal={Nature}, year={2015}}";

    #[test]
    fn the_page_has_no_bibliography_until_the_host_gives_one() {
        set_references(None);
        assert_eq!(references().unwrap(), "null");
        assert_eq!(closest_reference("a"), None);
        set_references(Some(BIB.to_owned()));
        let listed = references().unwrap();
        assert!(listed.contains("\"key\":\"a\""), "{listed}");
        assert!(
            listed.contains("LeCun and Bengio, 2015 (Nature)"),
            "{listed}"
        );
        assert_eq!(closest_reference("b"), Some("a".to_owned()));
        set_references(Some(String::new()));
        assert_eq!(references().unwrap(), "[]");
        set_references(None);
    }

    #[test]
    fn a_citation_is_written_from_the_bibliography_and_the_order_it_is_given() {
        let theme = slides_core::themes::light();
        let element: Element = serde_json::from_str(
            r#"{"type":"citation","id":"c","x":64,"y":480,"w":700,"h":28,"format":"numbered","keys":["a","b"]}"#,
        )
        .unwrap();
        set_references(None);
        let numbers = |order: Option<&str>| -> String {
            let group = expanded(&theme, "blank", &element, order).unwrap().unwrap();
            group.children()[0].text().unwrap().plain_text()
        };
        assert_eq!(numbers(None), "[1][2]");
        assert_eq!(numbers(Some(r#"["x","b","a"]"#)), "[3][2]");
        set_references(Some(BIB.to_owned()));
        assert_eq!(
            numbers(Some(r#"["x","b","a"]"#)),
            "[3][b?]",
            "a is the third work; b is not in the bibliography, so it is marked"
        );
        set_references(None);
    }
}
