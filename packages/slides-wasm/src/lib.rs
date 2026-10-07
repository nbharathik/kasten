//! slides-core in the browser. The editor makes one `SlidesEngine` per deck
//! and applies every change through it; the typed wrapper in `ts/` is what
//! the editor imports. Everything crosses as JSON text: it is simple, and one
//! `JSON.parse` of a slide costs far less than the change it reports.

use std::collections::HashMap;

use serde::Deserialize;
use slides_core::{Applied, Changes, Engine, canonical};
use wasm_bindgen::prelude::{JsValue, wasm_bindgen};

mod import;
mod lint;
mod references;

/// An error as JSON text: `{"kind": "noSuchSlide", "id": "...", "message": "..."}`.
fn fail(e: slides_core::Error) -> JsValue {
    let mut value = serde_json::to_value(&e).unwrap_or(serde_json::Value::Null);
    if let Some(map) = value.as_object_mut() {
        map.insert(
            "message".to_owned(),
            serde_json::Value::String(e.to_string()),
        );
    }
    JsValue::from_str(&value.to_string())
}

fn json<T: serde::Serialize>(value: &T) -> Result<String, JsValue> {
    serde_json::to_string(value).map_err(|e| fail(slides_core::Error::invalid(e.to_string())))
}

/// The deck format version this build reads and writes.
#[wasm_bindgen(js_name = formatVersion)]
pub fn format_version() -> u32 {
    slides_core::FORMAT_VERSION
}

/// Every operation with its purpose and schemas, as JSON.
#[wasm_bindgen]
pub fn specs() -> Result<String, JsValue> {
    json(&slides_core::ops::specs())
}

/// The built-in themes' names, as JSON.
#[wasm_bindgen(js_name = themeNames)]
pub fn theme_names() -> Result<String, JsValue> {
    json(
        &slides_core::themes::all()
            .iter()
            .map(|t| t.name.clone())
            .collect::<Vec<_>>(),
    )
}

/// The pictures of a deck, by the paths it names them with.
struct Pictures(HashMap<String, Vec<u8>>);

impl slides_pptx::Media for Pictures {
    fn read(&self, path: &str) -> Option<Vec<u8>> {
        self.0.get(path).cloned()
    }
}

/// What a slide with steps becomes in the file.
#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum StepsOption {
    Expand,
    Final,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ExportOptions {
    notes: Option<bool>,
    include_hidden: Option<bool>,
    steps: Option<StepsOption>,
}

/// An exported file and what could not be written exactly.
#[wasm_bindgen]
pub struct PptxFile {
    bytes: Vec<u8>,
    warnings: String,
}

#[wasm_bindgen]
impl PptxFile {
    /// The `.pptx` file.
    #[wasm_bindgen(getter)]
    pub fn bytes(&self) -> Vec<u8> {
        self.bytes.clone()
    }

    /// `[{"slide": ..., "element": ..., "message": ...}]` as JSON text.
    #[wasm_bindgen(getter)]
    pub fn warnings(&self) -> String {
        self.warnings.clone()
    }
}

/// The order elements are read in, given their boxes as `[[x, y, w, h] or null, ...]`: the
/// places of the boxes in reading order as a JSON array, rows from top to bottom and each
/// row from left to right; a null (no box) comes last.
#[wasm_bindgen(js_name = readingOrder)]
pub fn reading_order(boxes: &str) -> Result<String, JsValue> {
    let boxes: Vec<Option<[f64; 4]>> = serde_json::from_str(boxes)
        .map_err(|e| fail(slides_core::Error::bad_input("reading_order", e)))?;
    let boxes: Vec<Option<slides_core::resolve::Rect>> = boxes
        .into_iter()
        .map(|b| b.map(|[x, y, w, h]| slides_core::resolve::Rect { x, y, w, h }))
        .collect();
    json(&slides_core::ops::order_of(&boxes))
}

/// A composite element (code, math, a chat ...) as the group of the primitives it is drawn
/// with, in slide coordinates, as JSON; null for an element that is not a composite or has no box.
/// A citation is written from the page's bibliography (`setReferences`) and numbered by `order`,
/// the works the deck cites as a JSON array of keys in the order of their numbers; without it
/// a citation numbers its own keys from 1.
#[wasm_bindgen(js_name = expandElement)]
pub fn expand_element(
    theme: &str,
    layout: &str,
    element: &str,
    order: Option<String>,
) -> Result<Option<String>, JsValue> {
    let theme: slides_core::Theme = serde_json::from_str(theme)
        .map_err(|e| fail(slides_core::Error::bad_input("expand", e)))?;
    let element: slides_core::Element = serde_json::from_str(element)
        .map_err(|e| fail(slides_core::Error::bad_input("expand", e)))?;
    references::expanded(&theme, layout, &element, order.as_deref())?
        .map(|group| json(&group))
        .transpose()
}

