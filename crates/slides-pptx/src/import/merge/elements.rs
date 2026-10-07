//! The elements of a slide, matched with those of the version it replaces: by kind, words and
//! place first, then by kind and place, so an element that was only moved a little or reworded
//! keeps the id it had and everything a file cannot hold (its steps, its name, its lock).

use std::collections::{HashMap, HashSet};

use slides_core::Element;
use slides_core::ids::{ELEMENT, IdGen};

/// Boxes within this many units in every coordinate are in the same place.
const NEAR: f64 = 8.0;

/// What is shared while merging a slide.
pub struct Cx<'a> {
    pub ids: &'a mut IdGen,
    /// The ids in use on the slide being made.
    pub taken: HashSet<String>,
    /// Which id an element of the new version has now, for connectors to be pointed by.
    pub renamed: HashMap<String, String>,
}

/// The words an element shows, all its texts one after another.
fn words(e: &Element) -> String {
    let mut out = String::new();
    if let Some(t) = e.text() {
        out.push_str(&t.plain_text());
    }
    if let Element::Table(t) = e {
        for row in &t.rows {
            for cell in &row.cells {
                out.push('\u{1f}');
                out.push_str(&cell.text.plain_text());
            }
        }
    }
    for child in e.children() {
        out.push('\u{1e}');
        out.push_str(&words(child));
    }
    out
}

fn near(a: &Element, b: &Element) -> bool {
    match (a.base().rect(), b.base().rect()) {
        (Some(p), Some(q)) => [(p.0, q.0), (p.1, q.1), (p.2, q.2), (p.3, q.3)]
            .iter()
            .all(|(u, v)| (u - v).abs() <= NEAR),
        (None, None) => true,
        _ => false,
    }
}

fn strict(a: &Element, b: &Element) -> bool {
    a.kind() == b.kind() && words(a) == words(b) && near(a, b)
}

fn loose(a: &Element, b: &Element) -> bool {
    a.kind() == b.kind()
        && (near(a, b)
            || (a.base().placeholder.is_some() && a.base().placeholder == b.base().placeholder))
}

/// A slot the file leaves out while it is empty, and so has nothing to say about.
fn is_empty_slot(e: &Element) -> bool {
    e.base().placeholder.is_some()
        && match e {
            Element::Text(t) => t.text.is_blank(),
            Element::Image(i) => i.src.trim().is_empty(),
            _ => false,
        }
}

fn fresh(e: &mut Element, cx: &mut Cx) {
    let old = e.id().to_owned();
    let id = if !old.is_empty() && !cx.taken.contains(&old) {
        old.clone()
    } else {
        cx.ids.fresh(ELEMENT, |c| cx.taken.contains(c))
    };
    cx.taken.insert(id.clone());
    cx.renamed.insert(old, id.clone());
    e.base_mut().id = id;
    if let Some(children) = e.children_mut() {
        for child in children {
            fresh(child, cx);
        }
    }
}

/// The element of the new version with what only the old one had: its id, steps and lock.
fn carry(old: &Element, mut new: Element, cx: &mut Cx) -> Element {
    cx.renamed.insert(new.id().to_owned(), old.id().to_owned());
    cx.taken.insert(old.id().to_owned());
    let (from, to) = (old.base(), new.base_mut());
    to.id = from.id.clone();
    to.step_states = from.step_states.clone();
    to.locked = from.locked;
    if to.name.is_none() {
        to.name = from.name.clone();
    }
    if let Some(children) = new.children_mut() {
        let incoming = std::mem::take(children);
        *children = merge_lists(old.children(), old.children(), incoming, cx);
    }
    new
}

/// The elements of a slide after a new version: the new version's, each with the identity of the
/// old element it is, in the new version's order; then the old elements the file could not have
/// held on to, where they were. `expanded` is `old` with composites written out as their parts,
/// which is what a file has of them; a composite whose parts came back unchanged stays a composite.
pub fn merge_lists(
    old: &[Element],
    expanded: &[Element],
    incoming: Vec<Element>,
    cx: &mut Cx,
) -> Vec<Element> {
    let shown: &[Element] = if expanded.len() == old.len() {
        expanded
    } else {
        old
    };
    let mut matched: Vec<Option<usize>> = vec![None; incoming.len()];
    let mut used = vec![false; shown.len()];
    for pass in [strict, loose] {
        for (i, inc) in incoming.iter().enumerate() {
            if matched[i].is_some() {
                continue;
            }
            if let Some(j) = (0..shown.len()).find(|j| !used[*j] && pass(&shown[*j], inc)) {
                used[j] = true;
                matched[i] = Some(j);
            }
        }
    }
    let mut out: Vec<Element> = Vec::with_capacity(incoming.len());
    let mut origin: Vec<Option<usize>> = Vec::with_capacity(incoming.len());
    for (i, inc) in incoming.into_iter().enumerate() {
        match matched[i] {
            Some(j) => {
                let composite = old.len() == shown.len() && old[j].kind() != shown[j].kind();
                let unchanged = composite && strict(&shown[j], &inc);
                if unchanged {
                    // Its parts came back as they went: the composite is what they are.
                    cx.renamed
                        .insert(inc.id().to_owned(), old[j].id().to_owned());
                    cx.taken.insert(old[j].id().to_owned());
                    out.push(old[j].clone());
                } else {
                    out.push(carry(&old[j], inc, cx));
                }
                origin.push(Some(j));
            }
            None => {
                let mut inc = inc;
                fresh(&mut inc, cx);
                out.push(inc);
                origin.push(None);
            }
        }
    }
    // Old elements the new version cannot have had: empty slots (a file leaves them out) and locked
    // layout shapes. They stay in their place, after the element that was before them.
    for j in 0..old.len() {
        if used[j] || !(is_empty_slot(&old[j]) || old[j].base().locked) {
            continue;
        }
        let before = (0..j)
            .rev()
            .find_map(|p| origin.iter().position(|o| *o == Some(p)));
        let at = before.map_or(0, |p| p + 1);
        cx.taken.insert(old[j].id().to_owned());
        out.insert(at, old[j].clone());
        origin.insert(at, Some(j));
    }
    out
}

/// Points connectors at the elements the new version's ids stand for now.
pub fn re_anchor(list: &mut [Element], renamed: &HashMap<String, String>) {
    for e in list {
        if let Element::Connector(c) = e {
            for anchor in [&mut c.from, &mut c.to].into_iter().flatten() {
                if let Some(id) = renamed.get(&anchor.el) {
                    anchor.el = id.clone();
                }
            }
        }
        if let Some(children) = e.children_mut() {
            re_anchor(children, renamed);
        }
    }
}
