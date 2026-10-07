//! Finding the slot of the layout that a placeholder on a slide fills, and
//! the master's slot behind it. A slide names its slot by kind and index;
//! the layout's slot of that index (or, failing that, of that kind) is it.

use crate::import::cx::Env;
use crate::import::dom::Node;
use crate::import::master::{PhClass, PhShape};
use crate::import::theme::master_ph;

/// The slots a placeholder inherits from.
pub struct PhMatch<'e> {
    pub class: PhClass,
    pub layout: Option<&'e PhShape>,
    pub master: Option<&'e PhShape>,
}

impl PhMatch<'_> {
    /// The role the layout gives the slot; None when the layout has no such slot.
    pub fn role(&self) -> Option<String> {
        self.layout.and_then(|l| l.role.clone())
    }

    /// The name of the text style the slot starts its text from.
    pub fn style(&self) -> String {
        match self.layout {
            Some(l) if !l.style.is_empty() => l.style.clone(),
            _ => match self.class {
                PhClass::Title => "title".to_owned(),
                _ => "body".to_owned(),
            },
        }
    }
}

pub fn find<'e>(env: &'e Env, layout: Option<usize>, ph: &Node) -> PhMatch<'e> {
    let class = PhClass::of(ph.attr("type").unwrap_or("obj"));
    let idx = ph.int("idx").and_then(|i| u32::try_from(i).ok());
    let layout_info = layout.and_then(|i| env.layouts.get(i));
    let slots = layout_info.map_or(&[][..], |l| l.placeholders.as_slice());
    let by_index = idx.and_then(|i| slots.iter().find(|s| s.idx == Some(i) && s.class == class));
    let by_class = || {
        slots.iter().find(|s| {
            s.class == class && (idx.is_none() || s.idx.is_none() || class != PhClass::Body)
        })
    };
    let found = by_index.or_else(by_class);
    let master = layout_info
        .and_then(|l| env.masters.get(l.master))
        .or_else(|| env.masters.first());
    PhMatch {
        class,
        layout: found,
        master: master.and_then(|m| master_ph(m, class)),
    }
}
