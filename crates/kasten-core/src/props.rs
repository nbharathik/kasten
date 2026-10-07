//! A note's tag properties, the `props:` mapping in its frontmatter.
//! Changing one property edits only that
//! property's lines; every other byte of the frontmatter stays.

use serde_json::{Map, Value};

use crate::error::{Error, Result};
use crate::frontmatter::{Front, set_key_raw, yaml_flow_scalar, yaml_scalar};

/// A JSON value as one line of YAML: scalars plain or quoted, lists and
/// maps in flow style.
pub fn yaml_value(value: &Value) -> String {
    write_value(value, false)
}

/// Inside a flow list or map (`flow`), strings are quoted when a comma or
/// bracket would end them.
fn write_value(value: &Value, flow: bool) -> String {
    let scalar = |s: &str| {
        if flow {
            yaml_flow_scalar(s)
        } else {
            yaml_scalar(s)
        }
    };
    match value {
        Value::Null => "null".to_owned(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => scalar(s),
        Value::Array(items) => format!(
            "[{}]",
            items
                .iter()
                .map(|v| write_value(v, true))
                .collect::<Vec<_>>()
                .join(", ")
        ),
        Value::Object(map) => format!(
            "{{{}}}",
            map.iter()
                .map(|(k, v)| format!("{}: {}", yaml_flow_scalar(k), write_value(v, true)))
                .collect::<Vec<_>>()
                .join(", ")
        ),
    }
}

/// The note's properties as JSON.
pub fn props_of(prefix: &str) -> Map<String, Value> {
    match Front::read(prefix).props {
        Some(crate::loose::Loose(Value::Object(map))) => map,
        _ => Map::new(),
    }
}

/// The lines of the prefix, and where `props:` starts and ends (its block
/// of indented lines), if it is there.
fn props_block(lines: &[&str]) -> Option<(usize, usize)> {
    let close = lines.len().checked_sub(1)?;
    let start = (1..close).find(|&i| {
        lines[i]
            .strip_prefix("props")
            .is_some_and(|r| r.trim_start_matches([' ', '\t']).starts_with(':'))
    })?;
    let mut end = start + 1;
    while end < close && (lines[end].starts_with([' ', '\t']) || lines[end].trim().is_empty()) {
        end += 1;
    }
    // Blank lines at the end belong to what follows.
    while end > start + 1 && lines[end - 1].trim().is_empty() {
        end -= 1;
    }
    Some((start, end))
}

/// The indentation of a block mapping's entries, from its first entry.
fn indent_of(lines: &[&str], start: usize, end: usize) -> Option<String> {
    lines[start + 1..end]
        .iter()
        .find(|l| !l.trim().is_empty() && !l.trim_start().starts_with('#'))
        .map(|l| l[..l.len() - l.trim_start().len()].to_owned())
}

/// Sets each property in `changes` (null removes it), touching only those
/// properties' lines when `props:` is a block mapping. A flow mapping, or
/// one written oddly, is rewritten as a block.
pub fn set_props(prefix: &str, changes: &Map<String, Value>, eol: &str) -> Result<String> {
    for key in changes.keys() {
        if key.trim().is_empty() || key.contains([':', '\n', '\r', '#']) || key != key.trim() {
            return Err(Error::Invalid(format!("Not a property name: “{key}”")));
        }
    }
    let lines: Vec<&str> = prefix.split_inclusive('\n').collect();
    let block = props_block(&lines);
    let inline = block.is_some_and(|(start, end)| {
        end == start + 1 && {
            let value = lines[start]["props".len()..]
                .trim_start_matches([' ', '\t'])
                .trim_start_matches(':')
                .trim();
            !value.is_empty() && !value.starts_with('#')
        }
    });
    let indent = block.and_then(|(s, e)| indent_of(&lines, s, e));
    let (Some((start, end)), Some(indent), false) = (block, indent, inline) else {
        return Ok(rewrite(prefix, changes, eol));
    };
    let line_eol = if lines[0].ends_with("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut entries: Vec<String> = lines[start + 1..end]
        .iter()
        .map(|l| (*l).to_owned())
        .collect();
    for (key, value) in changes {
        // A key is written quoted when YAML would read it otherwise ("2024").
        let written = yaml_scalar(key);
        let value_of = |l: &str| -> Option<String> {
            let rest = l.strip_prefix(indent.as_str())?;
            if rest.starts_with([' ', '\t']) {
                return None;
            }
            let rest = rest
                .strip_prefix(key.as_str())
                .or_else(|| rest.strip_prefix(written.as_str()))?;
            let rest = rest.trim_start_matches([' ', '\t']).strip_prefix(':')?;
            Some(rest.trim().to_owned())
        };
        let at = entries.iter().position(|l| value_of(l).is_some());
        // Deeper-indented lines below belong to the property, and so do
        // `- item` lines at its own indent when its line holds no value.
        let listed = at
            .and_then(|i| value_of(&entries[i]))
            .is_some_and(|v| v.is_empty() || v.starts_with('#'));
        let belongs = |l: &String| {
            l.len() - l.trim_start().len() > indent.len()
                || (listed
                    && l.strip_prefix(indent.as_str())
                        .is_some_and(|r| r.starts_with("- ") || r.trim_end() == "-"))
        };
        let until = at.map_or(0, |i| {
            i + 1 + entries[i + 1..].iter().take_while(|l| belongs(l)).count()
        });
        let line = format!(
            "{indent}{}: {}{line_eol}",
            yaml_scalar(key),
            yaml_value(value)
        );
        match (at, value.is_null()) {
            (Some(i), true) => {
                entries.drain(i..until);
            }
            (Some(i), false) => {
                entries.splice(i..until, [line]);
            }
            (None, true) => {}
            (None, false) => entries.push(line),
        }
    }
    let mut out: Vec<String> = lines.iter().map(|l| (*l).to_owned()).collect();
    if entries.iter().all(|l| l.trim().is_empty()) {
        out.splice(start..end, std::iter::empty());
    } else {
        out.splice(start + 1..end, entries);
    }
    Ok(out.concat())
}

/// Writes `props:` afresh as a block from the merged values.
fn rewrite(prefix: &str, changes: &Map<String, Value>, eol: &str) -> String {
    let mut props = props_of(prefix);
    for (key, value) in changes {
        if value.is_null() {
            props.remove(key);
        } else {
            props.insert(key.clone(), value.clone());
        }
    }
    if props.is_empty() {
        return set_key_raw(prefix, "props", None, eol);
    }
    let line_eol = if prefix.contains("\r\n") { "\r\n" } else { eol };
    let block: String = props
        .iter()
        .map(|(k, v)| format!("{line_eol}  {}: {}", yaml_scalar(k), yaml_value(v)))
        .collect();
    // `set_key_raw` writes `props: <value>`; the value starts on the next line.
    let placeholder = "\u{0}";
    set_key_raw(prefix, "props", Some(placeholder), eol).replace(&format!(" {placeholder}"), &block)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn changes(v: Value) -> Map<String, Value> {
        v.as_object().unwrap().clone()
    }

    #[test]
    fn writes_values_as_yaml() {
        assert_eq!(yaml_value(&json!("Idea")), "Idea");
        assert_eq!(yaml_value(&json!("a: b")), "\"a: b\"");
        assert_eq!(yaml_value(&json!(["A", "true", 3])), "[A, \"true\", 3]");
        assert_eq!(
            yaml_value(&json!({"key": "x", "count": 1})),
            "{key: x, count: 1}"
        );
        // YAML 1.1 reads a plain `n` as false, as a key too.
        assert_eq!(yaml_value(&json!({"n": 1})), "{\"n\": 1}");
        // In a flow list or map a comma or bracket ends a plain value.
        assert_eq!(
            yaml_value(&json!(["Smith, John", "[x]", "plain words"])),
            "[\"Smith, John\", \"[x]\", plain words]"
        );
        assert_eq!(yaml_value(&json!({"a, b": "c, d"})), "{\"a, b\": \"c, d\"}");
        assert_eq!(yaml_value(&json!("a, b")), "a, b");
    }

    #[test]
    fn changes_only_the_touched_properties() {
        let prefix = "---\ntitle: T\nprops:\n  status: Idea  # stage\n  deadline: 2026-10-15\n  notes: |\n    long\n    text\ntags: [a]\n---\n";
        let out = set_props(
            prefix,
            &changes(json!({"status": "Drafting", "venue": "CHI"})),
            "\n",
        )
        .unwrap();
        assert_eq!(
            out,
            "---\ntitle: T\nprops:\n  status: Drafting\n  deadline: 2026-10-15\n  notes: |\n    long\n    text\n  venue: CHI\ntags: [a]\n---\n"
        );
        let out = set_props(prefix, &changes(json!({"notes": null})), "\n").unwrap();
        assert_eq!(
            out,
            "---\ntitle: T\nprops:\n  status: Idea  # stage\n  deadline: 2026-10-15\ntags: [a]\n---\n"
        );
        assert_eq!(props_of(&out)["deadline"], json!("2026-10-15"));
    }

    #[test]
    fn adds_rewrites_and_removes_the_mapping() {
        let none = "---\ntitle: T\n---\n";
        let added = set_props(
            none,
            &changes(json!({"status": "Idea", "coauthors": ["A", "B"]})),
            "\n",
        )
        .unwrap();
        assert_eq!(
            added,
            "---\ntitle: T\nprops:\n  status: Idea\n  coauthors: [A, B]\n---\n"
        );
        let flow = "---\nprops: {status: Idea}\ntitle: T\n---\n";
        assert_eq!(
            set_props(flow, &changes(json!({"done": true})), "\n").unwrap(),
            "---\nprops:\n  status: Idea\n  done: true\ntitle: T\n---\n"
        );
        let one = "---\nprops:\n  status: Idea\n---\n";
        assert_eq!(
            set_props(one, &changes(json!({"status": null})), "\n").unwrap(),
            "---\n---\n"
        );
        assert_eq!(
            set_props("", &changes(json!({"a": 1})), "\n").unwrap(),
            "---\nprops:\n  a: 1\n---\n"
        );
        assert!(set_props(none, &changes(json!({"bad: key": 1})), "\n").is_err());
    }

    #[test]
    fn keeps_windows_line_endings() {
        let prefix = "---\r\nprops:\r\n  a: 1\r\n---\r\n";
        assert_eq!(
            set_props(prefix, &changes(json!({"b": "x"})), "\r\n").unwrap(),
            "---\r\nprops:\r\n  a: 1\r\n  b: x\r\n---\r\n"
        );
    }
}
