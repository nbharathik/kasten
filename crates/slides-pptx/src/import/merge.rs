//! A new version of a deck, read from a file, put into the deck it came from: the slides and
//! elements that are still there keep their ids (and what a file cannot hold: steps, names, locks),
//! what is new is added, and slides of the deck that the file does not have are kept and named in
//! the notes of the merge. The result is meant to be saved as an ordinary edit of the deck.

mod elements;

use std::collections::{HashMap, HashSet};

use slides_core::ids::{IdGen, SLIDE};
use slides_core::{Deck, Element, Section, Slide};

use super::adapt::{Frame, adapt_slide};
use crate::markers;
use elements::{Cx, merge_lists, re_anchor};

/// A merge, and what it did that a person may want to know.
#[derive(Clone, Debug, PartialEq)]
pub struct Merged {
    pub deck: Deck,
    /// Slides of the deck that the file does not have, pages it did not use, and the like.
    pub notes: Vec<String>,
}

/// The marker an imported slide carries in its extra fields, if it has one.
fn marker_of(slide: &Slide) -> Option<markers::Marker> {
    let v = slide.extra.get("pptxMarker")?;
    let step = v
        .get("step")
        .and_then(|s| s.as_array())
        .and_then(|a| Some((a.first()?.as_u64()? as u32, a.get(1)?.as_u64()? as u32)));
    Some(markers::Marker {
        slide: v.get("slide")?.as_str()?.to_owned(),
        step,
        backup: v.get("backup").and_then(|b| b.as_bool()).unwrap_or(false),
    })
}

fn title_of(slide: &Slide) -> String {
    let words = |e: &Element| {
        e.text()
            .map(|t| t.plain_text().trim().to_lowercase())
            .unwrap_or_default()
    };
    slide
        .elements
        .iter()
        .find(|e| e.base().placeholder.as_deref() == Some("title"))
        .map(words)
        .unwrap_or_default()
}

/// `[words](address)` as `words (address)`, which is how an export writes a link into notes.
fn links_as_words(line: &str) -> String {
    let mut out = String::new();
    let mut rest = line;
    while let Some(open) = rest.find('[') {
        let after = &rest[open + 1..];
        let Some(close) = after.find("](") else { break };
        let Some(end) = after[close + 2..].find(')') else {
            break;
        };
        let (words, address) = (&after[..close], &after[close + 2..close + 2 + end]);
        out.push_str(&rest[..open]);
        out.push_str(words);
        if !address.is_empty() && address != words {
            out.push_str(&format!(" ({address})"));
        }
        rest = &after[close + 2 + end + 1..];
    }
    out.push_str(rest);
    out
}

/// Notes as words only, to tell a change of words from a change of markup the file cannot hold.
fn plain_lines(notes: &str) -> Vec<String> {
    notes
        .lines()
        .map(|l| {
            let l = links_as_words(l.trim())
                .trim_start_matches(['#', '-', '*', '•', ' '])
                .to_owned();
            l.chars()
                .filter(|c| !matches!(c, '*' | '_' | '`'))
                .collect::<String>()
                .trim()
                .to_owned()
        })
        .filter(|l| !l.is_empty())
        .collect()
}

/// The slide of the deck a slide of the file is: by its marker, then by title, then by place.
fn match_slides(existing: &Deck, incoming: &[Slide]) -> Vec<Option<usize>> {
    let mut found: Vec<Option<usize>> = vec![None; incoming.len()];
    let mut taken = vec![false; existing.slides.len()];
    for (i, slide) in incoming.iter().enumerate() {
        let hit = marker_of(slide)
            .and_then(|m| existing.index_of(&m.slide))
            .filter(|j| !taken[*j]);
        if let Some(j) = hit {
            (found[i], taken[j]) = (Some(j), true);
        }
    }
    for (i, slide) in incoming.iter().enumerate() {
        let title = title_of(slide);
        if found[i].is_some() || title.is_empty() {
            continue;
        }
        let hit = (0..existing.slides.len())
            .find(|j| !taken[*j] && title_of(&existing.slides[*j]) == title);
        if let Some(j) = hit {
            (found[i], taken[j]) = (Some(j), true);
        }
    }
    for (i, slide) in incoming.iter().enumerate() {
        if found[i].is_none()
            && i < existing.slides.len()
            && !taken[i]
            && existing.slides[i].layout == slide.layout
        {
            (found[i], taken[i]) = (Some(i), true);
        }
    }
    found
}

/// A slide of the file that is a slide of the deck: the file's content, the deck's identity.
fn merge_slide(old: &Slide, expanded: &Slide, mut new: Slide, ids: &mut IdGen) -> Slide {
    let mut cx = Cx {
        ids,
        taken: HashSet::new(),
        renamed: HashMap::new(),
    };
    let mut elements = merge_lists(
        &old.elements,
        &expanded.elements,
        std::mem::take(&mut new.elements),
        &mut cx,
    );
    re_anchor(&mut elements, &cx.renamed);
    let mut out = old.clone();
    out.elements = elements;
    out.layout = new.layout;
    out.hidden = new.hidden;
    out.backup = new.backup;
    out.background = new.background;
    out.transition = new.transition.or_else(|| old.transition.clone());
    // Notes the file has in other words are the file's; notes it has only in plainer markup are the deck's.
    if plain_lines(&old.notes) != plain_lines(&new.notes) {
        out.notes = new.notes;
    }
    out.extra.remove("pptxMarker");
    out
}

