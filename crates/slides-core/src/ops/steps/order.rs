//! Reading order, what a slide's steps ask for, and the words an element holds.

use crate::composites::steps_needed;
use crate::model::{Element, Slide, Text, Theme};
use crate::resolve::{Rect, box_in};

/// How far outside a box the middle of a thinner one may be and still share its row.
const SLACK: f64 = 6.0;

fn middle(r: &Rect) -> f64 {
    r.y + r.h / 2.0
}

/// Whether two boxes share a row: the middle of the thinner one lies within the extent of
/// the other. Boxes a little out of line read across; a line between two boxes is no height
/// at all and lies in their row; a tall picture and a short box that start together share one.
fn on_one_row(a: &Rect, b: &Rect) -> bool {
    let (tall, thin) = if a.h >= b.h { (a, b) } else { (b, a) };
    (tall.y - SLACK..=tall.y + tall.h + SLACK).contains(&middle(thin))
}

/// The places of boxes in reading order, as indices into `boxes`: rows from top to bottom,
/// and each row from left to right. A row starts with the topmost box left and holds the
/// ones level with it (see `on_one_row`), so a diagram of boxes of different heights reads
/// across. A `None` (an element with no box) comes last, in the order given.
pub fn order_of(boxes: &[Option<Rect>]) -> Vec<usize> {
    let mut placed: Vec<(usize, Rect)> = boxes
        .iter()
        .enumerate()
        .filter_map(|(index, rect)| rect.map(|rect| (index, rect)))
        .collect();
    placed.sort_by(|a, b| a.1.y.total_cmp(&b.1.y).then(a.0.cmp(&b.0)));
    let mut rows: Vec<Vec<(usize, Rect)>> = Vec::new();
    for item in placed {
        match rows.last_mut() {
            Some(row) if on_one_row(&row[0].1, &item.1) => row.push(item),
            _ => rows.push(vec![item]),
        }
    }
    let mut ordered = Vec::with_capacity(boxes.len());
    for mut row in rows {
        row.sort_by(|a, b| {
            a.1.x
                .total_cmp(&b.1.x)
                .then(middle(&a.1).total_cmp(&middle(&b.1)))
                .then(a.0.cmp(&b.0))
        });
        ordered.extend(row.into_iter().map(|(index, _)| index));
    }
    ordered.extend(
        boxes
            .iter()
            .enumerate()
            .filter(|(_, rect)| rect.is_none())
            .map(|(index, _)| index),
    );
    ordered
}

/// The elements in reading order (see `order_of`). An element has a box of its own or from
/// the slot of its layout; one with neither comes last.
pub fn reading_order<'a>(
    theme: &Theme,
    layout: &str,
    elements: impl IntoIterator<Item = &'a Element>,
) -> Vec<&'a Element> {
    let held: Vec<&'a Element> = elements.into_iter().collect();
    let boxes: Vec<Option<Rect>> = held
        .iter()
        .map(|element| box_in(theme, layout, element))
        .collect();
    order_of(&boxes).into_iter().map(|at| held[at]).collect()
}

/// Every text an element holds itself: its words, a connector's label, the cells of a table.
/// What a group holds is not counted; the group's children are elements of their own.
pub(super) fn texts(element: &Element) -> Vec<&Text> {
    match element {
        Element::Text(e) => vec![&e.text],
        Element::Shape(e) => e.text.iter().collect(),
        Element::Connector(e) => e.label.iter().collect(),
        Element::Table(e) => e
            .rows
            .iter()
            .flat_map(|row| row.cells.iter().map(|cell| &cell.text))
            .collect(),
        _ => Vec::new(),
    }
}

pub(super) fn texts_mut(element: &mut Element) -> Vec<&mut Text> {
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

fn used_by(element: &Element) -> u32 {
    let states = element.base().step_states.keys().next_back().copied();
    let words = texts(element)
        .into_iter()
        .flat_map(|text| text.paragraphs.iter())
        .filter_map(|paragraph| paragraph.step)
        .max();
    let inside = element.children().iter().map(used_by).max();
    [states, words, inside]
        .into_iter()
        .flatten()
        .max()
        .unwrap_or(0)
}

fn asked_by(element: &Element) -> u32 {
    let inside = element.children().iter().map(asked_by).max().unwrap_or(0);
    steps_needed(element).max(inside)
}

/// The element of the slide that asks for the most steps of its own, with how many (a code
/// block with three lines in focus asks for three), or None when none asks for any.
pub fn most_demanding(slide: &Slide) -> Option<(&Element, u32)> {
    fn walk<'a>(list: &'a [Element], best: &mut Option<(&'a Element, u32)>) {
        for element in list {
            let need = steps_needed(element);
            if need > 0 && best.is_none_or(|(_, most)| need > most) {
                *best = Some((element, need));
            }
            walk(element.children(), best);
        }
    }
    let mut best = None;
    walk(&slide.elements, &mut best);
    best
}

/// The highest step any element of the slide, or any paragraph of one, names: what the
/// slide's `steps` has to be at least for every change to happen.
pub fn steps_in_use(slide: &Slide) -> u32 {
    slide.elements.iter().map(used_by).max().unwrap_or(0)
}

/// The steps a slide needs: those in use, and those its composites ask for (a code
/// block with three lines in focus needs three).
pub fn steps_required(slide: &Slide) -> u32 {
    let composites = slide.elements.iter().map(asked_by).max().unwrap_or(0);
    steps_in_use(slide).max(composites)
}
