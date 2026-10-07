//! What a change did to a deck, read from the two texts: the slides it added,
//! removed and changed, whether it put them in another order, and whether it
//! touched anything outside the slides. Core keeps a deck as text, so this
//! reads the JSON's slide list and each slide's title, and nothing more.

use std::collections::{BTreeSet, HashMap};

use serde_json::Value;

/// The name an edit is recorded under when it puts another deck in place of
/// the one it is applied to (a batch of operations with a `replace_deck` in it
/// is recorded under it). A limit on slides taken out counts every slide such
/// an edit does not leave as it was, since slides can keep their ids and have
/// everything else replaced.
pub const REPLACES_DECK: &str = "replace_deck";

/// The most titles named when a list of slides is put in words.
const NAMED: usize = 4;
/// The longest title shown, in characters.
const TITLE_CHARS: usize = 60;

/// A slide named for a person.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SlideRef {
    pub id: String,
    /// The words of its title, or of its first text, or its layout's name.
    pub title: String,
}

/// The difference between two versions of a deck.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SlideChanges {
    /// Slides only the later version has.
    pub added: Vec<SlideRef>,
    /// Slides only the earlier version has.
    pub removed: Vec<SlideRef>,
    /// Slides both have, that differ (except the ones in `emptied`).
    pub changed: Vec<SlideRef>,
    /// Slides both have that the later version has left with nothing on them: no elements, or
    /// only text boxes with no words. Named as they were.
    pub emptied: Vec<SlideRef>,
    /// The slides both have are in another order.
    pub reordered: bool,
    /// Something outside the slides differs: the theme, the size, the title, the sections.
    pub settings: bool,
}

