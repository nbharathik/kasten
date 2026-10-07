//! Changing frontmatter keys by editing only their lines, so every other
//! byte, comment and key order stays as the person wrote it.

use super::BOM;

/// Booleans, nulls and numbers YAML would not read back as the same string:
/// YAML 1.1's `y` and `n` too, `0x1F`, `0o7`, `0b1` and `1_000`.
fn reserved(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    let unsigned = lower.trim_start_matches(['+', '-']);
    matches!(
        lower.as_str(),
        "true" | "false" | "yes" | "no" | "y" | "n" | "on" | "off" | "null" | "~"
    ) || matches!(unsigned, ".inf" | ".nan")
        || (unsigned.len() > 2 && ["0x", "0o", "0b"].iter().any(|p| unsigned.starts_with(p)))
        || value.replace('_', "").parse::<f64>().is_ok()
}

/// Whether YAML allows `c` as it is in a scalar: not a control character,
/// DEL, a C1 control other than NEL, a byte order mark or U+FFFE/U+FFFF.
fn printable(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\r' | ' '..='~' | '\u{85}' | '\u{a0}'..='\u{d7ff}' | '\u{e000}'..='\u{fffd}' | '\u{10000}'..)
        && c != '\u{feff}'
}

/// `value` as a YAML scalar: plain when YAML reads it back as the same
/// string, double-quoted (JSON rules, which YAML accepts) otherwise.
pub fn yaml_scalar(value: &str) -> String {
    let first = value.chars().next();
    let plain = first.is_some()
        && value == value.trim()
        && !matches!(
            first,
            Some(
                '-' | '?'
                    | ':'
                    | ','
                    | '['
                    | ']'
                    | '{'
                    | '}'
                    | '#'
                    | '&'
                    | '*'
                    | '!'
                    | '|'
                    | '>'
                    | '\''
                    | '"'
                    | '%'
                    | '@'
                    | '`'
            )
        )
        && !value.contains(": ")
        && !value.contains(" #")
        && !value.ends_with(':')
        && !value.contains(['\n', '\r', '\t'])
        && value.chars().all(printable)
        && !reserved(value);
    if plain {
        value.to_owned()
    } else {
        quote(value)
    }
}

/// `value` as a scalar inside a flow list or map (`[a, b]`, `{k: v}`),
/// where a comma or a bracket would end a plain one.
pub fn yaml_flow_scalar(value: &str) -> String {
    if value.contains([',', '[', ']', '{', '}']) {
        quote(value)
    } else {
        yaml_scalar(value)
    }
}