/// Does the slow first-use work of drawing code (loading the syntax definitions) on a throw-away
/// snippet, so that the first slide with a code block does not wait for it. Call it when the page
/// is idle; it changes nothing, and calling it again costs next to nothing.
#[wasm_bindgen(js_name = warmUp)]
pub fn warm_up() {
    slides_core::composites::warm_up();
}

/// A deck being edited.
#[wasm_bindgen]
pub struct SlidesEngine {
    inner: Engine,
}

#[wasm_bindgen]
impl SlidesEngine {
    /// A new deck with a title slide. `seed` starts the ids of everything new.
    pub fn create(title: &str, theme: &str, seed: f64) -> Result<SlidesEngine, JsValue> {
        Engine::create(title, theme, seed as u64)
            .map(|inner| SlidesEngine { inner })
            .map_err(fail)
    }

    /// Opens the text of a `.deck` file.
    pub fn open(text: &str, seed: f64) -> Result<SlidesEngine, JsValue> {
        canonical::parse(text)
            .map(|deck| SlidesEngine {
                inner: Engine::new(deck, seed as u64),
            })
            .map_err(fail)
    }

    /// The whole deck as JSON.
    pub fn deck(&self) -> Result<String, JsValue> {
        json(self.inner.deck())
    }

    /// The deck as a Markdown outline: a heading for each slide, its text, and its notes.
    pub fn outline(&self) -> String {
        slides_core::outline::outline_of(self.inner.deck())
    }

    /// The text to save in the `.deck` file.
    pub fn save(&self) -> Result<String, JsValue> {
        canonical::write(self.inner.deck()).map_err(fail)
    }

    /// Applies an operation. Returns `{"output": ..., "changes": ...}` as JSON.
    pub fn apply(&mut self, op: &str, input: &str) -> Result<String, JsValue> {
        let input =
            serde_json::from_str(input).map_err(|e| fail(slides_core::Error::bad_input(op, e)))?;
        self.inner.set_references(references::shared());
        self.inner
            .apply(op, input)
            .map_err(fail)
            .and_then(|applied| json(&applied))
    }

    /// Applies `[["op", {...}], ...]` as one step. Returns a JSON array of results.
    #[wasm_bindgen(js_name = applyBatch)]
    pub fn apply_batch(&mut self, operations: &str) -> Result<String, JsValue> {
        let operations: Vec<(String, serde_json::Value)> = serde_json::from_str(operations)
            .map_err(|e| fail(slides_core::Error::bad_input("batch", e)))?;
        self.inner.set_references(references::shared());
        let applied: Vec<Applied> = self.inner.apply_batch(operations).map_err(fail)?;
        json(&applied)
    }

    /// The deck as a PowerPoint file. `names` is a JSON array of the picture paths the deck
    /// uses that the caller has; `bytes` holds those pictures one after another and `lengths`
    /// says how long each is. A picture that was not given is a grey box and a warning.
    #[wasm_bindgen(js_name = exportPptx)]
    pub fn export_pptx(
        &self,
        options: &str,
        names: &str,
        bytes: &[u8],
        lengths: &[u32],
    ) -> Result<PptxFile, JsValue> {
        let options: ExportOptions = serde_json::from_str(options)
            .map_err(|e| fail(slides_core::Error::bad_input("export", e)))?;
        let names: Vec<String> = serde_json::from_str(names)
            .map_err(|e| fail(slides_core::Error::bad_input("export", e)))?;
        if names.len() != lengths.len() {
            return Err(fail(slides_core::Error::invalid(
                "every picture needs a name and a length",
            )));
        }
        let mut pictures = HashMap::new();
        let mut at = 0usize;
        for (name, length) in names.into_iter().zip(lengths) {
            let end = at + *length as usize;
            let part = bytes.get(at..end).ok_or_else(|| {
                fail(slides_core::Error::invalid(
                    "the pictures are shorter than their lengths say",
                ))
            })?;
            pictures.insert(name, part.to_vec());
            at = end;
        }
        let defaults = slides_pptx::Options::default();
        let shared = references::shared();
        let exported = slides_pptx::export_with(
            self.inner.deck(),
            &Pictures(pictures),
            &slides_pptx::Options {
                notes: options.notes.unwrap_or(defaults.notes),
                include_hidden: options.include_hidden.unwrap_or(defaults.include_hidden),
                steps: match options.steps {
                    Some(StepsOption::Expand) => slides_pptx::StepsMode::Expand,
                    Some(StepsOption::Final) => slides_pptx::StepsMode::Final,
                    None => defaults.steps,
                },
                ..defaults
            },
            shared.as_deref(),
        )
        .map_err(|e| fail(slides_core::Error::invalid(e.to_string())))?;
        let warnings: Vec<serde_json::Value> = exported
            .warnings
            .iter()
            .map(|w| {
                serde_json::json!({ "slide": w.slide, "element": w.element, "message": w.message })
            })
            .collect();
        Ok(PptxFile {
            bytes: exported.bytes,
            warnings: serde_json::Value::Array(warnings).to_string(),
        })
    }