/// Puts the new version `incoming` into `existing`. The deck's own theme, title, size and present
/// settings stay; its slides and their elements take the file's content and keep their ids.
pub fn merge_with_report(existing: &Deck, incoming: Deck) -> Merged {
    let mut notes = Vec::new();
    let expanded = slides_core::composites::expand_deck(existing);
    let (from_theme, from_size) = (incoming.theme.clone(), incoming.size.clone());
    let from = Frame {
        theme: &from_theme,
        size: &from_size,
    };
    let to = Frame {
        theme: &existing.theme,
        size: &existing.size,
    };
    // The pages of a slide with steps: only the last shows everything the slide does.
    let mut skipped = 0;
    let file_slides: Vec<Slide> = incoming
        .slides
        .into_iter()
        .filter(|s| {
            let early = marker_of(s)
                .and_then(|m| m.step)
                .is_some_and(|(k, n)| k < n);
            skipped += usize::from(early);
            !early
        })
        .collect();
    if skipped > 0 {
        notes.push(format!("{skipped} pages of slides with steps were left out: the last page of each stands for its slide."));
    }
    let found = match_slides(existing, &file_slides);
    let mut ids = IdGen::new(0x6d65_7267_6531);
    let mut taken: HashSet<String> = existing.slides.iter().map(|s| s.id.clone()).collect();

    // The slides of the new version, in its order; slides of the deck it lacks follow the slide before them.
    let mut result: Vec<(Option<usize>, Slide)> = Vec::new();
    let mut now_called: HashMap<String, String> = HashMap::new();
    let mut kept_with_steps = 0;
    for (slide, at) in file_slides.into_iter().zip(&found) {
        let was = slide.id.clone();
        let adapted = adapt_slide(slide, from, to);
        match at {
            Some(j) if existing.slides[*j].steps > 0 => {
                // A file has each step of the slide as a page, with what is hidden or dimmed then left out
                // or faded; none of that is a change to the slide, so the slide stays as it is.
                kept_with_steps += 1;
                now_called.insert(was, existing.slides[*j].id.clone());
                result.push((Some(*j), existing.slides[*j].clone()));
            }
            Some(j) => {
                let merged = merge_slide(
                    &existing.slides[*j],
                    &expanded.slides[*j],
                    adapted,
                    &mut ids,
                );
                now_called.insert(was, merged.id.clone());
                result.push((Some(*j), merged));
            }
            None => {
                let mut fresh = adapted;
                fresh.extra.remove("pptxMarker");
                if fresh.id.is_empty() || taken.contains(&fresh.id) {
                    fresh.id = ids.fresh(SLIDE, |c| taken.contains(c));
                }
                taken.insert(fresh.id.clone());
                now_called.insert(was, fresh.id.clone());
                result.push((None, fresh));
            }
        }
    }
    if kept_with_steps > 0 {
        notes.push(format!("{kept_with_steps} slides with steps were kept as they are: a file has each of their steps as a page."));
    }
    let present: HashSet<usize> = found.iter().flatten().copied().collect();
    let mut left_out = Vec::new();
    for (j, slide) in existing.slides.iter().enumerate() {
        if present.contains(&j) {
            continue;
        }
        let before = (0..j)
            .rev()
            .find_map(|p| result.iter().position(|(o, _)| *o == Some(p)));
        result.insert(before.map_or(0, |p| p + 1), (Some(j), slide.clone()));
        left_out.push(slide.id.clone());
    }
    if !left_out.is_empty() {
        notes.push(format!(
            "{} slides of the deck are not in the file and were kept.",
            left_out.len()
        ));
    }
    let added = result.iter().filter(|(o, _)| o.is_none()).count();
    if added > 0 {
        notes.push(format!(
            "{added} slides of the file are new and were added."
        ));
    }

    let mut deck = existing.clone();
    deck.slides = result.into_iter().map(|(_, s)| s).collect();
    if let Some(first) = deck.slides.first_mut() {
        first.backup = false;
    }
    // The file's sections, where it has any; otherwise the deck's own that still begin at a slide.
    let mapped: Vec<Section> = incoming
        .sections
        .iter()
        .filter_map(|s| {
            let id = now_called.get(&s.starts_at)?;
            Some(Section {
                title: s.title.clone(),
                starts_at: id.clone(),
                extra: slides_core::Extra::new(),
            })
        })
        .collect();
    if !mapped.is_empty() {
        deck.sections = mapped;
    } else {
        deck.sections
            .retain(|s| deck.slides.iter().any(|d| d.id == s.starts_at));
    }
    Merged { deck, notes }
}

/// The deck after a new version is put into it.
pub fn merge_version(existing: &Deck, incoming: Deck) -> Deck {
    merge_with_report(existing, incoming).deck
}

#[cfg(test)]
mod tests;
