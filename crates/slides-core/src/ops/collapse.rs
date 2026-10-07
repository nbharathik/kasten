//! Collapsing a run of similar slides into one that builds up in steps.
//!
//! Slides made by copying a slide and changing a little (a list that grows one point at a time, a
//! figure with one more box on each) come out of PowerPoint as slides that repeat each other. In
//! a deck they are better as one slide with steps: what every copy had stays, and what only some
//! had appears and disappears at the step where its slide was.

use std::collections::{HashMap, HashSet};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::steps::MOST_STEPS;
use super::util::{assign_ids, collect_ids};
use super::{Cx, Op, Scope, op_types};
use crate::error::{Error, Result};
use crate::model::{Deck, Element, Slide, StepState, Text};

mod similar;

pub use similar::similar_runs;
use similar::{Look, eligible};

op_types! {
    /// Merges slides that follow each other into the first of them, as steps.
    pub struct CollapseSlides {
        /// The slides, in deck order, with no other slide between them.
        pub slides: Vec<String>,
    }

    pub struct Collapsed {
        /// The slide that holds them all now: the first.
        pub slide: String,
        /// How many steps it has: one for each slide after the first.
        pub steps: u32,
    }
}

/// One element of the merged slide, and the slides it was on.
struct Track {
    element: Element,
    look: Look,
    present: Vec<bool>,
}

/// The states an element needs to be there on the slides it was on and nowhere else.
fn states(present: &[bool]) -> std::collections::BTreeMap<u32, StepState> {
    let mut out = std::collections::BTreeMap::new();
    let mut now = StepState::Normal;
    for (step, here) in present.iter().enumerate() {
        let wanted = if *here {
            StepState::Normal
        } else {
            StepState::Hidden
        };
        if wanted != now {
            out.insert(step as u32, wanted.clone());
            now = wanted;
        }
    }
    out
}

/// Points a connector's ends at the elements of the merged slide that stand for those it joined.
fn re_anchor(element: &mut Element, of: &HashMap<String, String>) {
    if let Element::Connector(c) = element {
        for anchor in [&mut c.from, &mut c.to].into_iter().flatten() {
            if let Some(id) = of.get(&anchor.el) {
                anchor.el = id.clone();
            }
        }
    }
}

/// Matches each element of `slide` with a track that has its twin, or makes a track for it.
/// Returns the tracks in the order the slide's elements take, as indexes into `tracks`.
fn place(
    tracks: &mut Vec<Track>,
    slide: &Slide,
    at: usize,
    count: usize,
    used: &mut HashSet<String>,
    cx: &mut Cx,
) -> Vec<usize> {
    let mut chosen: Vec<Option<usize>> = vec![None; slide.elements.len()];
    let mut claimed: HashSet<usize> = HashSet::new();
    let mut of: HashMap<String, String> = HashMap::new();
    // What is joined is matched first, so that a connector can be told by the elements it joins.
    for connectors in [false, true] {
        for (i, original) in slide.elements.iter().enumerate() {
            if matches!(original, Element::Connector(_)) != connectors {
                continue;
            }
            let mut element = original.clone();
            re_anchor(&mut element, &of);
            let look = Look::of(&element);
            let found =
                (0..tracks.len()).find(|t| !claimed.contains(t) && tracks[*t].look.same(&look));
            let index = match found {
                Some(t) => t,
                None => {
                    let mut own = vec![element];
                    assign_ids(&mut own, used, cx.ids, true);
                    let Some(element) = own.pop() else { continue };
                    tracks.push(Track {
                        element,
                        look,
                        present: vec![false; count],
                    });
                    tracks.len() - 1
                }
            };
            claimed.insert(index);
            tracks[index].present[at] = true;
            of.insert(
                original.id().to_owned(),
                tracks[index].element.id().to_owned(),
            );
            chosen[i] = Some(index);
        }
    }
    chosen.into_iter().flatten().collect()
}

/// An order for the tracks that keeps the order every slide had them in, as far as the slides agree:
/// each track comes after the one before it on any slide, and where nothing is said the one that
/// came first goes first. Slides that disagree (one has a above b, another b above a) are settled
/// in favour of the earlier track.
fn stacking(count: usize, sequences: &[Vec<usize>]) -> Vec<usize> {
    let mut before: Vec<HashSet<usize>> = vec![HashSet::new(); count];
    for sequence in sequences {
        for pair in sequence.windows(2) {
            if pair[0] != pair[1] {
                before[pair[1]].insert(pair[0]);
            }
        }
    }
    let mut done = vec![false; count];
    let mut out = Vec::with_capacity(count);
    while out.len() < count {
        let ready = (0..count).find(|t| !done[*t] && before[*t].iter().all(|b| done[*b]));
        // With a cycle (slides that disagree) the earliest track left goes next.
        let next = ready.or_else(|| (0..count).find(|t| !done[*t]));
        let Some(next) = next else { break };
        done[next] = true;
        out.push(next);
    }
    out
}

/// The merged slide's elements from a run of slides.
fn merge(run: &[Slide], cx: &mut Cx) -> Vec<Element> {
    let mut tracks: Vec<Track> = Vec::new();
    let mut used: HashSet<String> = HashSet::new();
    let mut sequences = Vec::with_capacity(run.len());
    for (at, slide) in run.iter().enumerate() {
        sequences.push(place(&mut tracks, slide, at, run.len(), &mut used, cx));
    }
    let mut out = Vec::with_capacity(tracks.len());
    for t in stacking(tracks.len(), &sequences) {
        let track = &mut tracks[t];
        track.element.base_mut().step_states = states(&track.present);
        out.push(track.element.clone());
    }
    drop_dangling_anchors(&mut out);
    out
}

