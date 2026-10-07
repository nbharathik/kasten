//! Text: paragraphs of runs. Runs, not Markdown, so colours and sizes per
//! word survive a trip through PPTX. Operations still accept Markdown, which
//! `crate::markdown` turns into these.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::Extra;

model! {
    #[serde(rename_all = "camelCase")]
    pub enum Align {
        Left,
        Center,
        Right,
        Justify,
    }

    #[serde(rename_all = "camelCase")]
    pub enum VAlign {
        Top,
        Middle,
        Bottom,
    }

    #[serde(rename_all = "camelCase")]
    pub enum ListKind {
        Bullet,
        Number,
    }

    /// Space between a box's edge and its text, in slide units.
    #[serde(rename_all = "camelCase")]
    pub struct Insets {
        pub left: f64,
        pub top: f64,
        pub right: f64,
        pub bottom: f64,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// A stretch of text with one look.
    #[serde(rename_all = "camelCase")]
    pub struct Run {
        /// The text.
        pub t: String,
        #[serde(default, skip_serializing_if = "is_false", rename = "b")]
        pub bold: bool,
        #[serde(default, skip_serializing_if = "is_false", rename = "i")]
        pub italic: bool,
        #[serde(default, skip_serializing_if = "is_false", rename = "u")]
        pub underline: bool,
        #[serde(default, skip_serializing_if = "is_false", rename = "s")]
        pub strike: bool,
        /// A theme token or `#rrggbb`; the paragraph's style when absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub color: Option<String>,
        /// Points.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub size: Option<f64>,
        /// `heading`, `body`, `code` or a family name.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub font: Option<String>,
        /// A web address, or `slide:<id>` for a link to a slide.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub link: Option<String>,
        /// Inline code: drawn in the code font.
        #[serde(default, skip_serializing_if = "is_false")]
        pub code: bool,
        /// Inline math: `t` is LaTeX.
        #[serde(default, skip_serializing_if = "is_false")]
        pub math: bool,
        /// A field the text stands for, such as `slideNumber`; `t` is its sample.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub field: Option<String>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// A paragraph: runs and how they are set.
    #[serde(rename_all = "camelCase")]
    pub struct Paragraph {
        pub runs: Vec<Run>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub align: Option<Align>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub list: Option<ListKind>,
        /// Indent level of a list item, from 0.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub level: Option<u8>,
        /// The theme text style the paragraph starts from: `title`,
        /// `subtitle`, `body`, `caption`, `code` or `citation`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub style: Option<String>,
        /// Points.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub space_before: Option<f64>,
        /// Points.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub space_after: Option<f64>,
        /// A multiple of the line height, such as 1.15.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub line_spacing: Option<f64>,
        /// The step at which this paragraph appears, for lists that build line by line.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub step: Option<u32>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// The text of a text box, a shape, a table cell or a label.
    #[serde(rename_all = "camelCase")]
    pub struct Text {
        pub paragraphs: Vec<Paragraph>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub valign: Option<VAlign>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub insets: Option<Insets>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }
}

fn is_false(b: &bool) -> bool {
    !*b
}

impl Run {
    pub fn plain(t: impl Into<String>) -> Run {
        Run {
            t: t.into(),
            bold: false,
            italic: false,
            underline: false,
            strike: false,
            color: None,
            size: None,
            font: None,
            link: None,
            code: false,
            math: false,
            field: None,
            extra: Extra::new(),
        }
    }
}

impl Paragraph {
    pub fn plain(t: impl Into<String>) -> Paragraph {
        Paragraph {
            runs: vec![Run::plain(t)],
            align: None,
            list: None,
            level: None,
            style: None,
            space_before: None,
            space_after: None,
            line_spacing: None,
            step: None,
            extra: Extra::new(),
        }
    }

    /// The paragraph's text without its looks.
    pub fn text(&self) -> String {
        self.runs.iter().map(|r| r.t.as_str()).collect()
    }
}

impl Text {
    pub fn plain(t: impl Into<String>) -> Text {
        Text {
            paragraphs: vec![Paragraph::plain(t)],
            valign: None,
            insets: None,
            extra: Extra::new(),
        }
    }

    pub fn from_paragraphs(paragraphs: Vec<Paragraph>) -> Text {
        Text {
            paragraphs,
            valign: None,
            insets: None,
            extra: Extra::new(),
        }
    }

    /// All the text, a paragraph per line.
    pub fn plain_text(&self) -> String {
        self.paragraphs
            .iter()
            .map(Paragraph::text)
            .collect::<Vec<_>>()
            .join("\n")
    }

    pub fn is_blank(&self) -> bool {
        self.paragraphs
            .iter()
            .all(|p| p.runs.iter().all(|r| r.t.is_empty()))
    }
}
