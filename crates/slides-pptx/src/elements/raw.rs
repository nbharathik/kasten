//! `raw`: an object an import kept as it was (a chart, a diagram, a freeform shape ...), written
//! back as the XML it had, moved to where the element is now, with the parts it points at. An
//! element without that XML, or with XML that cannot be trusted, is written as its picture.

use std::collections::HashMap;

use slides_core::RawEl;

use super::common::Frame;
use super::{Site, picture};
use crate::allow;
use crate::cx::Cx;
use crate::import::dom::{self, Child, Node};
use crate::kept::relative;
use crate::rawpart::{self, Kept as Record, Target};
use crate::units::{angle, emu, length};
use crate::xml::Xml;

/// The shapes a slide's tree may hold, which are the only things kept XML may be.
const SHAPES: &[&str] = &["p:sp", "p:pic", "p:graphicFrame", "p:grpSp", "p:cxnSp"];

/// Where the slide part is, for the paths of what it points at: every part of the export that holds
/// shapes is one directory below `ppt/`.
const OWNER: &str = "ppt/slides/slide.xml";

/// `ppaction://` addresses that only move about the deck.
fn quiet_action(action: &str) -> bool {
    let lower = action.to_ascii_lowercase();
    lower.is_empty()
        || lower.starts_with("ppaction://hlinksldjump")
        || lower.starts_with("ppaction://hlinkshowjump")
}

/// Every relationship id the XML uses, and whether anything in it does more than show.
fn scan(node: &Node, ids: &mut Vec<String>, safe: &mut bool) {
    for (key, value) in &node.attrs {
        if key.starts_with("r:") && !value.is_empty() {
            ids.push(value.clone());
        }
        if key == "action" && !quiet_action(value) {
            *safe = false;
        }
    }
    // Things that run, or are an object of another program: never written back whole.
    if matches!(
        node.name.as_str(),
        "p:custDataLst" | "p:controls" | "p:timing" | "p:oleObj"
    ) {
        *safe = false;
    }
    for child in node.elements() {
        scan(child, ids, safe);
    }
}

fn renumber(node: &mut Node, cx: &mut Cx, first: &mut Option<u32>) {
    if node.name == "p:cNvPr" {
        let id = first.take().unwrap_or_else(|| cx.ids.fresh());
        node.set_attr("id", &id.to_string());
    }
    for child in node.elements_mut() {
        renumber(child, cx, first);
    }
}

fn remap(node: &mut Node, ids: &HashMap<String, String>) {
    for (key, value) in &mut node.attrs {
        if key.starts_with("r:")
            && let Some(new) = ids.get(value.as_str())
        {
            value.clone_from(new);
        }
    }
    for child in node.elements_mut() {
        remap(child, ids);
    }
}

fn xfrm(tag: &str, frame: &Frame, keep: Option<&Node>) -> Node {
    let mut out = Node::new(tag);
    let turn = angle(frame.rotation);
    if turn != 0 {
        out.set_attr("rot", &turn.to_string());
    }
    if frame.flip_h {
        out.set_attr("flipH", "1");
    }
    if frame.flip_v {
        out.set_attr("flipV", "1");
    }
    let mut off = Node::new("a:off");
    off.set_attr("x", &emu(frame.rect.x).to_string());
    off.set_attr("y", &emu(frame.rect.y).to_string());
    let mut ext = Node::new("a:ext");
    ext.set_attr("cx", &length(frame.rect.w).to_string());
    ext.set_attr("cy", &length(frame.rect.h).to_string());
    out.children = vec![Child::Node(off), Child::Node(ext)];
    // A group keeps the space its children are measured in.
    if let Some(old) = keep {
        for name in ["a:chOff", "a:chExt"] {
            if let Some(c) = old.child(name) {
                out.children.push(Child::Node(c.clone()));
            }
        }
    }
    out
}

