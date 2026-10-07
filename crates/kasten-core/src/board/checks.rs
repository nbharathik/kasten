//! The values a board change may carry, checked before anything changes:
//! colours, sides, ends, web addresses, positions and sizes.

use serde_json::{Map, Value};

use crate::error::{Error, Result};

/// Numbers beyond any real board.
pub(super) const LIMIT: i64 = 1 << 40;

/// A JSON Canvas colour: a preset `1` to `6`, or `#rrggbb`.
pub(super) fn colour(value: &str) -> Result<&str> {
    let value = value.trim();
    let preset = matches!(value, "1" | "2" | "3" | "4" | "5" | "6");
    let hex = value.len() == 7
        && value.starts_with('#')
        && value[1..].bytes().all(|b| b.is_ascii_hexdigit());
    if preset || hex {
        Ok(value)
    } else {
        Err(Error::Invalid(format!(
            "Not a board colour: {value} (use 1 to 6 or #rrggbb)"
        )))
    }
}

pub(super) fn side(value: &str) -> Result<&str> {
    match value {
        "top" | "right" | "bottom" | "left" => Ok(value),
        _ => Err(Error::Invalid(format!(
            "Not a side of a node: {value} (use top, right, bottom or left)"
        ))),
    }
}

pub(super) fn end(value: &str) -> Result<&str> {
    match value {
        "none" | "arrow" => Ok(value),
        _ => Err(Error::Invalid(format!(
            "An edge ends in none or arrow, not {value}"
        ))),
    }
}

/// A web address a link card may open: http or https only, so a board
/// from elsewhere cannot hide a script behind a card.
pub(super) fn web_address(value: &str) -> Result<&str> {
    let url = value.trim();
    let lower = url.to_ascii_lowercase();
    let rest = lower
        .strip_prefix("https://")
        .or_else(|| lower.strip_prefix("http://"));
    match rest {
        Some(rest) if !rest.trim().is_empty() => Ok(url),
        _ => Err(Error::Invalid(format!(
            "Not a web address: {value} (links start with https://)"
        ))),
    }
}

pub(super) fn position(x: i64, y: i64) -> Result<(i64, i64)> {
    if x.unsigned_abs() > LIMIT.unsigned_abs() || y.unsigned_abs() > LIMIT.unsigned_abs() {
        return Err(Error::Invalid(format!(
            "Too far out on the board: {x}, {y}"
        )));
    }
    Ok((x, y))
}

pub(super) fn size(width: i64, height: i64) -> Result<(i64, i64)> {
    if !(1..=LIMIT).contains(&width) || !(1..=LIMIT).contains(&height) {
        return Err(Error::Invalid(format!(
            "A node's size must be above zero, not {width}×{height}"
        )));
    }
    Ok((width, height))
}

/// A style value to set, checked by `check`, or "" to remove it.
pub(super) fn cleared_or(
    value: &Option<String>,
    check: fn(&str) -> Result<&str>,
) -> Result<Option<&str>> {
    match value.as_deref().map(str::trim) {
        Some("") => Ok(Some("")),
        Some(value) => check(value).map(Some),
        None => Ok(None),
    }
}

/// Sets `key`, or removes it when `value` is empty, keeping the order of
/// every other key.
pub(super) fn set_or_clear(item: &mut Map<String, Value>, key: &str, value: &str) {
    if value.is_empty() {
        item.shift_remove(key);
    } else {
        item.insert(key.to_owned(), value.into());
    }
}
