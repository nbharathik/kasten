//! Which slides are builds of each other: the same layout and background and nearly all of what is
//! on them the same, and the runs of such slides that follow each other in a deck.

use serde_json::Value;

use crate::model::{Deck, Element, Slide};
use crate::ops::MOST_STEPS;

/// Two boxes within this many units in every coordinate are in the same place.
const NEAR: f64 = 2.0;
/// The share of the larger slide's elements that must be the same for two slides to be one build.
const SHARE: f64 = 0.8;

/// What makes an element the same element on another slide: everything it says except where it is
/// and what it is called, and then where it is, within two units.
pub(super) struct Look {
    pub(super) said: Value,
    pub(super) rect: Option<(f64, f64, f64, f64)>,
    pub(super) locked: bool,
}

fn strip(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for key in ["id", "x", "y", "w", "h", "stepStates"] {
                map.remove(key);
            }
            map.values_mut().for_each(strip);
        }
        Value::Array(list) => list.iter_mut().for_each(strip),
        _ => {}
    }
}

impl Look {
    pub(super) fn of(element: &Element) -> Look {
        let mut said = serde_json::to_value(element).unwrap_or(Value::Null);
        strip(&mut said);
        Look {
            said,
            rect: element.base().rect(),
            locked: element.base().locked,
        }
    }

    pub(super) fn same(&self, other: &Look) -> bool {
        let near = |a: f64, b: f64| (a - b).abs() <= NEAR;
        self.said == other.said
            && match (self.rect, other.rect) {
                (Some(a), Some(b)) => {
                    near(a.0, b.0) && near(a.1, b.1) && near(a.2, b.2) && near(a.3, b.3)
                }
                (None, None) => true,
                _ => false,
            }
    }
}

/// A slide a run may hold: shown, not stacked under another, and with no steps of its own.
pub(super) fn eligible(slide: &Slide) -> bool {
    !slide.hidden && !slide.backup && slide.steps == 0
}

/// How many of the elements of `a` have a twin among those of `b`, each twin used once.
fn twins(a: &[&Look], b: &[&Look]) -> usize {
    let mut used = vec![false; b.len()];
    a.iter()
        .filter(|x| {
            let found = b.iter().enumerate().find(|(i, y)| !used[*i] && x.same(y));
            if let Some((i, _)) = found {
                used[i] = true;
            }
            found.is_some()
        })
        .count()
}

/// Whether two slides are one build: the same layout and background, and nearly all of what is on
/// them the same, but not all of it (a copy that changes nothing is a copy, not a build). What a
/// layout puts on every slide (locked elements) says nothing, so it is not counted.
fn similar(a: &Slide, b: &Slide, looks: (&[Look], &[Look])) -> bool {
    if a.layout != b.layout || a.background != b.background {
        return false;
    }
    fn own(list: &[Look]) -> Vec<&Look> {
        list.iter().filter(|l| !l.locked).collect()
    }
    let (ua, ub) = (own(looks.0), own(looks.1));
    let most = ua.len().max(ub.len());
    if most == 0 {
        return false;
    }
    let matched = twins(&ua, &ub);
    matched >= 1 && matched < most && matched as f64 / most as f64 >= SHARE
}

/// Runs of slides, by their place in the deck, that follow each other and are builds of one
/// another: the same layout, the same background and at least 80% of their elements the same (the
/// same kind, words and place, to within two units). Each run has two slides or more.
pub fn similar_runs(deck: &Deck) -> Vec<Vec<usize>> {
    let looks: Vec<Option<Vec<Look>>> = deck
        .slides
        .iter()
        .map(|s| eligible(s).then(|| s.elements.iter().map(Look::of).collect()))
        .collect();
    let mut runs = Vec::new();
    let mut run: Vec<usize> = Vec::new();
    let close = |run: &mut Vec<usize>, runs: &mut Vec<Vec<usize>>| {
        if run.len() >= 2 {
            runs.push(std::mem::take(run));
        } else {
            run.clear();
        }
    };
    for (i, mine) in looks.iter().enumerate() {
        let Some(mine) = mine else {
            close(&mut run, &mut runs);
            continue;
        };
        let joins = run.last().is_some_and(|&prev| {
            looks[prev]
                .as_ref()
                .is_some_and(|theirs| similar(&deck.slides[prev], &deck.slides[i], (theirs, mine)))
        });
        // One slide more than the most steps: the first slide and one for each step.
        if joins && run.len() <= MOST_STEPS as usize {
            run.push(i);
        } else {
            close(&mut run, &mut runs);
            run.push(i);
        }
    }
    close(&mut run, &mut runs);
    runs
}
