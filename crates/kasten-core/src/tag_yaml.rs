//! Changing one top-level list in a tag's YAML (`views:` or `properties:`)
//! by rewriting only that key's lines, so comments, key order and spacing
//! elsewhere in `tags/<name>.yaml` stay as written.

use serde_json::Value;

use crate::props::yaml_value;

/// Whether `line` is the top-level `key:` line.
fn is_key_line(line: &str, key: &str) -> bool {
    let line = line.strip_prefix('\u{feff}').unwrap_or(line);
    line.strip_prefix(key)
        .is_some_and(|rest| rest.trim_start_matches([' ', '\t']).starts_with(':'))
}

/// Whether `line` continues a top-level value: indented, or a list item
/// written at the left edge.
fn continues(line: &str) -> bool {
    line.starts_with([' ', '\t'])
        || line.starts_with("- ")
        || line.trim_end_matches(['\n', '\r']) == "-"
}

/// `yaml` with the top-level `key` set to `items`, one flow mapping per
/// line (`  - {name: Board, type: kanban}`), or `key: []` for none. The
/// key's old lines go and every other byte stays; a missing key is added at
/// the end.
pub fn set_list(yaml: &str, key: &str, items: &[Value]) -> String {
    let eol = if yaml.contains("\r\n") { "\r\n" } else { "\n" };
    let block = if items.is_empty() {
        format!("{key}: []{eol}")
    } else {
        let lines: String = items
            .iter()
            .map(|item| format!("  - {}{eol}", yaml_value(item)))
            .collect();
        format!("{key}:{eol}{lines}")
    };
    let lines: Vec<&str> = yaml.split_inclusive('\n').collect();
    let Some(start) = lines.iter().position(|l| is_key_line(l, key)) else {
        let sep = if yaml.is_empty() || yaml.ends_with('\n') {
            ""
        } else {
            eol
        };
        return format!("{yaml}{sep}{block}");
    };
    let mut end = start + 1;
    while end < lines.len() {
        if continues(lines[end]) {
            end += 1;
            continue;
        }
        // Blank lines belong to the value only when more of it follows.
        let next = (end..lines.len()).find(|&i| !lines[i].trim().is_empty());
        match next {
            Some(i) if continues(lines[i]) => end = i,
            _ => break,
        }
    }
    // A byte order mark on the key's own line stays at the file's start.
    let bom = if lines[start].starts_with('\u{feff}') {
        "\u{feff}"
    } else {
        ""
    };
    format!(
        "{}{bom}{block}{}",
        lines[..start].concat(),
        lines[end..].concat()
    )
}

#[cfg(test)]
#[path = "tag_yaml_tests.rs"]
mod tests;