fn slides_of(deck: &Value) -> &[Value] {
    deck.get("slides")
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

fn id_of(slide: &Value) -> &str {
    slide.get("id").and_then(Value::as_str).unwrap_or("")
}

/// The plain words of an element's text, paragraph after paragraph.
fn words_of(element: &Value) -> String {
    let paragraphs = element
        .pointer("/text/paragraphs")
        .and_then(Value::as_array)
        .map_or(&[][..], Vec::as_slice);
    let lines: Vec<String> = paragraphs
        .iter()
        .map(|p| {
            p.get("runs")
                .and_then(Value::as_array)
                .map_or(&[][..], Vec::as_slice)
                .iter()
                .filter_map(|r| r.get("t").and_then(Value::as_str))
                .collect::<String>()
        })
        .collect();
    lines
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn clipped(words: &str) -> String {
    match words.char_indices().nth(TITLE_CHARS) {
        Some((at, _)) => format!("{}…", words[..at].trim_end()),
        None => words.to_owned(),
    }
}

/// The name a slide goes by: its title slot, else its first words, else its layout.
fn title_of(slide: &Value) -> String {
    let elements = slide
        .get("elements")
        .and_then(Value::as_array)
        .map_or(&[][..], Vec::as_slice);
    let titled = elements
        .iter()
        .filter(|e| e.get("placeholder").and_then(Value::as_str) == Some("title"))
        .map(words_of)
        .find(|w| !w.is_empty());
    let first = || elements.iter().map(words_of).find(|w| !w.is_empty());
    let layout = || {
        slide
            .get("layout")
            .and_then(Value::as_str)
            .unwrap_or("slide")
            .to_owned()
    };
    clipped(&titled.or_else(first).unwrap_or_else(layout))
}

fn named(slide: &Value) -> SlideRef {
    SlideRef {
        id: id_of(slide).to_owned(),
        title: title_of(slide),
    }
}

fn settings_of(deck: &Value) -> Value {
    let mut rest = deck.clone();
    if let Some(map) = rest.as_object_mut() {
        map.remove("slides");
    }
    rest
}

/// Whether an element shows nothing: a text box without words, or a group of such.
fn blank(element: &Value) -> bool {
    match element.get("type").and_then(Value::as_str) {
        Some("text") => words_of(element).is_empty(),
        Some("group") => element
            .get("children")
            .and_then(Value::as_array)
            .is_none_or(|children| children.iter().all(blank)),
        _ => false,
    }
}

/// Whether a slide shows nothing: no elements, or only ones that show nothing.
fn holds_nothing(slide: &Value) -> bool {
    slide
        .get("elements")
        .and_then(Value::as_array)
        .is_none_or(|elements| elements.iter().all(blank))
}

/// What changed between the deck in `before` and the deck in `after`. Text
/// that is not a deck counts as a deck with no slides.
pub fn slide_changes(before: &str, after: &str) -> SlideChanges {
    let parse = |text: &str| serde_json::from_str::<Value>(text).unwrap_or(Value::Null);
    let (a, b) = (parse(before), parse(after));
    let (old, new) = (slides_of(&a), slides_of(&b));
    let old_by_id: HashMap<&str, &Value> = old.iter().map(|s| (id_of(s), s)).collect();
    let new_ids: BTreeSet<&str> = new.iter().map(id_of).collect();
    let mut out = SlideChanges {
        settings: settings_of(&a) != settings_of(&b),
        ..SlideChanges::default()
    };
    for slide in old.iter().filter(|s| !new_ids.contains(id_of(s))) {
        out.removed.push(named(slide));
    }
    for slide in new {
        match old_by_id.get(id_of(slide)) {
            None => out.added.push(named(slide)),
            Some(&was) if was != slide && holds_nothing(slide) && !holds_nothing(was) => {
                out.emptied.push(named(was))
            }
            Some(&was) if was != slide => out.changed.push(named(slide)),
            Some(_) => {}
        }
    }
    let kept = |slides: &[Value], other: &HashMap<&str, &Value>| -> Vec<String> {
        slides
            .iter()
            .map(id_of)
            .filter(|id| other.contains_key(id))
            .map(str::to_owned)
            .collect()
    };
    let new_by_id: HashMap<&str, &Value> = new.iter().map(|s| (id_of(s), s)).collect();
    out.reordered = kept(old, &new_by_id) != kept(new, &old_by_id);
    out
}

fn slides(n: usize) -> String {
    format!("{n} slide{}", if n == 1 { "" } else { "s" })
}

/// “A”, “B”, “C” and 2 more.
fn titles(list: &[SlideRef]) -> String {
    let mut shown: Vec<String> = list
        .iter()
        .take(NAMED)
        .map(|s| format!("“{}”", s.title))
        .collect();
    if list.len() > NAMED {
        shown.push(format!("{} more", list.len() - NAMED));
        let last = shown.pop().unwrap_or_default();
        return format!("{} and {last}", shown.join(", "));
    }
    match shown.pop() {
        Some(last) if !shown.is_empty() => format!("{} and {last}", shown.join(", ")),
        Some(last) => last,
        None => String::new(),
    }
}

impl SlideChanges {
    /// Nothing differs.
    pub fn is_empty(&self) -> bool {
        self.added.is_empty()
            && self.removed.is_empty()
            && self.changed.is_empty()
            && self.emptied.is_empty()
            && !self.reordered
            && !self.settings
    }

    /// How many slides the change takes out of the deck: the ones it removes and the ones it
    /// leaves with nothing on them. A limit on removals counts these, so that emptying every
    /// slide is not easier than deleting them.
    pub fn taken_out(&self) -> usize {
        self.removed.len() + self.emptied.len()
    }

    /// How many slides a replacement of the whole deck puts something else in
    /// the place of: the ones taken out and the ones rewritten. Only a slide
    /// left exactly as it was is not counted.
    pub fn replaced(&self) -> usize {
        self.taken_out() + self.changed.len()
    }

    /// The change in a sentence: "Removes 4 slides (“Intro”, …), adds 1 slide".
    pub fn words(&self) -> String {
        let mut parts = Vec::new();
        if !self.removed.is_empty() {
            parts.push(format!(
                "removes {} ({})",
                slides(self.removed.len()),
                titles(&self.removed)
            ));
        }
        if !self.emptied.is_empty() {
            parts.push(format!(
                "empties {} ({})",
                slides(self.emptied.len()),
                titles(&self.emptied)
            ));
        }
        if !self.added.is_empty() {
            parts.push(format!(
                "adds {} ({})",
                slides(self.added.len()),
                titles(&self.added)
            ));
        }
        if !self.changed.is_empty() {
            parts.push(format!(
                "changes {} ({})",
                slides(self.changed.len()),
                titles(&self.changed)
            ));
        }
        if self.reordered {
            parts.push("puts the slides in another order".to_owned());
        }
        if self.settings {
            parts.push("changes the deck's own settings".to_owned());
        }
        if parts.is_empty() {
            return "Changes nothing".to_owned();
        }
        let mut words = parts.join(", ");
        if let Some(first) = words.get_mut(..1) {
            first.make_ascii_uppercase();
        }
        words
    }
}

#[cfg(test)]
mod tests;
