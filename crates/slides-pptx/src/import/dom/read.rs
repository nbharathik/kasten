//! Reading XML text into the tree.

use quick_xml::Reader;
use quick_xml::events::{BytesStart, Event};

use super::{Child, Doc, DomError, MAX_ATTRIBUTES, MAX_DEPTH, MAX_NODES, Node, prefix_of};

struct Scope {
    /// Prefix (empty for the default namespace) and URI, innermost last.
    bound: Vec<(String, String)>,
    /// How many bindings each open element added.
    added: Vec<usize>,
}

impl Scope {
    fn uri(&self, prefix: &str) -> Option<&str> {
        self.bound
            .iter()
            .rev()
            .find(|(p, _)| p == prefix)
            .map(|(_, u)| u.as_str())
    }
}

fn unescape(name: &str) -> Option<char> {
    Some(match name {
        "amp" => '&',
        "lt" => '<',
        "gt" => '>',
        "quot" => '"',
        "apos" => '\'',
        _ => return None,
    })
}

/// Decodes the entity references and character references in an attribute value.
fn attribute_text(raw: &str) -> Result<String, DomError> {
    if !raw.contains('&') {
        return Ok(raw.to_owned());
    }
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        let tail = &rest[at + 1..];
        let Some(end) = tail.find(';') else {
            return Err(DomError::Malformed(
                "a reference in an attribute has no end".to_owned(),
            ));
        };
        let name = &tail[..end];
        let c = if let Some(number) = name.strip_prefix('#') {
            let code = match number.strip_prefix(['x', 'X']) {
                Some(hex) => u32::from_str_radix(hex, 16).ok(),
                None => number.parse::<u32>().ok(),
            };
            code.and_then(char::from_u32)
        } else {
            unescape(name)
        };
        out.push(c.ok_or_else(|| {
            DomError::Malformed(format!("the reference `&{name};` is not one XML defines"))
        })?);
        rest = &tail[end + 1..];
    }
    out.push_str(rest);
    Ok(out)
}

fn qualified(scope: &Scope, name: &str, attribute: bool) -> String {
    match name.split_once(':') {
        Some((prefix, local)) => match scope.uri(prefix).and_then(prefix_of) {
            Some(canonical) => format!("{canonical}:{local}"),
            None => name.to_owned(),
        },
        None if attribute => name.to_owned(),
        None => match scope.uri("").and_then(prefix_of) {
            Some(canonical) => format!("{canonical}:{name}"),
            None => name.to_owned(),
        },
    }
}

fn open(
    start: &BytesStart<'_>,
    scope: &mut Scope,
    declarations: &mut Vec<(String, String)>,
    root: bool,
) -> Result<Node, DomError> {
    let mut raw: Vec<(String, String)> = Vec::new();
    for attribute in start.attributes() {
        let attribute = attribute.map_err(|e| DomError::Malformed(e.to_string()))?;
        if raw.len() >= MAX_ATTRIBUTES {
            return Err(DomError::TooBig(
                "an element has too many attributes".into(),
            ));
        }
        let key = attribute.key.as_ref().to_owned();
        raw.push((key, attribute_text(&attribute.value)?));
    }
    let mut added = 0;
    for (key, value) in &raw {
        if key == "xmlns" {
            scope.bound.push((String::new(), value.clone()));
            added += 1;
        } else if let Some(prefix) = key.strip_prefix("xmlns:") {
            scope.bound.push((prefix.to_owned(), value.clone()));
            added += 1;
        }
    }
    scope.added.push(added);
    let name = start.name().as_ref().to_owned();
    let mut node = Node::new(&qualified(scope, &name, false));
    for (key, value) in raw {
        let is_declaration = key == "xmlns" || key.starts_with("xmlns:");
        if is_declaration {
            if prefix_of(&value).is_none() {
                if root {
                    declarations.push((key.clone(), value.clone()));
                }
                node.attrs.push((key, value));
            }
            continue;
        }
        node.attrs.push((qualified(scope, &key, true), value));
    }
    Ok(node)
}