/// A connector whose element is not on the slide is left where it lies, joined to nothing.
fn drop_dangling_anchors(list: &mut [Element]) {
    let mut ids = HashSet::new();
    collect_ids(list, &mut ids);
    fn walk(list: &mut [Element], ids: &HashSet<String>) {
        for e in list {
            if let Element::Connector(c) = e {
                for anchor in [&mut c.from, &mut c.to] {
                    if anchor.as_ref().is_some_and(|a| !ids.contains(&a.el)) {
                        *anchor = None;
                    }
                }
            }
            if let Some(children) = e.children_mut() {
                walk(children, ids);
            }
        }
    }
    walk(list, &ids);
}

/// The notes of the slides, each paragraph said once, in the order it first came.
fn notes_of(run: &[Slide]) -> String {
    let mut seen: Vec<&str> = Vec::new();
    for slide in run {
        for paragraph in slide.notes.split("\n\n").map(str::trim) {
            if !paragraph.is_empty() && !seen.contains(&paragraph) {
                seen.push(paragraph);
            }
        }
    }
    seen.join("\n\n")
}

/// The texts an element holds itself: its words, a connector's label, the cells of a table.
fn texts_mut(element: &mut Element) -> Vec<&mut Text> {
    match element {
        Element::Text(e) => vec![&mut e.text],
        Element::Shape(e) => e.text.iter_mut().collect(),
        Element::Connector(e) => e.label.iter_mut().collect(),
        Element::Table(e) => e
            .rows
            .iter_mut()
            .flat_map(|row| row.cells.iter_mut().map(|cell| &mut cell.text))
            .collect(),
        _ => Vec::new(),
    }
}

/// Links to a slide that is gone go to the slide that took its place.
fn retarget(deck: &mut Deck, gone: &HashSet<String>, to: &str) {
    let fix = |link: &mut Option<String>| {
        if let Some(target) = link.as_deref().and_then(|l| l.strip_prefix("slide:"))
            && gone.contains(target)
        {
            *link = Some(format!("slide:{to}"));
        }
    };
    for slide in &mut deck.slides {
        super::util::each_mut(&mut slide.elements, &mut |e| {
            fix(&mut e.base_mut().link);
            for text in texts_mut(e) {
                for run in text.paragraphs.iter_mut().flat_map(|p| p.runs.iter_mut()) {
                    fix(&mut run.link);
                }
            }
        });
    }
}

impl Op for CollapseSlides {
    type Output = Collapsed;
    const NAME: &'static str = "collapse_slides";
    const ABOUT: &'static str = "Merge slides that follow each other into the first of them, as steps: the first slide gets one step for each slide after it, what every slide had stays, and an element that only some had appears and disappears at the steps where its slide was. The later slides' notes are added to the first slide's. Use it for a build that was made by copying a slide and changing a little. The slides must have the same layout, no steps of their own and be neither hidden nor backups.";

    fn scope(&self, _: &Deck) -> Scope {
        Scope::slides(self.slides.iter()).with_order().with_meta()
    }

    fn run(self, cx: &mut Cx) -> Result<Collapsed> {
        let n = self.slides.len();
        if n < 2 {
            return Err(Error::refused("Give at least two slides to collapse."));
        }
        if n - 1 > MOST_STEPS as usize {
            return Err(Error::refused(format!(
                "A slide can have {MOST_STEPS} steps, so at most {} slides can be collapsed into one.",
                MOST_STEPS + 1
            )));
        }
        let first = cx
            .deck
            .index_of(&self.slides[0])
            .ok_or_else(|| Error::no_slide(&self.slides[0]))?;
        for (k, id) in self.slides.iter().enumerate() {
            cx.deck.slide(id).ok_or_else(|| Error::no_slide(id))?;
            if cx.deck.slides.get(first + k).map(|s| &s.id) != Some(id) {
                return Err(Error::refused(
                    "The slides must follow each other in the deck, in order, with no other slide between them.",
                ));
            }
        }
        let run: Vec<Slide> = cx.deck.slides[first..first + n].to_vec();
        if let Some(bad) = run.iter().find(|s| !eligible(s)) {
            return Err(Error::refused(format!(
                "Slide `{}` is hidden, a backup or already has steps; only plain slides can be collapsed.",
                bad.id
            )));
        }
        if run.iter().any(|s| s.layout != run[0].layout) {
            return Err(Error::refused("The slides must all have the same layout."));
        }

        let mut merged = run[0].clone();
        merged.elements = merge(&run, cx);
        merged.steps = (n - 1) as u32;
        merged.notes = notes_of(&run);
        let id = merged.id.clone();
        let gone: HashSet<String> = run[1..].iter().map(|s| s.id.clone()).collect();

        // A section that began at a slide that is gone begins at the next slide left, unless one already does.
        let after = cx.deck.slides.get(first + n).map(|s| s.id.clone());
        let starts: HashSet<String> = cx
            .deck
            .sections
            .iter()
            .map(|s| s.starts_at.clone())
            .collect();
        let mut sections = std::mem::take(&mut cx.deck.sections);
        sections.retain_mut(|section| {
            if !gone.contains(&section.starts_at) {
                return true;
            }
            match after.as_ref().filter(|a| !starts.contains(*a)) {
                Some(next) => {
                    section.starts_at = next.clone();
                    true
                }
                None => false,
            }
        });
        cx.deck.sections = sections;

        cx.deck.slides[first] = merged;
        cx.deck.slides.drain(first + 1..first + n);
        retarget(cx.deck, &gone, &id);
        Ok(Collapsed {
            slide: id,
            steps: (n - 1) as u32,
        })
    }
}
