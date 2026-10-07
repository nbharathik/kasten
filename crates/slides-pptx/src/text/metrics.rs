//! The measurements text is set with. They are the numbers of the editor's own
//! text module (`packages/slides-react/src/text/metrics.ts`), in slide units
//! and points, so a line breaks in the same place in the editor and in the file.

use std::sync::LazyLock;

use slides_core::{Extra, Insets};

/// Space between a box's edge and its text when the text names none.
pub static DEFAULT_INSETS: LazyLock<Insets> = LazyLock::new(|| Insets {
    left: 9.6,
    top: 4.8,
    right: 9.6,
    bottom: 4.8,
    extra: Extra::new(),
});

/// A list item's text starts this far in from the left inset; its marker hangs in that space.
pub const LIST_INDENT: f64 = 24.0;

/// Each list level moves this far further in.
pub const LIST_STEP: f64 = 24.0;

/// The line height as a multiple of the type size when a paragraph and its style name none.
pub const DEFAULT_LINE_SPACING: f64 = 1.0;

/// Bullet glyphs by list level; deeper levels start again.
pub const BULLETS: [&str; 3] = ["•", "–", "▪"];

/// The deepest list level PowerPoint and Google Slides offer.
pub const MAX_LEVEL: usize = 8;
