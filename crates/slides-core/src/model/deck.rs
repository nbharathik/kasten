//! The deck: its slides in order, and what belongs to the deck as a whole.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{Effect, Element, Extra, Theme, is_false, is_zero};

model! {
    /// Width and height in slide units (1/96 inch).
    #[serde(rename_all = "camelCase")]
    pub struct Size {
        pub w: f64,
        pub h: f64,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    #[serde(rename_all = "camelCase")]
    pub enum TransitionKind {
        None,
        Fade,
        Slide,
        Morph,
    }

    /// How a slide arrives.
    #[serde(rename_all = "camelCase")]
    pub struct Transition {
        pub kind: TransitionKind,
        /// Seconds; 0.6 for a morph when absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub duration: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub easing: Option<String>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// What fills a slide behind its elements.
    #[serde(rename_all = "camelCase")]
    pub struct Background {
        /// A colour token or hex value.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub color: Option<String>,
        /// A file in the host's image store, stretched to cover.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub image: Option<String>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// A named stretch of the deck, from one slide to the next section.
    #[serde(rename_all = "camelCase")]
    pub struct Section {
        pub title: String,
        pub starts_at: String,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// Settings for presenting the whole deck.
    #[serde(rename_all = "camelCase")]
    pub struct Present {
        pub slide_numbers: bool,
        /// What the step label says; `{n}` and `{total}` are replaced.
        pub step_label: String,
        /// The transition of a slide that names none.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub transition: Option<Transition>,
        /// How a change of state is drawn when an element names none.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub effect: Option<Effect>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    #[serde(rename_all = "camelCase")]
    pub struct Slide {
        /// Unique in the deck, and never reused.
        pub id: String,
        /// The name of a layout in the deck's theme.
        pub layout: String,
        #[serde(default, skip_serializing_if = "is_false")]
        pub hidden: bool,
        /// Stacked under the slide above it: skipped unless the presenter goes down.
        #[serde(default, skip_serializing_if = "is_false")]
        pub backup: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub transition: Option<Transition>,
        /// Clicks on the slide after it appears; 0 for none.
        #[serde(default, skip_serializing_if = "is_zero")]
        pub steps: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub background: Option<Background>,
        /// Speaker notes, in Markdown.
        #[serde(default, skip_serializing_if = "String::is_empty")]
        pub notes: String,
        /// Bottom to top.
        pub elements: Vec<Element>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// A deck: what a `.deck` file holds.
    #[serde(rename_all = "camelCase")]
    pub struct Deck {
        /// Always `kasten-deck`.
        pub format: String,
        pub format_version: u32,
        /// `d-` and random characters.
        pub id: String,
        pub title: String,
        pub size: Size,
        pub theme: Theme,
        pub slides: Vec<Slide>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub sections: Vec<Section>,
        pub present: Present,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }
}

/// The value of `Deck::format`.
pub const FORMAT_NAME: &str = "kasten-deck";

impl Default for Present {
    fn default() -> Self {
        Present {
            slide_numbers: true,
            step_label: "Step {n} / {total}".to_owned(),
            transition: None,
            effect: None,
            extra: Extra::new(),
        }
    }
}

impl Slide {
    pub fn new(id: impl Into<String>, layout: impl Into<String>) -> Slide {
        Slide {
            id: id.into(),
            layout: layout.into(),
            hidden: false,
            backup: false,
            transition: None,
            steps: 0,
            background: None,
            notes: String::new(),
            elements: Vec::new(),
            extra: Extra::new(),
        }
    }

    /// The element with `id`, looking inside groups.
    pub fn element(&self, id: &str) -> Option<&Element> {
        find(&self.elements, id)
    }

    pub fn element_mut(&mut self, id: &str) -> Option<&mut Element> {
        find_mut(&mut self.elements, id)
    }
}

fn find<'a>(list: &'a [Element], id: &str) -> Option<&'a Element> {
    for e in list {
        if e.id() == id {
            return Some(e);
        }
        if let Some(found) = find(e.children(), id) {
            return Some(found);
        }
    }
    None
}

fn find_mut<'a>(list: &'a mut [Element], id: &str) -> Option<&'a mut Element> {
    for e in list {
        if e.id() == id {
            return Some(e);
        }
        if let Some(children) = e.children_mut()
            && let Some(found) = find_mut(children, id)
        {
            return Some(found);
        }
    }
    None
}

impl Deck {
    pub fn slide(&self, id: &str) -> Option<&Slide> {
        self.slides.iter().find(|s| s.id == id)
    }

    pub fn slide_mut(&mut self, id: &str) -> Option<&mut Slide> {
        self.slides.iter_mut().find(|s| s.id == id)
    }

    pub fn index_of(&self, id: &str) -> Option<usize> {
        self.slides.iter().position(|s| s.id == id)
    }
}
