//! The sidecar: what is remembered about one picture. It is a small JSON
//! file in a hidden `.meta` folder beside the picture, one per picture, with
//! one key to a line so two computers' edits to it merge like text. Keys this
//! version does not know stay where they are when it writes the file again.
//!
//! ```text
//! assets/figure.png                 the picture, kept once
//! assets/.meta/figure.png.json      its sidecar
//! ```

use std::io;

use serde::{Deserialize, Serialize};
use serde_json::ser::{Formatter, Serializer};
use serde_json::{Map, Value};

/// The hidden folder a sidecar is in, inside the picture's own folder, so
/// moving or renaming the folder moves the sidecars with it.
pub const FOLDER: &str = ".meta";

/// Where a picture came from.
pub const SOURCES: [&str; 5] = ["pasted", "file", "pdf-clip", "agent", "pptx-import"];

/// The sidecar's keys in the order a new one is written.
const ORDER: [&str; 14] = [
    "id",
    "name",
    "sha256",
    "bytes",
    "width",
    "height",
    "source",
    "createdBy",
    "created",
    "tags",
    "caption",
    "citationKey",
    "clip",
    "deck",
];

/// The path of the sidecar of the picture at `picture`:
/// `assets/figure.png` has `assets/.meta/figure.png.json`.
pub fn sidecar_path(picture: &str) -> Option<String> {
    let (dir, name) = picture.rsplit_once('/')?;
    (!dir.is_empty() && !name.is_empty() && !name.starts_with('.'))
        .then(|| format!("{dir}/{FOLDER}/{name}.json"))
}

/// The picture a sidecar path belongs to; the inverse of [`sidecar_path`].
pub fn picture_path(sidecar: &str) -> Option<String> {
    let (folder, name) = sidecar.rsplit_once('/')?;
    let dir = folder.strip_suffix(FOLDER)?.strip_suffix('/')?;
    let name = name.strip_suffix(".json")?;
    (!dir.is_empty() && !name.is_empty()).then(|| format!("{dir}/{name}"))
}

/// The paper a figure was clipped from and where on it: the PDF's path, the
/// page from 1, and the rectangle in PDF points from the page's bottom left.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Clip {
    pub pdf: String,
    pub page: u32,
    pub rect: [f64; 4],
}

/// One picture's sidecar, kept as the JSON it was read as.
#[derive(Clone, Debug, PartialEq)]
pub struct Sidecar {
    doc: Map<String, Value>,
}

/// Compact JSON with a space after each `:` and `,`.
struct Spaced;

impl Formatter for Spaced {
    fn begin_array_value<W: ?Sized + io::Write>(
        &mut self,
        w: &mut W,
        first: bool,
    ) -> io::Result<()> {
        if first { Ok(()) } else { w.write_all(b", ") }
    }

    fn begin_object_key<W: ?Sized + io::Write>(
        &mut self,
        w: &mut W,
        first: bool,
    ) -> io::Result<()> {
        if first { Ok(()) } else { w.write_all(b", ") }
    }

    fn begin_object_value<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        w.write_all(b": ")
    }
}

fn line(value: &Value) -> String {
    let mut out = Vec::new();
    // Neither can fail: JSON keys are text, and the output is memory.
    let _ = value.serialize(&mut Serializer::with_formatter(&mut out, Spaced));
    String::from_utf8(out).unwrap_or_default()
}

impl Sidecar {
    /// A sidecar with an id and nothing else.
    pub fn new(id: &str) -> Sidecar {
        let mut card = Sidecar { doc: Map::new() };
        card.put("id", id.into());
        card.put("tags", Value::Array(Vec::new()));
        card
    }

    /// A sidecar in any JSON formatting; it must be an object.
    pub fn parse(text: &str) -> Result<Sidecar, String> {
        match serde_json::from_str::<Value>(text) {
            Ok(Value::Object(doc)) => Ok(Sidecar { doc }),
            Ok(_) => Err("its top level is not an object".to_owned()),
            Err(err) => Err(err.to_string()),
        }
    }

    /// The sidecar in house style: two-space indent, one key to a line, a
    /// final newline.
    pub fn to_text(&self) -> String {
        if self.doc.is_empty() {
            return "{}\n".to_owned();
        }
        let rows: Vec<String> = self
            .doc
            .iter()
            .map(|(key, value)| format!("  {}: {}", line(&Value::String(key.clone())), line(value)))
            .collect();
        format!("{{\n{}\n}}\n", rows.join(",\n"))
    }

    /// Sets `key`: where it already is, or after the last key that comes
    /// before it in the usual order.
    fn put(&mut self, key: &str, value: Value) {
        if self.doc.contains_key(key) {
            self.doc.insert(key.to_owned(), value);
            return;
        }
        let rank = |k: &str| ORDER.iter().position(|o| *o == k);
        let at = rank(key).map_or(self.doc.len(), |mine| {
            self.doc
                .keys()
                .rposition(|k| rank(k).is_some_and(|r| r < mine))
                .map_or(0, |last| last + 1)
        });
        self.doc.shift_insert(at, key.to_owned(), value);
    }