fn quote(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if !printable(c) => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Whether `line` is the top-level `key:` line.
fn is_key_line(line: &str, key: &str) -> bool {
    line.strip_prefix(key)
        .is_some_and(|rest| rest.trim_start_matches([' ', '\t']).starts_with(':'))
}

/// A trailing ` # comment` after a single-line value, kept when the value changes.
fn trailing_comment(line: &str, key: &str) -> String {
    let value = line[key.len()..].trim_end_matches(['\n', '\r']);
    let value = value
        .trim_start_matches([' ', '\t'])
        .trim_start_matches(':');
    let body = value.trim_start();
    let search_from = match body.chars().next() {
        Some(q @ ('"' | '\'')) => body[1..].find(q).map_or(body.len(), |i| i + 2),
        _ => 0,
    };
    let Some(i) = body[search_from..]
        .find(" #")
        .or_else(|| body[search_from..].find("\t#"))
    else {
        return String::new();
    };
    // Keep all the spacing before the `#`, as it was aligned.
    let hash = search_from + i + 1;
    let start = body[..hash].trim_end_matches([' ', '\t']).len();
    body[start..].to_owned()
}

/// Where the value of the key on line `at` ends: indented lines below it
/// belong to it, as in a block scalar, and so do `- item` lines at the
/// key's own indent when the key's line holds no value (a list as PyYAML
/// and many tools write it). Blank lines between such lines are kept with
/// them; blank lines after the last are not.
pub(super) fn value_end<S: AsRef<str>>(lines: &[S], at: usize, key: &str, close: usize) -> usize {
    let own = lines[at].as_ref()[key.len()..]
        .trim_start_matches([' ', '\t'])
        .trim_start_matches(':')
        .trim();
    let listed = own.is_empty() || own.starts_with('#');
    let belongs = |line: &str| {
        line.starts_with([' ', '\t'])
            || (listed && (line.starts_with("- ") || line.trim_end() == "-"))
    };
    let mut end = at + 1;
    let mut next = end;
    while next < close {
        let line = lines[next].as_ref();
        if belongs(line) && !line.trim().is_empty() {
            next += 1;
            end = next;
        } else if line.trim().is_empty() {
            next += 1;
        } else {
            break;
        }
    }
    end
}

/// Sets `key` to `value`, or removes it with `None`, touching only that key's
/// lines. Without frontmatter a new block is written with `eol` line endings.
pub fn set_key(prefix: &str, key: &str, value: Option<&str>, eol: &str) -> String {
    set_key_raw(prefix, key, value.map(yaml_scalar).as_deref(), eol)
}

/// A YAML flow list, `[a, "b: c"]`, of scalars.
pub fn yaml_list(items: &[String]) -> String {
    format!(
        "[{}]",
        items
            .iter()
            .map(|i| yaml_flow_scalar(i))
            .collect::<Vec<_>>()
            .join(", ")
    )
}

/// `set_key` with a value that is already YAML, such as a flow list.
pub fn set_key_raw(prefix: &str, key: &str, value: Option<&str>, eol: &str) -> String {
    let bom = if prefix.starts_with(BOM) { BOM } else { "" };
    let rest = &prefix[bom.len()..];
    if rest.is_empty() {
        return match value {
            None => prefix.to_owned(),
            Some(v) => format!("{bom}---{eol}{key}: {v}{eol}---{eol}"),
        };
    }
    let mut lines: Vec<String> = rest.split_inclusive('\n').map(str::to_owned).collect();
    let close = lines.len() - 1;
    let line_eol = if lines[0].ends_with("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut found: Option<(usize, usize, String)> = None;
    for i in 1..close {
        if !is_key_line(&lines[i], key) {
            continue;
        }
        let end = value_end(&lines, i, key, close);
        let comment = if end == i + 1 {
            trailing_comment(&lines[i], key)
        } else {
            String::new()
        };
        found = Some((i, end, comment));
        break;
    }
    let replacement: Vec<String> = match (value, &found) {
        (None, _) => vec![],
        (Some(v), Some((_, _, comment))) => {
            vec![format!("{key}: {v}{comment}{line_eol}")]
        }
        (Some(v), None) => vec![format!("{key}: {v}{line_eol}")],
    };
    match found {
        Some((start, end, _)) => {
            lines.splice(start..end, replacement);
        }
        None => {
            lines.splice(close..close, replacement);
        }
    }
    format!("{bom}{}", lines.concat())
}

/// Renames the top-level key `old` to `new` on its own line, keeping its
/// value, any comment and its place; the prefix as it was without `old`.
pub fn rename_key(prefix: &str, old: &str, new: &str) -> String {
    let bom = if prefix.starts_with(BOM) { BOM } else { "" };
    let rest = &prefix[bom.len()..];
    let mut out = String::with_capacity(prefix.len() + new.len());
    out.push_str(bom);
    let mut done = false;
    for (i, line) in rest.split_inclusive('\n').enumerate() {
        if i > 0 && !done && is_key_line(line, old) {
            out.push_str(new);
            out.push_str(&line[old.len()..]);
            done = true;
        } else {
            out.push_str(line);
        }
    }
    out
}

/// The top-level keys of a prefix, each with its full text (its line and any
/// indented lines below it), in order.
pub fn key_blocks(prefix: &str) -> Vec<(String, String)> {
    let rest = prefix.strip_prefix(BOM).unwrap_or(prefix);
    let lines: Vec<&str> = rest.split_inclusive('\n').collect();
    let mut out: Vec<(String, String)> = Vec::new();
    for line in lines.iter().skip(1).take(lines.len().saturating_sub(2)) {
        let starts_key = !line.starts_with([' ', '\t', '#', '-', '\n', '\r']) && line.contains(':');
        if starts_key {
            let key = line.split(':').next().unwrap_or("").trim().to_owned();
            out.push((key, (*line).to_owned()));
        } else if let Some(last) = out.last_mut() {
            last.1.push_str(line);
        }
    }
    out
}

/// Adds whole key blocks (as `key_blocks` returns them) before the closing fence.
pub fn append_blocks(prefix: &str, blocks: &[String], eol: &str) -> String {
    if blocks.is_empty() {
        return prefix.to_owned();
    }
    let text: String = blocks
        .iter()
        .map(|b| {
            if b.ends_with('\n') {
                b.clone()
            } else {
                format!("{b}{eol}")
            }
        })
        .collect();
    let bom = if prefix.starts_with(BOM) { BOM } else { "" };
    let rest = &prefix[bom.len()..];
    if rest.is_empty() {
        return format!("{bom}---{eol}{text}---{eol}");
    }
    let close = rest
        .trim_end_matches(['\n', '\r'])
        .rfind('\n')
        .map_or(0, |i| i + 1);
    format!("{bom}{}{text}{}", &rest[..close], &rest[close..])
}
