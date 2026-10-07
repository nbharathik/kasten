//! How an element looks: fill, outline, corner radius, shadow, opacity and
//! arrowheads. Colours are a theme token (`text1`, `bg2`, `accent3`, ...) or
//! a hex value (`#1a73e8`), so a deck follows its theme when the theme
//! changes and still allows a colour of its own.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::Extra;

model! {
    /// A solid fill.
    #[serde(rename_all = "camelCase")]
    pub struct Fill {
        /// A theme token or `#rrggbb`.
        pub color: String,
        /// 0 (clear) to 1 (solid); solid when absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub alpha: Option<f64>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// An outline.
    #[serde(rename_all = "camelCase")]
    pub struct Stroke {
        pub color: String,
        /// In slide units (1/96 inch).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub width: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub dash: Option<Dash>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub alpha: Option<f64>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    #[serde(rename_all = "camelCase")]
    pub enum Dash {
        Solid,
        Dash,
        Dot,
        DashDot,
        LongDash,
    }

    #[serde(rename_all = "camelCase")]
    pub enum Arrow {
        None,
        Triangle,
        Stealth,
        Open,
        Oval,
        Diamond,
    }

    /// A soft shadow behind an element.
    #[serde(rename_all = "camelCase")]
    pub struct Shadow {
        pub color: String,
        pub blur: f64,
        pub dx: f64,
        pub dy: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub alpha: Option<f64>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// Everything about an element's looks that is not its text.
    #[serde(rename_all = "camelCase")]
    pub struct Style {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub fill: Option<Fill>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub stroke: Option<Stroke>,
        /// Corner radius of a rounded shape, in slide units.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub radius: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub shadow: Option<Shadow>,
        /// 0 (clear) to 1 (solid) for the whole element.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub opacity: Option<f64>,
        /// Arrowhead at a line's start.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub start_arrow: Option<Arrow>,
        /// Arrowhead at a line's end.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub end_arrow: Option<Arrow>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }
}

impl Style {
    pub fn is_empty(&self) -> bool {
        self == &Style::default()
    }
}

impl Default for Style {
    fn default() -> Self {
        Style {
            fill: None,
            stroke: None,
            radius: None,
            shadow: None,
            opacity: None,
            start_arrow: None,
            end_arrow: None,
            extra: Extra::new(),
        }
    }
}