    fn take(&mut self, key: &str) {
        self.doc.shift_remove(key);
    }

    fn text(&self, key: &str) -> Option<&str> {
        self.doc
            .get(key)
            .and_then(Value::as_str)
            .filter(|t| !t.is_empty())
    }

    fn number(&self, key: &str) -> Option<u64> {
        self.doc.get(key).and_then(Value::as_u64)
    }

    pub fn id(&self) -> Option<&str> {
        self.text("id")
    }

    /// The name the picture came with.
    pub fn name(&self) -> Option<&str> {
        self.text("name")
    }

    pub fn sha256(&self) -> Option<&str> {
        self.text("sha256")
            .filter(|h| crate::sha256::is_hex_hash(h))
    }

    /// The picture's size in bytes when this was written.
    pub fn bytes(&self) -> Option<u64> {
        self.number("bytes")
    }

    pub fn size(&self) -> Option<(u32, u32)> {
        let both = (
            u32::try_from(self.number("width")?).ok()?,
            u32::try_from(self.number("height")?).ok()?,
        );
        (both.0 > 0 && both.1 > 0).then_some(both)
    }

    /// One of [`SOURCES`], or whatever another version wrote.
    pub fn source(&self) -> Option<&str> {
        self.text("source")
    }

    /// `person`, or `agent:<session>`.
    pub fn created_by(&self) -> Option<&str> {
        self.text("createdBy")
    }

    pub fn created(&self) -> Option<&str> {
        self.text("created")
    }

    pub fn tags(&self) -> Vec<String> {
        match self.doc.get("tags") {
            Some(Value::Array(items)) => items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect(),
            _ => Vec::new(),
        }
    }

    pub fn caption(&self) -> Option<&str> {
        self.text("caption")
    }

    pub fn citation_key(&self) -> Option<&str> {
        self.text("citationKey")
    }

    /// The name of the deck a PowerPoint import brought it from.
    pub fn deck(&self) -> Option<&str> {
        self.text("deck")
    }

    pub fn clip(&self) -> Option<Clip> {
        let clip = self.doc.get("clip")?.as_object()?;
        let numbers: Vec<f64> = clip
            .get("rect")?
            .as_array()?
            .iter()
            .filter_map(Value::as_f64)
            .collect();
        Some(Clip {
            pdf: clip.get("pdf")?.as_str()?.to_owned(),
            page: u32::try_from(clip.get("page")?.as_u64()?).ok()?,
            rect: <[f64; 4]>::try_from(numbers).ok()?,
        })
    }

    /// Sets the name, hash, size in bytes and pixels a picture has.
    pub fn set_file(&mut self, name: &str, sha256: &str, bytes: u64, size: Option<(u32, u32)>) {
        self.put("name", name.into());
        self.put("sha256", sha256.into());
        self.put("bytes", bytes.into());
        match size {
            Some((w, h)) => {
                self.put("width", w.into());
                self.put("height", h.into());
            }
            None => {
                self.take("width");
                self.take("height");
            }
        }
    }

    /// Sets how the picture came in, who did it, and when (RFC 3339).
    pub fn set_origin(&mut self, source: &str, created_by: &str, created: &str) {
        self.put("source", source.into());
        self.put("createdBy", created_by.into());
        self.put("created", created.into());
    }

    /// Sets the time only, for a picture whose way in is not known.
    pub fn set_created(&mut self, created: &str) {
        self.put("created", created.into());
    }

    pub fn set_tags(&mut self, tags: &[String]) {
        self.put(
            "tags",
            Value::Array(tags.iter().map(|t| t.as_str().into()).collect()),
        );
    }

    pub fn set_caption(&mut self, caption: Option<&str>) {
        self.set_optional("caption", caption);
    }

    pub fn set_citation_key(&mut self, key: Option<&str>) {
        self.set_optional("citationKey", key);
    }

    pub fn set_deck(&mut self, deck: Option<&str>) {
        self.set_optional("deck", deck);
    }

    fn set_optional(&mut self, key: &str, text: Option<&str>) {
        match text {
            Some(text) => self.put(key, text.into()),
            None => self.take(key),
        }
    }

    pub fn set_clip(&mut self, clip: Option<&Clip>) {
        let Some(clip) = clip else {
            return self.take("clip");
        };
        let mut value = Map::new();
        value.insert("pdf".to_owned(), clip.pdf.as_str().into());
        value.insert("page".to_owned(), clip.page.into());
        value.insert(
            "rect".to_owned(),
            Value::Array(clip.rect.iter().map(|n| points(*n)).collect()),
        );
        self.put("clip", Value::Object(value));
    }
}

/// Points to two decimals, as a PDF reader reports them; whole ones without
/// a decimal point.
fn points(n: f64) -> Value {
    let rounded = (n * 100.0).round() / 100.0;
    if rounded.fract() == 0.0 && rounded.abs() < 9e15 {
        Value::from(rounded as i64)
    } else {
        Value::from(rounded)
    }
}

#[cfg(test)]
mod tests;
