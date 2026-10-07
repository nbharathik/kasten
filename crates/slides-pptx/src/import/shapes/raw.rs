//! `raw`: what a deck cannot hold (a chart, a SmartArt diagram, an embedded
//! object, a freeform, a video). The element keeps the shape's own XML and the
//! parts it points at, so an export writes it back as it was; the editor
//! shows its picture, or a labelled box.

use std::collections::HashMap;

use slides_core::{Base, Element, Extra, RawEl, Style};

use super::base::{Nv, base_of};
use super::frame::Frame;
use crate::import::cx::Cx;
use crate::import::dom::{self, Node};
use crate::import::package::Rels;
use crate::import::report::RawNote;
use crate::rawpart::{Kept, Link, Part, Target};

/// The most a single kept part may hold, and all the kept parts of one import.
const MOST_PART: usize = 8 * 1024 * 1024;
const MOST_TOTAL: usize = 48 * 1024 * 1024;
/// How deep parts point at parts (a chart, its workbook ...).
const MOST_DEPTH: usize = 4;

/// Relationships that point back into the presentation, which are not a part of the object.
const NOT_FOLLOWED: &[&str] = &[
    "slide",
    "slideLayout",
    "slideMaster",
    "notesSlide",
    "notesMaster",
    "presentation",
    "theme",
];

fn what(original: &str) -> &'static str {
    match original {
        "pptx:chart" => "chart",
        "pptx:smartart" => "SmartArt diagram",
        "pptx:ole-object" => "embedded object",
        "pptx:custom-shape" => "freeform shape",
        "pptx:media" => "video or audio clip",
        "pptx:picture" => "picture",
        "pptx:table" => "table",
        _ => "object",
    }
}

fn relationship_ids(node: &Node, out: &mut Vec<String>) {
    for (key, value) in &node.attrs {
        if key.starts_with("r:") && !value.is_empty() && !out.contains(value) {
            out.push(value.clone());
        }
    }
    for child in node.elements() {
        relationship_ids(child, out);
    }
}

struct Collector<'a, 'x, 'b> {
    cx: &'a mut Cx<'x, 'b>,
    kept: Kept,
    seen: HashMap<String, usize>,
}

impl Collector<'_, '_, '_> {
    fn follow(&mut self, owner: &str, rels: &Rels, id: &str, depth: usize) -> Option<Link> {
        let rel = rels.get(id)?.clone();
        let to = if rel.external {
            Target::External(rel.target.clone())
        } else if NOT_FOLLOWED.contains(&rel.kind.as_str()) {
            return None;
        } else {
            let name = self.cx.imp.pkg.target(owner, &rel)?;
            Target::Part(self.part(&name, depth)?)
        };
        Some(Link {
            id: id.to_owned(),
            kind: rel.type_uri,
            to,
        })
    }

    fn part(&mut self, name: &str, depth: usize) -> Option<usize> {
        if let Some(at) = self.seen.get(name) {
            return Some(*at);
        }
        if depth > MOST_DEPTH {
            return None;
        }
        let data = self.cx.imp.pkg.read(name).ok()?;
        if data.len() > MOST_PART || self.cx.imp.raw_bytes + data.len() > MOST_TOTAL {
            self.cx.warn(format!(
                "`{name}` is too large to keep inside the deck; the object will export as its picture"
            ));
            return None;
        }
        self.cx.imp.raw_bytes += data.len();
        let at = self.kept.parts.len();
        self.seen.insert(name.to_owned(), at);
        self.kept.parts.push(Part {
            name: name.to_owned(),
            content_type: self
                .cx
                .imp
                .pkg
                .content_type(name)
                .unwrap_or_else(|| "application/octet-stream".to_owned()),
            data,
            links: Vec::new(),
        });
        let rels = self.cx.imp.pkg.rels_of(name);
        let links: Vec<Link> = rels
            .items
            .iter()
            .filter_map(|r| self.follow(name, &rels, &r.id, depth + 1))
            .collect();
        self.kept.parts[at].links = links;
        Some(at)
    }
}

/// Everything a shape's XML points at, with the relationships between the parts.
fn collect(cx: &mut Cx, node: &Node) -> Kept {
    let mut ids = Vec::new();
    relationship_ids(node, &mut ids);
    let owner = cx.part.name.clone();
    let rels = cx.part.rels.clone();
    let mut c = Collector {
        cx,
        kept: Kept::default(),
        seen: HashMap::new(),
    };
    for id in &ids {
        if let Some(link) = c.follow(&owner, &rels, id, 0) {
            c.kept.links.push(link);
        }
    }
    // A SmartArt diagram's drawing hangs from the slide by an id that only its data part names.
    let extra_ids: Vec<String> = c
        .kept
        .parts
        .iter()
        .filter(|p| p.data.windows(12).any(|w| w == b"dataModelExt"))
        .filter_map(|p| dom::parse(&p.data).ok())
        .flat_map(|doc| drawing_ids(&doc.root))
        .collect();
    for id in extra_ids {
        if !c.kept.links.iter().any(|l| l.id == id)
            && let Some(link) = c.follow(&owner, &rels, &id, 0)
        {
            c.kept.links.push(link);
        }
    }
    c.kept
}

fn drawing_ids(node: &Node) -> Vec<String> {
    let mut out = Vec::new();
    if node.name == "dsp:dataModelExt"
        && let Some(id) = node.attr("relId")
    {
        out.push(id.to_owned());
    }
    for child in node.elements() {
        out.extend(drawing_ids(child));
    }
    out
}

/// Keeps a shape as a `raw` element.
pub fn element(
    cx: &mut Cx,
    node: &Node,
    original: &str,
    nv: &Nv,
    frame: Option<&Frame>,
    preview: Option<String>,
    out: &mut Vec<Element>,
) {
    let mut base: Base = base_of(cx, nv, frame, None, Style::default());
    let kind = what(original);
    base.alt = Some(if nv.descr.is_empty() {
        format!("A PowerPoint {kind}, kept as it was; not editable here")
    } else {
        format!(
            "{} (a PowerPoint {kind}, kept as it was; not editable here)",
            nv.descr
        )
    });
    let mut extra = Extra::new();
    collect(cx, node).store(&mut extra);
    let xml = dom::fragment(node, &cx.part.declarations);
    if let Some(slide) = cx.part.slide.clone() {
        cx.imp.warnings.raw.push(RawNote {
            slide,
            element: base.id.clone(),
            original: original.to_owned(),
        });
    }
    cx.warn(format!(
        "a PowerPoint {kind} was kept as it was; it shows as a picture or a box and cannot be edited here"
    ));
    out.push(Element::Raw(RawEl {
        base,
        original: Some(original.to_owned()),
        xml: Some(xml),
        preview,
        extra,
    }));
}

#[cfg(test)]
mod tests;
