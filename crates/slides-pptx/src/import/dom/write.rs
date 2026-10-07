//! Writing a piece of the tree back out as XML text.

use super::{Child, Node, uri_of};

fn escape_into(out: &mut String, text: &str, attribute: bool) {
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' if attribute => out.push_str("&quot;"),
            '\t' | '\n' | '\r' if attribute => out.push_str(&format!("&#{};", c as u32)),
            c => out.push(c),
        }
    }
}

fn write_node(out: &mut String, node: &Node, extra: &[(String, String)]) {
    out.push('<');
    out.push_str(&node.name);
    for (key, value) in extra.iter().chain(node.attrs.iter()) {
        out.push(' ');
        out.push_str(key);
        out.push_str("=\"");
        escape_into(out, value, true);
        out.push('"');
    }
    if node.children.is_empty() {
        out.push_str("/>");
        return;
    }
    out.push('>');
    for child in &node.children {
        match child {
            Child::Node(n) => write_node(out, n, &[]),
            Child::Text(t) => escape_into(out, t, false),
        }
    }
    out.push_str("</");
    out.push_str(&node.name);
    out.push('>');
}

/// The element as XML text, declaring the namespaces it uses on itself: every
/// prefix with a fixed meaning, and `declarations` (from `Doc::declarations`).
pub fn fragment(node: &Node, declarations: &[(String, String)]) -> String {
    let mut used: Vec<&str> = Vec::new();
    collect_prefixes(node, &mut used);
    let mut extra: Vec<(String, String)> = Vec::new();
    for prefix in used {
        if let Some(uri) = uri_of(prefix) {
            extra.push((format!("xmlns:{prefix}"), uri.to_owned()));
        }
    }
    for (key, value) in declarations {
        let own = node.attrs.iter().any(|(k, _)| k == key);
        if !own && !extra.iter().any(|(k, _)| k == key) {
            extra.push((key.clone(), value.clone()));
        }
    }
    let mut out = String::new();
    write_node(&mut out, node, &extra);
    out
}

fn collect_prefixes<'a>(node: &'a Node, used: &mut Vec<&'a str>) {
    let mut note = |name: &'a str| {
        if let Some((prefix, _)) = name.split_once(':')
            && !used.contains(&prefix)
        {
            used.push(prefix);
        }
    };
    note(&node.name);
    for (key, _) in &node.attrs {
        note(key);
    }
    for child in node.elements() {
        collect_prefixes(child, used);
    }
}
