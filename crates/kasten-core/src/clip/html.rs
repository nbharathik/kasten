//! A forgiving HTML reader for web pages: elements with their attributes
//! and text, nested as a browser would for the tags articles use. Scripts,
//! styles and other code are left out; entities are read.

/// A node of the page.
#[derive(Debug, Clone)]
pub(crate) enum Node {
    Element(Element),
    Text(String),
}

#[derive(Debug, Clone, Default)]
pub(crate) struct Element {
    pub name: String,
    pub attrs: Vec<(String, String)>,
    pub children: Vec<Node>,
}

impl Element {
    pub fn attr(&self, key: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
    }

    /// Every element below, in document order.
    pub fn find(&self, wanted: &dyn Fn(&Element) -> bool) -> Option<&Element> {
        for child in &self.children {
            if let Node::Element(e) = child {
                if wanted(e) {
                    return Some(e);
                }
                if let Some(found) = e.find(wanted) {
                    return Some(found);
                }
            }
        }
        None
    }

    /// All the text below, as it is.
    pub fn text(&self) -> String {
        let mut out = String::new();
        for child in &self.children {
            match child {
                Node::Text(t) => out.push_str(t),
                Node::Element(e) => out.push_str(&e.text()),
            }
        }
        out
    }
}

const VOID: [&str; 14] = [
    "br", "img", "hr", "meta", "link", "input", "source", "wbr", "area", "col", "embed", "param",
    "track", "base",
];
/// Elements whose content is never text to keep.
const RAW: [&str; 7] = [
    "script", "style", "noscript", "template", "svg", "iframe", "textarea",
];

/// Tags that close an open one of these when they start.
fn closes(open: &str, starting: &str) -> bool {
    match open {
        "p" => matches!(
            starting,
            "p" | "div"
                | "ul"
                | "ol"
                | "h1"
                | "h2"
                | "h3"
                | "h4"
                | "h5"
                | "h6"
                | "blockquote"
                | "pre"
                | "table"
                | "section"
                | "article"
                | "figure"
                | "hr"
                | "header"
                | "footer"
        ),
        "li" => starting == "li",
        "dt" | "dd" => matches!(starting, "dt" | "dd"),
        "tr" => starting == "tr",
        "td" | "th" => matches!(starting, "td" | "th" | "tr"),
        "option" => starting == "option",
        _ => false,
    }
}

const ENTITIES: [(&str, &str); 26] = [
    ("amp", "&"),
    ("lt", "<"),
    ("gt", ">"),
    ("quot", "\""),
    ("apos", "'"),
    ("nbsp", "\u{a0}"),
    ("mdash", "—"),
    ("ndash", "–"),
    ("hellip", "…"),
    ("lsquo", "‘"),
    ("rsquo", "’"),
    ("ldquo", "“"),
    ("rdquo", "”"),
    ("middot", "·"),
    ("bull", "•"),
    ("copy", "©"),
    ("reg", "®"),
    ("trade", "™"),
    ("deg", "°"),
    ("times", "×"),
    ("eacute", "é"),
    ("egrave", "è"),
    ("aacute", "á"),
    ("uuml", "ü"),
    ("ouml", "ö"),
    ("auml", "ä"),
];

