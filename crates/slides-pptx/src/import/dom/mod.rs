//! A small XML tree for reading a PowerPoint file's parts.
//!
//! Names are made canonical while reading: an element or attribute in a
//! namespace PowerPoint uses is spelled with the usual prefix (`a:`, `p:`,
//! `r:` ...) whatever prefix the file chose, so the readers above look for
//! `a:off` and find it in a file that wrote `ns1:off`. Names in any other
//! namespace keep the prefix they came with, and so do the declarations they
//! need. Entities are never expanded beyond the five predefined ones and
//! character references, and a document type is refused, so a hostile file
//! cannot make the reader do work the file's size does not pay for.

mod read;
mod write;

use std::fmt;

pub use read::parse;
pub use write::fragment;

/// The deepest nesting read. PowerPoint's own files stay far under it.
pub const MAX_DEPTH: usize = 120;
/// The most elements one part may hold.
pub const MAX_NODES: usize = 600_000;
/// The most attributes one element may carry.
const MAX_ATTRIBUTES: usize = 200;

/// The namespaces that get a fixed prefix.
const KNOWN: &[(&str, &str)] = &[
    ("http://schemas.openxmlformats.org/drawingml/2006/main", "a"),
    ("http://purl.oclc.org/ooxml/drawingml/main", "a"),
    (
        "http://schemas.openxmlformats.org/presentationml/2006/main",
        "p",
    ),
    ("http://purl.oclc.org/ooxml/presentationml/main", "p"),
    (
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "r",
    ),
    (
        "http://purl.oclc.org/ooxml/officeDocument/relationships",
        "r",
    ),
    (
        "http://schemas.openxmlformats.org/markup-compatibility/2006",
        "mc",
    ),
    (
        "http://schemas.microsoft.com/office/powerpoint/2010/main",
        "p14",
    ),
    (
        "http://schemas.microsoft.com/office/powerpoint/2012/main",
        "p15",
    ),
    (
        "http://schemas.microsoft.com/office/powerpoint/2015/09/main",
        "p159",
    ),
    (
        "http://schemas.microsoft.com/office/drawing/2010/main",
        "a14",
    ),
    (
        "http://schemas.microsoft.com/office/drawing/2014/main",
        "a16",
    ),
    (
        "http://schemas.microsoft.com/office/drawing/2016/SVG/main",
        "asvg",
    ),
    (
        "http://schemas.openxmlformats.org/drawingml/2006/diagram",
        "dgm",
    ),
    (
        "http://schemas.microsoft.com/office/drawing/2008/diagram",
        "dsp",
    ),
    (
        "http://schemas.openxmlformats.org/drawingml/2006/chart",
        "c",
    ),
    (
        "http://schemas.openxmlformats.org/drawingml/2006/picture",
        "pic",
    ),
    (
        "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
        "wp",
    ),
    ("http://www.w3.org/XML/1998/namespace", "xml"),
];

/// The URI a canonical prefix stands for (the first spelling listed).
pub fn uri_of(prefix: &str) -> Option<&'static str> {
    KNOWN.iter().find(|(_, p)| *p == prefix).map(|(u, _)| *u)
}

fn prefix_of(uri: &str) -> Option<&'static str> {
    KNOWN.iter().find(|(u, _)| *u == uri).map(|(_, p)| *p)
}

/// Why a part could not be read.
#[derive(Clone, Debug, PartialEq)]
pub enum DomError {
    /// Not well-formed, or using something refused.
    Malformed(String),
    /// Larger or deeper than the reader allows.
    TooBig(String),
}

impl fmt::Display for DomError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DomError::Malformed(m) | DomError::TooBig(m) => f.write_str(m),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Child {
    Node(Node),
    Text(String),
}

/// An element with its attributes and content.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Node {
    pub name: String,
    pub attrs: Vec<(String, String)>,
    pub children: Vec<Child>,
}

impl Node {
    pub fn new(name: &str) -> Node {
        Node {
            name: name.to_owned(),
            ..Node::default()
        }
    }

    pub fn attr(&self, name: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
    }

    pub fn set_attr(&mut self, name: &str, value: &str) {
        match self.attrs.iter_mut().find(|(k, _)| k == name) {
            Some(slot) => slot.1 = value.to_owned(),
            None => self.attrs.push((name.to_owned(), value.to_owned())),
        }
    }

    /// The element children, in order.
    pub fn elements(&self) -> impl Iterator<Item = &Node> {
        self.children.iter().filter_map(|c| match c {
            Child::Node(n) => Some(n),
            Child::Text(_) => None,
        })
    }

    pub fn elements_mut(&mut self) -> impl Iterator<Item = &mut Node> {
        self.children.iter_mut().filter_map(|c| match c {
            Child::Node(n) => Some(n),
            Child::Text(_) => None,
        })
    }

    /// The first child element of this name.
    pub fn child(&self, name: &str) -> Option<&Node> {
        self.elements().find(|n| n.name == name)
    }

    /// The child elements of this name.
    pub fn children_named<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Node> {
        self.elements().filter(move |n| n.name == name)
    }

    /// The first descendant of this name, found by walking down through `path`.
    pub fn at(&self, path: &[&str]) -> Option<&Node> {
        let mut node = self;
        for name in path {
            node = node.child(name)?;
        }
        Some(node)
    }

    /// The text directly inside the element.
    pub fn text(&self) -> String {
        let mut out = String::new();
        for child in &self.children {
            if let Child::Text(t) = child {
                out.push_str(t);
            }
        }
        out
    }

    /// A whole-number attribute.
    pub fn int(&self, name: &str) -> Option<i64> {
        self.attr(name)?.trim().parse().ok()
    }

    /// A flag attribute: `1`, `true`, `on` are yes; `0`, `false`, `off` are no.
    pub fn flag(&self, name: &str) -> Option<bool> {
        match self.attr(name)?.trim() {
            "1" | "true" | "on" => Some(true),
            "0" | "false" | "off" => Some(false),
            _ => None,
        }
    }

    /// Whether an element of this name is anywhere inside.
    pub fn contains(&self, name: &str) -> bool {
        self.elements().any(|n| n.name == name || n.contains(name))
    }
}

/// A part, read.
#[derive(Clone, Debug, PartialEq)]
pub struct Doc {
    pub root: Node,
    /// The declarations the root made for namespaces that have no fixed prefix.
    pub declarations: Vec<(String, String)>,
}

#[cfg(test)]
mod tests;
