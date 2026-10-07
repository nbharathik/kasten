//! Small helpers the operations share.

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::error::{Error, Result};
use crate::ids::{ELEMENT, IdGen};
use crate::model::{Deck, Element, Slide};

/// Two decimals: enough for a position, and short in the file.
pub fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

pub fn slide_mut<'a>(deck: &'a mut Deck, id: &str) -> Result<&'a mut Slide> {
    deck.slide_mut(id).ok_or_else(|| Error::no_slide(id))
}

pub fn element_mut<'a>(slide: &'a mut Slide, id: &str) -> Result<&'a mut Element> {
    let slide_id = slide.id.clone();
    slide
        .element_mut(id)
        .ok_or_else(|| Error::no_element(&slide_id, id))
}

/// Every id on a slide, inside groups too.
pub fn ids_on(slide: &Slide) -> HashSet<String> {
    let mut out = HashSet::new();
    collect_ids(&slide.elements, &mut out);
    out
}

/// Adds the id of each element in the list, and of each child of a group, to `out`.
pub fn collect_ids(list: &[Element], out: &mut HashSet<String>) {
    for e in list {
        out.insert(e.id().to_owned());
        collect_ids(e.children(), out);
    }
}

/// Where the element with `id` sits: an index into the slide's elements, then
/// one into each group's children on the way down.
pub fn path_of(list: &[Element], id: &str) -> Option<Vec<usize>> {
    for (i, e) in list.iter().enumerate() {
        if e.id() == id {
            return Some(vec![i]);
        }
        if let Some(mut rest) = path_of(e.children(), id) {
            rest.insert(0, i);
            return Some(rest);
        }
    }
    None
}

/// The list that directly holds the element at `path`.
pub fn parent_list<'a>(root: &'a mut Vec<Element>, path: &[usize]) -> Option<&'a mut Vec<Element>> {
    let mut list = root;
    for &i in path.get(..path.len().checked_sub(1)?)? {
        list = list.get_mut(i)?.children_mut()?;
    }
    Some(list)
}

/// Takes the element with `id` out of the slide, wherever it is.
pub fn remove_element(root: &mut Vec<Element>, id: &str) -> Option<Element> {
    let path = path_of(root, id)?;
    let index = *path.last()?;
    Some(parent_list(root, &path)?.remove(index))
}

/// RFC 7386: an object merges key by key, `null` removes a key, anything else replaces.
pub fn merge_patch(target: &mut Value, patch: &Value) {
    let Value::Object(changes) = patch else {
        *target = patch.clone();
        return;
    };
    if !target.is_object() {
        *target = Value::Object(serde_json::Map::new());
    }
    if let Value::Object(map) = target {
        for (key, change) in changes {
            if change.is_null() {
                map.remove(key);
            } else {
                merge_patch(map.entry(key.clone()).or_insert(Value::Null), change);
            }
        }
    }
}

/// Gives each element, and each child of a group, an id free on the slide.
/// With `keep`, an id that is free stays. Connectors that pointed at an
/// element renamed here point at its new id.
pub fn assign_ids(
    elements: &mut [Element],
    taken: &mut HashSet<String>,
    ids: &mut IdGen,
    keep: bool,
) {
    let mut renamed = HashMap::new();
    rename(elements, taken, ids, keep, &mut renamed);
    remap_anchors(elements, &renamed);
}

fn rename(
    list: &mut [Element],
    taken: &mut HashSet<String>,
    ids: &mut IdGen,
    keep: bool,
    renamed: &mut HashMap<String, String>,
) {
    for e in list {
        let old = e.id().to_owned();
        let id = if keep && !old.is_empty() && !taken.contains(&old) {
            old.clone()
        } else {
            ids.fresh(ELEMENT, |c| taken.contains(c))
        };
        taken.insert(id.clone());
        renamed.insert(old, id.clone());
        e.base_mut().id = id;
        if let Some(children) = e.children_mut() {
            rename(children, taken, ids, keep, renamed);
        }
    }
}

fn remap_anchors(list: &mut [Element], renamed: &HashMap<String, String>) {
    for e in list {
        if let Element::Connector(c) = e {
            for anchor in [&mut c.from, &mut c.to].into_iter().flatten() {
                if let Some(id) = renamed.get(&anchor.el) {
                    anchor.el = id.clone();
                }
            }
        }
        if let Some(children) = e.children_mut() {
            remap_anchors(children, renamed);
        }
    }
}

/// Runs `f` on every element, groups' children included.
pub fn each_mut(list: &mut [Element], f: &mut impl FnMut(&mut Element)) {
    for e in list {
        f(e);
        if let Some(children) = e.children_mut() {
            each_mut(children, f);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Base, GroupEl, Text};
    use serde_json::json;

    fn text(id: &str) -> Element {
        Element::text_el(Base::new(id), Text::plain("x"))
    }

    fn group(id: &str, children: Vec<Element>) -> Element {
        Element::Group(GroupEl {
            base: Base::new(id),
            children,
            extra: Default::default(),
        })
    }

    #[test]
    fn finds_a_path_through_groups_and_removes_by_id() {
        let mut list = vec![
            text("a"),
            group("g", vec![text("b"), group("h", vec![text("c")])]),
        ];
        assert_eq!(path_of(&list, "c"), Some(vec![1, 1, 0]));
        assert_eq!(path_of(&list, "nope"), None);
        assert_eq!(
            remove_element(&mut list, "c").map(|e| e.id().to_owned()),
            Some("c".to_owned())
        );
        assert_eq!(path_of(&list, "c"), None);
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn merge_patch_follows_rfc_7386() {
        let mut v = json!({"a": {"b": 1, "c": 2}, "d": 3});
        merge_patch(&mut v, &json!({"a": {"b": null, "e": 5}, "d": [1]}));
        assert_eq!(v, json!({"a": {"c": 2, "e": 5}, "d": [1]}));
    }

    #[test]
    fn assign_ids_keeps_free_ids_renews_taken_ones_and_follows_anchors() {
        use crate::model::{Anchor, ConnectorEl, Route, Side};
        let mut taken: HashSet<String> = ["a".to_owned()].into();
        let connector = Element::Connector(ConnectorEl {
            base: Base::new("k"),
            route: Route::Straight,
            from: Some(Anchor {
                el: "a".into(),
                side: Side::Right,
                extra: crate::model::Extra::new(),
            }),
            to: Some(Anchor {
                el: "z".into(),
                side: Side::Left,
                extra: crate::model::Extra::new(),
            }),
            label: None,
            extra: Default::default(),
        });
        let mut pasted = vec![text("a"), text("z"), connector];
        assign_ids(&mut pasted, &mut taken, &mut IdGen::new(1), true);
        assert_ne!(pasted[0].id(), "a");
        assert_eq!(pasted[1].id(), "z");
        let Element::Connector(c) = &pasted[2] else {
            panic!("a connector")
        };
        assert_eq!(c.from.as_ref().map(|a| a.el.as_str()), Some(pasted[0].id()));
        assert_eq!(c.to.as_ref().map(|a| a.el.as_str()), Some("z"));
    }
}
