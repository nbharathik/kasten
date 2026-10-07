//! Composite elements: things built from primitives. Each has its own few
//! fields and an `expand()` (see `crate::composites`) that turns it into plain
//! text, shapes, lines and pictures. The editor, present mode and the PowerPoint
//! export all draw the expansion, so they always look the same.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{Base, Extra, is_false};

model! {
    #[serde(rename_all = "camelCase")]
    pub enum CodeTheme {
        Dark,
        Light,
    }

    /// Code with syntax colours, optionally walked through a few lines at a time.
    #[serde(rename_all = "camelCase")]
    pub struct CodeEl {
        #[serde(flatten)]
        pub base: Base,
        /// A language name or file extension: `python`, `rust`, `ts`; `text` for none.
        #[serde(default)]
        pub language: String,
        pub code: String,
        /// `dark` (the default) or `light` colours for the block.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub theme: Option<CodeTheme>,
        #[serde(default, skip_serializing_if = "is_false")]
        pub line_numbers: bool,
        /// The number the first line is given, for an excerpt of a longer file. 1 when absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub first_line: Option<u32>,
        /// One entry per step: the lines in focus, such as `"1"`, `"2-3"` or `"4,6-10"`. The other lines are dimmed at that step.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        pub focus: Vec<String>,
        /// Points; the theme's code size when absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub font_size: Option<f64>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// A formula, drawn by KaTeX.
    #[serde(rename_all = "camelCase")]
    pub struct MathEl {
        #[serde(flatten)]
        pub base: Base,
        /// LaTeX, without the surrounding `$`.
        pub latex: String,
        /// Set in a line of its own and larger, the default; inline is smaller and tighter.
        #[serde(default, skip_serializing_if = "is_false")]
        pub inline: bool,
        /// A colour token or hex value; the text colour when absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub color: Option<String>,
        /// Points; 32 when absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub font_size: Option<f64>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    #[serde(rename_all = "camelCase")]
    pub enum ChatRole {
        System,
        User,
        Assistant,
        ToolCall,
        ToolResult,
    }

    #[serde(rename_all = "camelCase")]
    pub struct ChatMessage {
        pub role: ChatRole,
        pub text: String,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// A conversation with a model: one bubble for each message.
    #[serde(rename_all = "camelCase")]
    pub struct ChatEl {
        #[serde(flatten)]
        pub base: Base,
        pub messages: Vec<ChatMessage>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// A token the model might write next, and how likely.
    #[serde(rename_all = "camelCase")]
    pub struct NextToken {
        pub token: String,
        /// 0 to 1.
        pub p: f64,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// The text so far as token chips, and a bar for each likely next token.
    #[serde(rename_all = "camelCase")]
    pub struct TokenProbsEl {
        #[serde(flatten)]
        pub base: Base,
        /// The tokens already written, in order.
        #[serde(default)]
        pub tokens: Vec<String>,
        pub next: Vec<NextToken>,
        /// The index in `next` of the token that was picked, drawn highlighted.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub chosen: Option<u32>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    #[serde(rename_all = "camelCase")]
    pub struct Card {
        pub title: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub body: Option<String>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// Cards in a grid, each a heading and a line.
    #[serde(rename_all = "camelCase")]
    pub struct CardGridEl {
        #[serde(flatten)]
        pub base: Base,
        pub cards: Vec<Card>,
        /// How many cards to a row; chosen from the number of cards when absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub columns: Option<u32>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    #[serde(rename_all = "camelCase")]
    pub enum CitationStyle {
        /// `(Vaswani et al., 2017)`
        Short,
        /// The whole reference.
        Full,
        /// `[1]`
        Numbered,
        /// A list of the whole references, one to a line.
        List,
    }

    /// One or more references, by their BibTeX keys. (`format` names how they are written; `style` is the element's looks, as for every element.)
    #[serde(rename_all = "camelCase")]
    pub struct CitationEl {
        #[serde(flatten)]
        pub base: Base,
        pub keys: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub format: Option<CitationStyle>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// "Step n / N", kept up to date as the slide is stepped through.
    #[serde(rename_all = "camelCase")]
    pub struct StepLabelEl {
        #[serde(flatten)]
        pub base: Base,
        /// `{n}` and `{total}` are replaced; the deck's own wording when absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub format: Option<String>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// A live web page or local app, shown in present mode; a picture and a link elsewhere.
    #[serde(rename_all = "camelCase")]
    pub struct EmbedEl {
        #[serde(flatten)]
        pub base: Base,
        pub url: String,
        /// An image in the host's image store, shown where the page cannot be.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub poster: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub title: Option<String>,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }

    /// A video file the host holds, with a still to show until it plays.
    #[serde(rename_all = "camelCase")]
    pub struct VideoEl {
        #[serde(flatten)]
        pub base: Base,
        /// A file in the host's store.
        pub src: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub poster: Option<String>,
        #[serde(default, skip_serializing_if = "is_false")]
        pub autoplay: bool,
        #[serde(default, skip_serializing_if = "is_false")]
        pub looped: bool,
        #[serde(flatten, default, skip_serializing_if = "Extra::is_empty")]
        #[ts(skip)]
        #[schemars(skip)]
        pub extra: Extra,
    }
}