/// Reads an XML part.
pub fn parse(bytes: &[u8]) -> Result<Doc, DomError> {
    let text = match std::str::from_utf8(bytes) {
        Ok(text) => text.trim_start_matches('\u{feff}'),
        Err(_) => {
            return Err(DomError::Malformed("the part is not UTF-8 text".to_owned()));
        }
    };
    let mut reader = Reader::from_str(text);
    let mut scope = Scope {
        bound: vec![(
            "xml".to_owned(),
            "http://www.w3.org/XML/1998/namespace".to_owned(),
        )],
        added: Vec::new(),
    };
    let mut declarations = Vec::new();
    let mut stack: Vec<Node> = Vec::new();
    let mut root: Option<Node> = None;
    let mut nodes = 0usize;
    loop {
        let event = reader
            .read_event()
            .map_err(|e| DomError::Malformed(e.to_string()))?;
        match event {
            Event::Start(ref start) | Event::Empty(ref start) => {
                let empty = matches!(event, Event::Empty(_));
                nodes += 1;
                if nodes > MAX_NODES {
                    return Err(DomError::TooBig(format!(
                        "the part has more than {MAX_NODES} elements"
                    )));
                }
                if stack.len() >= MAX_DEPTH {
                    return Err(DomError::TooBig(format!(
                        "the part is nested more than {MAX_DEPTH} levels deep"
                    )));
                }
                if root.is_some() && stack.is_empty() {
                    return Err(DomError::Malformed(
                        "the part has more than one root element".to_owned(),
                    ));
                }
                let node = open(start, &mut scope, &mut declarations, stack.is_empty())?;
                if empty {
                    close(node, &mut stack, &mut root, &mut scope);
                } else {
                    stack.push(node);
                }
            }
            Event::End(_) => {
                let Some(node) = stack.pop() else {
                    return Err(DomError::Malformed("an end tag has no start".to_owned()));
                };
                close(node, &mut stack, &mut root, &mut scope);
            }
            Event::Text(t) => {
                if let Some(top) = stack.last_mut() {
                    push_text(top, &t.xml10_content());
                }
            }
            Event::CData(c) => {
                if let Some(top) = stack.last_mut() {
                    push_text(top, &c.xml10_content());
                }
            }
            Event::GeneralRef(r) => {
                let resolved = match r.resolve_char_ref() {
                    Ok(Some(c)) => Some(c),
                    Ok(None) => unescape(&r),
                    Err(_) => None,
                };
                let Some(c) = resolved else {
                    return Err(DomError::Malformed(format!(
                        "the reference `&{};` is not one XML defines",
                        &*r
                    )));
                };
                if let Some(top) = stack.last_mut() {
                    let mut buffer = [0u8; 4];
                    push_text(top, c.encode_utf8(&mut buffer));
                }
            }
            Event::DocType(_) => {
                return Err(DomError::Malformed(
                    "a document type declaration is not allowed".to_owned(),
                ));
            }
            Event::Eof => break,
            Event::Comment(_) | Event::Decl(_) | Event::PI(_) => {}
        }
    }
    if !stack.is_empty() {
        return Err(DomError::Malformed("an element is never closed".to_owned()));
    }
    let root = root.ok_or_else(|| DomError::Malformed("the part is empty".to_owned()))?;
    Ok(Doc { root, declarations })
}

fn push_text(top: &mut Node, text: &str) {
    if text.is_empty() {
        return;
    }
    if let Some(Child::Text(last)) = top.children.last_mut() {
        last.push_str(text);
    } else {
        top.children.push(Child::Text(text.to_owned()));
    }
}

fn close(mut node: Node, stack: &mut [Node], root: &mut Option<Node>, scope: &mut Scope) {
    if let Some(added) = scope.added.pop() {
        let keep = scope.bound.len().saturating_sub(added);
        scope.bound.truncate(keep);
    }
    // Between elements, indentation is not content.
    if node.elements().next().is_some() {
        node.children
            .retain(|c| !matches!(c, Child::Text(t) if t.trim().is_empty()));
    }
    match stack.last_mut() {
        Some(parent) => parent.children.push(Child::Node(node)),
        None => *root = Some(node),
    }
}