/// Puts the frame into the shape's own transform, making one if it had none.
fn place(root: &mut Node, frame: &Frame) {
    if root.name == "p:graphicFrame" {
        let new = Child::Node(xfrm("p:xfrm", frame, None));
        match root
            .children
            .iter()
            .position(|c| matches!(c, Child::Node(n) if n.name == "p:xfrm"))
        {
            Some(at) => root.children[at] = new,
            None => {
                let after_nv = root
                    .children
                    .iter()
                    .position(|c| matches!(c, Child::Node(n) if n.name == "p:nvGraphicFramePr"))
                    .map_or(0, |i| i + 1);
                root.children.insert(after_nv, new);
            }
        }
        return;
    }
    let holder = if root.name == "p:grpSp" {
        "p:grpSpPr"
    } else {
        "p:spPr"
    };
    let Some(pr) = root.elements_mut().find(|n| n.name == holder) else {
        return;
    };
    let old = pr.child("a:xfrm").cloned();
    let new = Child::Node(xfrm("a:xfrm", frame, old.as_ref()));
    match pr
        .children
        .iter()
        .position(|c| matches!(c, Child::Node(n) if n.name == "a:xfrm"))
    {
        Some(at) => pr.children[at] = new,
        None => pr.children.insert(0, new),
    }
}

/// What the import called the object, for a sentence.
fn original_of(el: &RawEl) -> String {
    allow::shown(el.original.as_deref().unwrap_or("raw"))
}

/// The record of what the element keeps, or None if it holds a damaged one.
fn record_of(el: &RawEl) -> Option<Record> {
    match el.extra.get(rawpart::KEY) {
        None => Some(Record::default()),
        Some(value) => Record::from_json(value),
    }
}

/// Writes the element as the object it was. False when it cannot be, and nothing was written.
fn verbatim(x: &mut Xml, cx: &mut Cx, el: &RawEl, site: &Site) -> bool {
    let Some(source) = el.xml.as_deref() else {
        return false;
    };
    let Ok(doc) = dom::parse(source.as_bytes()) else {
        return false;
    };
    let mut root = doc.root;
    let Some(record) = record_of(el) else {
        return false;
    };
    if !SHAPES.contains(&root.name.as_str()) {
        return false;
    }
    let (mut used, mut safe) = (Vec::new(), true);
    scan(&root, &mut used, &mut safe);
    // What the export writes back of it is what shows something; the rest is said to be left out.
    let verdicts = allow::judge(&record);
    let left_out = allow::dropped(&record, &verdicts);
    for sentence in &left_out {
        cx.warn(format!(
            "in content the import kept as `{}`, {sentence}",
            original_of(el)
        ));
    }
    // Everything the XML points at must be something that is kept, and fit to write.
    let fit = |id: &String| {
        record
            .links
            .iter()
            .find(|l| &l.id == id)
            .is_some_and(|l| match &l.to {
                Target::Part(at) => verdicts.get(*at).is_some_and(Option::is_none),
                Target::External(address) => allow::refuse_address(&l.kind, address).is_none(),
            })
    };
    if !safe || !used.iter().all(fit) {
        cx.warn(format!(
            "content the import kept as `{}` is written as a picture, not as the object it was: it can act, or it holds or points at something an export does not write back",
            original_of(el)
        ));
        return false;
    }

    let names = cx.shared.kept.reserve(&record, &verdicts);
    let mut ids = HashMap::new();
    for link in &record.links {
        let new = match &link.to {
            Target::Part(at) => match names.get(*at) {
                Some(Some(name)) => {
                    cx.rels
                        .add_kept(None, &link.kind, &relative(OWNER, name), false)
                }
                _ => continue,
            },
            Target::External(address) if allow::refuse_address(&link.kind, address).is_none() => {
                cx.rels.add_kept(None, &link.kind, address.trim(), true)
            }
            Target::External(_) => continue,
        };
        ids.insert(link.id.clone(), new);
    }
    cx.shared.kept.commit(&record, &names, &ids);

    remap(&mut root, &ids);
    renumber(&mut root, cx, &mut Some(site.id));
    place(&mut root, &site.frame);
    x.verbatim(&dom::fragment(&root, &doc.declarations));
    true
}

pub fn write(x: &mut Xml, cx: &mut Cx, el: &RawEl, site: &Site) {
    if !verbatim(x, cx, el, site) {
        picture::write_raw(x, cx, el, site);
    }
}

#[cfg(test)]
mod tests;
