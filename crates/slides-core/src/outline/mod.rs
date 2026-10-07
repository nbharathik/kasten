//! A deck as a Markdown outline, and back.
//!
//! ```text
//! # Deck title
//!
//! ## Slide title <!-- layout: two-columns, hidden, backup -->
//! - a bullet
//! - another
//!
//! Second block for the second slot
//!
//! Notes:
//! Speaker notes in Markdown, until the next slide.
//! ```
//!
//! The first `#` line names the deck and every `##` line starts a slide. A
//! comment at the end of that line may give the layout and say the slide is
//! `hidden` or a `backup`. What follows is blocks of Markdown, separated by
//! blank lines (a fenced block is one block), and, after a line that is only
//! `Notes:`, the speaker notes up to the next slide. Text before the first
//! slide is ignored.
//!
//! [`outline_of`] titles a slide with the text in its `title` slot, else its
//! first text, else the name of its layout. Every other text is a block, a
//! picture is `![alt](src)`, a table is a pipe table, and whatever else is on
//! the slide is counted in a comment. Headings become plain paragraphs, so
//! that no line in a block starts a slide. [`parse_outline`] reads that back.

use crate::model::Paragraph;

mod parse;
mod render;

#[cfg(test)]
mod tests;

pub use parse::parse_outline;
pub use render::outline_of;

/// A slide as an outline gives it.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct OutlineSlide {
    /// The words of its heading, without Markdown.
    pub title: String,
    /// The blocks after the heading, each as the paragraphs Markdown makes.
    pub blocks: Vec<Vec<Paragraph>>,
    /// The speaker notes, in Markdown.
    pub notes: String,
    pub hidden: bool,
    pub backup: bool,
    /// The layout its heading names, if it names one.
    pub layout: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct Outline {
    pub title: String,
    pub slides: Vec<OutlineSlide>,
}