/// Text with its entities read: `&amp;`, `&#233;`, `&#x2014;` and the common names.
pub(crate) fn decode(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        let end = rest[1..].find(';').map(|i| i + 1).filter(|&i| i <= 12);
        let decoded = end.and_then(|end| {
            let name = &rest[1..end];
            let code =
                if let Some(hex) = name.strip_prefix("#x").or_else(|| name.strip_prefix("#X")) {
                    u32::from_str_radix(hex, 16).ok()
                } else if let Some(dec) = name.strip_prefix('#') {
                    dec.parse().ok()
                } else {
                    None
                };
            let found = match code {
                Some(code) => char::from_u32(code).map(String::from),
                None => ENTITIES
                    .iter()
                    .find(|(n, _)| *n == name)
                    .map(|(_, v)| (*v).to_owned()),
            };
            found.map(|s| (s, end + 1))
        });
        match decoded {
            Some((s, len)) => {
                out.push_str(&s);
                rest = &rest[len..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn attrs(tag: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let bytes = tag.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        while i < bytes.len() && (bytes[i].is_ascii_whitespace() || bytes[i] == b'/') {
            i += 1;
        }
        let start = i;
        while i < bytes.len() && !bytes[i].is_ascii_whitespace() && !matches!(bytes[i], b'=' | b'/')
        {
            i += 1;
        }
        if start == i {
            break;
        }
        let key = tag[start..i].to_lowercase();
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        let mut value = String::new();
        if i < bytes.len() && bytes[i] == b'=' {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            if i < bytes.len() && matches!(bytes[i], b'"' | b'\'') {
                let quote = bytes[i];
                let from = i + 1;
                i = from;
                while i < bytes.len() && bytes[i] != quote {
                    i += 1;
                }
                value = decode(&tag[from..i.min(tag.len())]);
                i += 1;
            } else {
                let from = i;
                while i < bytes.len() && !bytes[i].is_ascii_whitespace() {
                    i += 1;
                }
                value = decode(&tag[from..i]);
            }
        }
        out.push((key, value));
    }
    out
}

/// Where `</name` starts in `text`, whatever its case.
fn end_tag(text: &str, name: &str) -> Option<usize> {
    let bytes = text.as_bytes();
    let wanted = name.as_bytes();
    (0..bytes.len()).find(|&i| {
        bytes[i..].starts_with(b"</")
            && bytes.len() >= i + 2 + wanted.len()
            && bytes[i + 2..i + 2 + wanted.len()].eq_ignore_ascii_case(wanted)
    })
}

/// How deep the tree goes. Unclosed tags nest every later one inside the
/// last; past this, start tags become leaves, so every walk over the tree
/// stays well within the stack and each tag's search of its ancestors is
/// short.
const MAX_DEPTH: usize = 256;

/// The page as a tree under one root element.
pub(crate) fn parse(html: &str) -> Element {
    let mut stack: Vec<Element> = vec![Element {
        name: "#root".into(),
        ..Default::default()
    }];
    let mut rest = html;
    let push_node = |stack: &mut Vec<Element>, node: Node| {
        if let Some(top) = stack.last_mut() {
            top.children.push(node);
        }
    };
    let close_to = |stack: &mut Vec<Element>, at: usize| {
        while stack.len() > at {
            let done = stack.pop().expect("more than the root");
            if let Some(parent) = stack.last_mut() {
                parent.children.push(Node::Element(done));
            }
        }
    };
    while !rest.is_empty() {
        let Some(lt) = rest.find('<') else {
            push_node(&mut stack, Node::Text(decode(rest)));
            break;
        };
        if lt > 0 {
            push_node(&mut stack, Node::Text(decode(&rest[..lt])));
        }
        rest = &rest[lt..];
        if let Some(after) = rest.strip_prefix("<!--") {
            rest = after.find("-->").map_or("", |end| &after[end + 3..]);
            continue;
        }
        let Some(gt) = rest.find('>') else {
            push_node(&mut stack, Node::Text(decode(rest)));
            break;
        };
        let tag = &rest[1..gt];
        rest = &rest[gt + 1..];
        if tag.starts_with('!') || tag.starts_with('?') {
            continue;
        }
        if let Some(name) = tag.strip_prefix('/') {
            let name = name.trim().to_lowercase();
            if let Some(at) = stack.iter().rposition(|e| e.name == name)
                && at > 0
            {
                close_to(&mut stack, at);
            }
            continue;
        }
        let name_end = tag
            .find(|c: char| c.is_ascii_whitespace() || c == '/')
            .unwrap_or(tag.len());
        let name = tag[..name_end].to_lowercase();
        if name.is_empty() || !name.chars().next().is_some_and(|c| c.is_ascii_alphabetic()) {
            push_node(&mut stack, Node::Text(format!("<{tag}>")));
            continue;
        }
        let element = Element {
            name: name.clone(),
            attrs: attrs(&tag[name_end..]),
            children: Vec::new(),
        };
        if RAW.contains(&name.as_str()) {
            // Skip to its end tag, keeping nothing.
            rest = match end_tag(rest, &name) {
                Some(at) => rest[at..].find('>').map_or("", |gt| &rest[at + gt + 1..]),
                None => "",
            };
            continue;
        }
        if let Some(at) = stack.iter().rposition(|e| closes(&e.name, &name)) {
            // Only a direct run of closable ancestors: `<li>` closes the `<li>`
            // of its own list.
            let blocking = stack[at + 1..]
                .iter()
                .any(|e| matches!(e.name.as_str(), "ul" | "ol" | "table" | "dl"));
            if at > 0 && !blocking {
                close_to(&mut stack, at);
            }
        }
        if VOID.contains(&name.as_str()) || tag.ends_with('/') || stack.len() >= MAX_DEPTH {
            push_node(&mut stack, Node::Element(element));
        } else {
            stack.push(element);
        }
    }
    close_to(&mut stack, 1);
    stack.pop().expect("the root")
}
