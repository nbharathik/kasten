//! Tag schemas: `tags/<name>.yaml` gives a tag its colour, properties and
//! views. Property values are checked
//! against the schemas of the note's tags before they are written.

use std::fs;

use serde::Serialize;
use serde_json::{Map, Value};

use crate::error::{Error, Result};
use crate::frontmatter::yaml_scalar;
use crate::loose::Loose;
use crate::props::yaml_value;
use crate::vault::Vault;

/// Property types.
pub const KINDS: [&str; 8] = [
    "text",
    "number",
    "select",
    "multi_select",
    "date",
    "checkbox",
    "url",
    "relation",
];

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PropDef {
    pub key: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub options: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TagSchema {
    pub name: String,
    pub color: Option<String>,
    pub properties: Vec<PropDef>,
    /// Views as written (`table`, `kanban`, `list`, `calendar`, with their settings).
    pub views: Vec<Value>,
    pub path: String,
}

fn text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_owned()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Reads one schema leniently: odd entries are skipped, not errors.
pub fn parse_schema(path: &str, yaml: &str) -> Result<TagSchema> {
    let Loose(value) = serde_saphyr::from_str::<Loose>(yaml)
        .map_err(|e| Error::Invalid(format!("{path} is not valid YAML: {e}")))?;
    let stem = path
        .rsplit('/')
        .next()
        .unwrap_or(path)
        .trim_end_matches(".yaml");
    let properties = value
        .get("properties")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|p| {
                    let key = text(p.get("key"))?;
                    let kind = text(p.get("type")).unwrap_or_else(|| "text".to_owned());
                    let options = p
                        .get("options")
                        .and_then(Value::as_array)
                        .map(|o| o.iter().filter_map(|v| text(Some(v))).collect())
                        .unwrap_or_default();
                    Some(PropDef { key, kind, options })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(TagSchema {
        name: text(value.get("name")).unwrap_or_else(|| stem.to_owned()),
        color: text(value.get("color")),
        properties,
        views: value
            .get("views")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        path: path.to_owned(),
    })
}

/// Every schema under `tags/`, skipping files that do not parse.
pub fn load_schemas(vault: &Vault) -> Result<Vec<TagSchema>> {
    let mut out = Vec::new();
    for file in vault.files(".yaml")? {
        if !file.path.starts_with("tags/") {
            continue;
        }
        let Ok(yaml) = fs::read_to_string(vault.file_of(&file.path, &[".yaml"])?) else {
            continue;
        };
        if let Ok(schema) = parse_schema(&file.path, &yaml) {
            out.push(schema);
        }
    }
    Ok(out)
}

fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    let day = b.len() >= 10
        && b[..10].iter().enumerate().all(|(i, c)| match i {
            4 | 7 => *c == b'-',
            _ => c.is_ascii_digit(),
        });
    day && (b.len() == 10 || matches!(b[10], b'T' | b' '))
}

fn strings(value: &Value) -> Option<Vec<String>> {
    match value {
        Value::String(s) => Some(vec![s.clone()]),
        Value::Array(items) => items.iter().map(|v| text(Some(v))).collect(),
        _ => None,
    }
}

/// `value` checked against `def`, in the form it is written: select options
/// in the schema's spelling, numbers as numbers, one relation as a list.
fn check(def: &PropDef, value: &Value) -> std::result::Result<Value, String> {
    let pick = |s: &str| -> std::result::Result<String, String> {
        if def.options.is_empty() {
            return Ok(s.to_owned());
        }
        def.options
            .iter()
            .find(|o| o.eq_ignore_ascii_case(s.trim()))
            .cloned()
            .ok_or_else(|| format!("must be one of {}", def.options.join(", ")))
    };
    match (def.kind.as_str(), value) {
        (_, Value::Null) => Ok(Value::Null),
        ("number", Value::Number(_)) => Ok(value.clone()),
        ("number", Value::String(s)) => s
            .trim()
            .parse::<f64>()
            .ok()
            .and_then(serde_json::Number::from_f64)
            .map(|n| {
                s.trim()
                    .parse::<i64>()
                    .map_or(Value::Number(n), |i| Value::Number(i.into()))
            })
            .ok_or_else(|| "must be a number".to_owned()),
        ("checkbox", Value::Bool(_)) => Ok(value.clone()),
        ("checkbox", Value::String(s)) if matches!(s.as_str(), "true" | "false") => {
            Ok(Value::Bool(s == "true"))
        }
        ("date", Value::String(s)) if is_date(s.trim()) => Ok(Value::String(s.trim().to_owned())),
        ("date", _) => Err("must be a date, YYYY-MM-DD".to_owned()),
        ("url", Value::String(s)) if s.contains("://") || s.starts_with("mailto:") => {
            Ok(value.clone())
        }
        ("url", _) => Err("must be a URL".to_owned()),
        ("select", Value::String(s)) => pick(s).map(Value::String),
        ("multi_select" | "relation", v) => {
            let items = strings(v).ok_or_else(|| "must be a list of text".to_owned())?;
            let items = if def.kind == "relation" {
                items
            } else {
                items
                    .iter()
                    .map(|s| pick(s))
                    .collect::<std::result::Result<_, _>>()?
            };
            Ok(Value::Array(items.into_iter().map(Value::String).collect()))
        }
        ("text", Value::String(_)) => Ok(value.clone()),
        ("text", Value::Number(n)) => Ok(Value::String(n.to_string())),
        (kind, _) => Err(format!("must be a {}", kind.replace('_', " "))),
    }
}

/// Checks property changes against the schemas of `tags`; keys no schema
/// names may hold text, numbers, booleans or lists of those.
pub fn check_props(
    schemas: &[TagSchema],
    tags: &[String],
    changes: &Map<String, Value>,
) -> Result<Map<String, Value>> {
    let mut out = Map::new();
    for (key, value) in changes {
        let def = schemas
            .iter()
            .filter(|s| tags.iter().any(|t| t.eq_ignore_ascii_case(&s.name)))
            .flat_map(|s| &s.properties)
            .find(|p| p.key == *key);
        let checked = match def {
            Some(def) => check(def, value)
                .map_err(|why| Error::Invalid(format!("Property “{key}” ({}) {why}", def.kind)))?,
            None => match value {
                Value::Object(_) => {
                    return Err(Error::Invalid(format!(
                        "Property “{key}” cannot hold a mapping"
                    )));
                }
                Value::Array(items) if items.iter().any(|i| i.is_object() || i.is_array()) => {
                    return Err(Error::Invalid(format!(
                        "Property “{key}” can hold a list of text, not nested lists"
                    )));
                }
                _ => value.clone(),
            },
        };
        out.insert(key.clone(), checked);
    }
    Ok(out)
}

/// A schema given as JSON, checked and written as YAML in the house style:
/// one line per property and per view.
pub fn schema_yaml(tag: &str, schema: &Value) -> Result<String> {
    let bad = |why: &str| Error::Invalid(format!("Tag schema for “{tag}”: {why}"));
    let map = schema.as_object().ok_or_else(|| bad("must be a mapping"))?;
    let mut out = format!("name: {}\n", yaml_scalar(tag));
    for (key, value) in map {
        match key.as_str() {
            "name" => {}
            "properties" | "views" => {
                let list = value
                    .as_array()
                    .ok_or_else(|| bad(&format!("{key} must be a list")))?;
                out.push_str(&format!("{key}:\n"));
                for item in list {
                    let entry = item
                        .as_object()
                        .ok_or_else(|| bad(&format!("each of {key} must be a mapping")))?;
                    if key == "properties" {
                        let kind = entry.get("type").and_then(Value::as_str).unwrap_or("text");
                        if text(entry.get("key")).is_none() {
                            return Err(bad("each property needs a key"));
                        }
                        if !KINDS.contains(&kind) {
                            return Err(bad(&format!("unknown property type “{kind}”")));
                        }
                    }
                    out.push_str(&format!("  - {}\n", yaml_value(item)));
                }
            }
            _ => out.push_str(&format!("{}: {}\n", yaml_scalar(key), yaml_value(value))),
        }
    }
    Ok(out)
}

#[cfg(test)]
#[path = "tags_tests.rs"]
mod tests;
