//! The pieces of a PowerPoint file that a `raw` element keeps so that an
//! export can write it back as it was: the parts its XML points at (a chart,
//! its workbook, a SmartArt's data ...) and the relationships between them.
//! They live in the element as one JSON object under the key `pptx`, and the
//! data of a part is base64, so a deck stays one self-contained file.

use serde_json::{Map, Value, json};

use crate::b64;

/// The key of the element's extra fields that holds what is kept.
pub const KEY: &str = "pptx";

/// Where a relationship points.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Target {
    /// A kept part, by its place in `Kept::parts`.
    Part(usize),
    /// An address outside the file.
    External(String),
}

/// A relationship: the id an XML part uses for it, what it is, and where it goes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Link {
    pub id: String,
    /// The full relationship type address.
    pub kind: String,
    pub to: Target,
}

/// A part of the file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Part {
    /// The name it had in the file.
    pub name: String,
    pub content_type: String,
    pub data: Vec<u8>,
    /// Its own relationships.
    pub links: Vec<Link>,
}

/// What an element keeps.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Kept {
    /// The relationships its XML uses.
    pub links: Vec<Link>,
    pub parts: Vec<Part>,
}

fn link_json(link: &Link) -> Value {
    match &link.to {
        Target::Part(at) => json!({ "id": link.id, "type": link.kind, "part": at }),
        Target::External(address) => {
            json!({ "id": link.id, "type": link.kind, "target": address, "external": true })
        }
    }
}

fn link_from(value: &Value) -> Option<Link> {
    let id = value.get("id")?.as_str()?.to_owned();
    let kind = value.get("type")?.as_str()?.to_owned();
    let to = match value.get("part").and_then(Value::as_u64) {
        Some(at) => Target::Part(usize::try_from(at).ok()?),
        None => Target::External(value.get("target")?.as_str()?.to_owned()),
    };
    Some(Link { id, kind, to })
}

impl Kept {
    pub fn is_empty(&self) -> bool {
        self.links.is_empty() && self.parts.is_empty()
    }

    pub fn to_json(&self) -> Value {
        let parts: Vec<Value> = self
            .parts
            .iter()
            .map(|p| {
                json!({
                    "name": p.name,
                    "contentType": p.content_type,
                    "data": b64::encode(&p.data),
                    "links": p.links.iter().map(link_json).collect::<Vec<_>>(),
                })
            })
            .collect();
        json!({
            "links": self.links.iter().map(link_json).collect::<Vec<_>>(),
            "parts": parts,
        })
    }

    /// Reads what an element keeps; None if the value is not that. A link to a
    /// part that is not there makes it None, so a damaged record is never half used.
    pub fn from_json(value: &Value) -> Option<Kept> {
        let links =
            |v: &Value| -> Option<Vec<Link>> { v.as_array()?.iter().map(link_from).collect() };
        let parts: Vec<Part> = value
            .get("parts")?
            .as_array()?
            .iter()
            .map(|p| {
                Some(Part {
                    name: p.get("name")?.as_str()?.to_owned(),
                    content_type: p.get("contentType")?.as_str()?.to_owned(),
                    data: b64::decode(p.get("data")?.as_str()?)?,
                    links: links(p.get("links")?)?,
                })
            })
            .collect::<Option<_>>()?;
        let kept = Kept {
            links: links(value.get("links")?)?,
            parts,
        };
        let count = kept.parts.len();
        let ok = |l: &Link| !matches!(l.to, Target::Part(at) if at >= count);
        (kept.links.iter().all(ok) && kept.parts.iter().all(|p| p.links.iter().all(ok)))
            .then_some(kept)
    }

    /// Puts the record into an element's extra fields.
    pub fn store(&self, extra: &mut Map<String, Value>) {
        if !self.is_empty() {
            extra.insert(KEY.to_owned(), self.to_json());
        }
    }

    #[cfg(test)]
    pub fn load(extra: &Map<String, Value>) -> Option<Kept> {
        Kept::from_json(extra.get(KEY)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Kept {
        Kept {
            links: vec![
                Link {
                    id: "rId2".into(),
                    kind: "http://x/chart".into(),
                    to: Target::Part(0),
                },
                Link {
                    id: "rId3".into(),
                    kind: "http://x/hyperlink".into(),
                    to: Target::External("https://example.com/".into()),
                },
            ],
            parts: vec![
                Part {
                    name: "ppt/charts/chart1.xml".into(),
                    content_type: "application/chart".into(),
                    data: vec![0, 1, 2, 255],
                    links: vec![Link {
                        id: "rId1".into(),
                        kind: "http://x/package".into(),
                        to: Target::Part(1),
                    }],
                },
                Part {
                    name: "ppt/embeddings/book.xlsx".into(),
                    content_type: "application/xlsx".into(),
                    data: b"PK".to_vec(),
                    links: vec![],
                },
            ],
        }
    }

    #[test]
    fn what_is_kept_goes_through_json_and_back() {
        let kept = sample();
        let mut extra = Map::new();
        kept.store(&mut extra);
        assert_eq!(Kept::load(&extra), Some(kept));
        let mut none = Map::new();
        Kept::default().store(&mut none);
        assert!(none.is_empty(), "nothing kept, nothing written");
    }

    #[test]
    fn a_record_with_a_link_to_a_part_that_is_not_there_is_refused() {
        let mut value = sample().to_json();
        value["parts"][0]["links"][0]["part"] = json!(9);
        assert_eq!(Kept::from_json(&value), None);
        assert_eq!(Kept::from_json(&json!({ "links": [] })), None);
        assert_eq!(Kept::from_json(&json!("text")), None);
    }
}
