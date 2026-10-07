//! Any YAML value as JSON, never failing: maps with non-text keys, odd
//! scalars and nesting all read, so one strange property never hides a
//! note's title (frontmatter is read leniently everywhere).

use serde::de::{self, Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Loose(pub Value);

impl<'de> Deserialize<'de> for Loose {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(LooseVisitor).map(Loose)
    }
}

struct LooseVisitor;

fn key_text(value: Value) -> String {
    match value {
        Value::String(s) => s,
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

impl<'de> Visitor<'de> for LooseVisitor {
    type Value = Value;

    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str("any YAML value")
    }
    fn visit_bool<E: de::Error>(self, v: bool) -> Result<Value, E> {
        Ok(Value::Bool(v))
    }
    fn visit_i64<E: de::Error>(self, v: i64) -> Result<Value, E> {
        Ok(Value::Number(v.into()))
    }
    fn visit_u64<E: de::Error>(self, v: u64) -> Result<Value, E> {
        Ok(Value::Number(v.into()))
    }
    fn visit_f64<E: de::Error>(self, v: f64) -> Result<Value, E> {
        Ok(Number::from_f64(v).map_or_else(|| Value::String(v.to_string()), Value::Number))
    }
    fn visit_str<E: de::Error>(self, v: &str) -> Result<Value, E> {
        Ok(Value::String(v.to_owned()))
    }
    fn visit_unit<E: de::Error>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }
    fn visit_none<E: de::Error>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }
    fn visit_some<D: Deserializer<'de>>(self, d: D) -> Result<Value, D::Error> {
        d.deserialize_any(LooseVisitor)
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Value, A::Error> {
        let mut out = Vec::new();
        while let Some(Loose(item)) = seq.next_element::<Loose>()? {
            out.push(item);
        }
        Ok(Value::Array(out))
    }
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Value, A::Error> {
        let mut out = Map::new();
        while let Some((Loose(key), Loose(value))) = map.next_entry::<Loose, Loose>()? {
            out.insert(key_text(key), value);
        }
        Ok(Value::Object(out))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_any_yaml_as_json() {
        let v: Loose = serde_saphyr::from_str("status: Idea\ndeadline: 2026-10-15\ncount: 3\ndone: true\n1: one\nlist: [a, 2]\nnested: {x: null}\n").unwrap();
        assert_eq!(
            v.0,
            serde_json::json!({"status": "Idea", "deadline": "2026-10-15", "count": 3, "done": true, "1": "one", "list": ["a", 2], "nested": {"x": null}})
        );
    }
}