    /// Takes back the last step; the changes as JSON, or nothing to undo.
    pub fn undo(&mut self) -> Result<Option<String>, JsValue> {
        self.inner.undo().map(|c: Changes| json(&c)).transpose()
    }

    pub fn redo(&mut self) -> Result<Option<String>, JsValue> {
        self.inner.redo().map(|c: Changes| json(&c)).transpose()
    }

    #[wasm_bindgen(js_name = canUndo)]
    pub fn can_undo(&self) -> bool {
        self.inner.can_undo()
    }

    #[wasm_bindgen(js_name = canRedo)]
    pub fn can_redo(&self) -> bool {
        self.inner.can_redo()
    }

    #[wasm_bindgen(js_name = undoLabel)]
    pub fn undo_label(&self) -> Option<String> {
        self.inner.undo_label().map(str::to_owned)
    }

    #[wasm_bindgen(js_name = redoLabel)]
    pub fn redo_label(&self) -> Option<String> {
        self.inner.redo_label().map(str::to_owned)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_the_core_format_version() {
        assert_eq!(format_version(), slides_core::FORMAT_VERSION);
    }

    #[test]
    fn exports_a_deck_as_a_zip_of_parts() {
        let engine = SlidesEngine::create("Deck", "Light", 3.0).unwrap();
        let file = engine.export_pptx("{}", "[]", &[], &[]).unwrap();
        let bytes = file.bytes();
        assert_eq!(&bytes[..2], b"PK");
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("ppt/slides/slide1.xml"));
        assert_eq!(file.warnings(), "[]");
    }

    #[test]
    fn export_says_what_a_slide_with_steps_becomes() {
        let mut engine = SlidesEngine::create("Deck", "Light", 3.0).unwrap();
        let slide = engine.deck().unwrap();
        let slide: serde_json::Value = serde_json::from_str(&slide).unwrap();
        let id = slide["slides"][0]["id"].as_str().unwrap().to_owned();
        engine
            .apply(
                "set_slide_steps",
                &format!(r#"{{"slide":"{id}","steps":2}}"#),
            )
            .unwrap();
        let count = |options: &str| {
            let file = engine.export_pptx(options, "[]", &[], &[]).unwrap();
            let bytes = file.bytes();
            let text = String::from_utf8_lossy(&bytes);
            (1..=4)
                .filter(|n| text.contains(&format!("ppt/slides/slide{n}.xml")))
                .count()
        };
        assert_eq!(
            count("{}"),
            3,
            "a slide for each state unless asked otherwise"
        );
        assert_eq!(count(r#"{"steps":"expand"}"#), 3);
        assert_eq!(count(r#"{"steps":"final"}"#), 1);
    }

    #[test]
    fn the_export_options_name_what_a_slide_with_steps_becomes() {
        let steps =
            |text: &str| serde_json::from_str::<ExportOptions>(text).map(|o| o.steps.is_some());
        assert_eq!(steps("{}").ok(), Some(false));
        assert_eq!(steps(r#"{"steps":"expand"}"#).ok(), Some(true));
        assert_eq!(steps(r#"{"steps":"final"}"#).ok(), Some(true));
        let refused = steps(r#"{"steps":"some"}"#).unwrap_err().to_string();
        assert!(
            refused.contains("expand") && refused.contains("final"),
            "{refused}"
        );
    }

    #[test]
    fn reading_order_takes_boxes_and_answers_places() {
        let order =
            reading_order("[[400,300,100,50],[60,100,100,50],null,[400,100,100,50]]").unwrap();
        assert_eq!(order, "[1,3,0,2]");
    }

    #[test]
    fn creates_applies_and_undoes_through_json() {
        let mut engine = SlidesEngine::create("Deck", "Light", 3.0).unwrap();
        let before = engine.save().unwrap();
        let out = engine.apply("set_title", r#"{"title":"New"}"#).unwrap();
        assert!(out.contains("\"meta\""), "{out}");
        assert_ne!(engine.save().unwrap(), before);
        assert!(engine.can_undo());
        engine.undo().unwrap().unwrap();
        assert_eq!(engine.save().unwrap(), before);
    }
}
