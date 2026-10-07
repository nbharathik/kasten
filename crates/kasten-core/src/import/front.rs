//! An imported note's frontmatter: its own keys kept as they were, with
//! Kasten's added (id, title, type, dates, tags, parent). Its own `type`
//! or `id`, which Kasten's would replace, are kept under other names, and
//! frontmatter that is not valid YAML moves into the page as a code block.

use serde_json::{Map, Value};

use super::plan::{Warn, Warnings};
use crate::frontmatter::{Front, rename_key, set_key, set_key_raw, split, yaml_list, yaml_ok};
use crate::props::set_props;

/// The kinds of note Kasten knows by `type`.
const KINDS: [&str; 7] = [
    "page",
    "card",
    "journal",
    "project",
    "highlight",
    "chat",
    "template",
];

/// Kasten's keys for one imported note.
pub(crate) struct Keys<'a> {
    pub id: &'a str,
    pub title: &'a str,
    /// `page`, `card` or `journal`.
    pub kind: &'a str,
    /// Used when the note has none of its own.
    pub created: &'a str,
    pub updated: &'a str,
    /// Tags found in the text, added to the note's own.
    pub tags: &'a [String],
    pub parent: Option<&'a str>,
    /// Property values (a Notion database row's).
    pub props: Option<&'a Map<String, Value>>,
}

/// Whether `id` is a ULID as Kasten makes them.
pub(crate) fn is_ulid(id: &str) -> bool {
    id.len() == 26
        && id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b.is_ascii_uppercase() && !b"ILOU".contains(&b)))
}

/// The note's own id when Kasten can keep it.
pub(crate) fn own_id(prefix: &str) -> Option<String> {
    Front::text(&Front::read(prefix).id).filter(|id| is_ulid(id))
}

/// The note's own title, if it has one.
pub(crate) fn own_title(prefix: &str) -> Option<String> {
    Front::text(&Front::read(prefix).title).filter(|t| !t.trim().is_empty())
}

/// Tags as written, split into single tags without `#`.
fn clean_tags(tags: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for tag in tags.iter().flat_map(|t| t.split([',', ' '])) {
        let tag = tag.trim().trim_start_matches('#');
        if !tag.is_empty() && !out.iter().any(|t| t.to_lowercase() == tag.to_lowercase()) {
            out.push(tag.to_owned());
        }
    }
    out
}

/// The note as Kasten keeps it: `text`'s frontmatter with `keys`, and its
/// body (with broken frontmatter moved into it).
pub(crate) fn with_keys(
    text: &str,
    body: &str,
    keys: &Keys,
    source: &str,
    warnings: &mut Warnings,
) -> String {
    let eol = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let mut prefix = split(text).prefix.to_owned();
    let mut body = body.to_owned();
    if !yaml_ok(&prefix) {
        warnings.add(Warn::BadFrontmatter, source);
        let yaml = prefix
            .trim_start_matches('\u{feff}')
            .trim_end_matches(['\n', '\r'])
            .trim_start_matches("---")
            .trim_end_matches("---")
            .trim_matches(['\n', '\r']);
        body = format!("```yaml{eol}{yaml}{eol}```{eol}{eol}{body}");
        prefix = String::new();
    }
    let front = Front::read(&prefix);
    // Keys Kasten gives a meaning of its own: the note's values move aside.
    if let Some(kind) = Front::text(&front.kind)
        && kind != keys.kind
        && (!KINDS.contains(&kind.as_str()) || keys.kind == "journal")
    {
        if KINDS.contains(&kind.as_str()) {
            prefix = set_key(&prefix, "type", None, eol);
        } else {
            prefix = rename_key(&prefix, "type", "note-type");
            warnings.add(Warn::NoteType, source);
        }
    }
    let kind = Front::text(&Front::read(&prefix).kind).unwrap_or_else(|| keys.kind.to_owned());
    if let Some(id) = Front::text(&front.id)
        && id != keys.id
    {
        prefix = rename_key(&prefix, "id", "original-id");
        warnings.add(Warn::OriginalId, source);
    }
    let own_tags = match &front.tags {
        Some(tags) => tags.0.clone(),
        None => Vec::new(),
    };
    let mut tags = clean_tags(&own_tags);
    for tag in clean_tags(keys.tags) {
        if !tags.iter().any(|t| t.to_lowercase() == tag.to_lowercase()) {
            tags.push(tag);
        }
    }

    let read = Front::read(&prefix);
    if Front::text(&read.id).as_deref() != Some(keys.id) {
        prefix = set_key(&prefix, "id", Some(keys.id), eol);
    }
    if Front::text(&read.title).as_deref() != Some(keys.title) {
        prefix = set_key(&prefix, "title", Some(keys.title), eol);
    }
    if Front::text(&read.kind).as_deref() != Some(kind.as_str()) {
        prefix = set_key(&prefix, "type", Some(&kind), eol);
    }
    if read.created.is_none() {
        prefix = set_key(&prefix, "created", Some(keys.created), eol);
    }
    if read.updated.is_none() {
        prefix = set_key(&prefix, "updated", Some(keys.updated), eol);
    }
    if tags != own_tags {
        let list = (!tags.is_empty()).then(|| yaml_list(&tags));
        prefix = set_key_raw(&prefix, "tags", list.as_deref(), eol);
    }
    if let Some(parent) = keys.parent {
        prefix = set_key(&prefix, "parent", Some(parent), eol);
    }
    if let Some(props) = keys.props.filter(|p| !p.is_empty())
        && let Ok(with) = set_props(&prefix, props, eol)
    {
        prefix = with;
    }
    format!("{prefix}{body}")
}
