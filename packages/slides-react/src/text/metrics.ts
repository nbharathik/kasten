// The measurements text is drawn with. The PPTX writer uses the same numbers,
// so a deck reads the same in the editor, when presenting and in PowerPoint.

/** Space between a box's edge and its text when the text names none: 0.1 in across, 0.05 in down. */
export const DEFAULT_INSETS = { left: 9.6, top: 4.8, right: 9.6, bottom: 4.8 } as const;

/** A list item's text starts this far in from the left inset; its marker hangs in that space. */
export const LIST_INDENT = 24;

/** Each list level moves this far further in. */
export const LIST_STEP = 24;

/** The line height as a multiple of the type size when a paragraph and its style name none. */
export const DEFAULT_LINE_SPACING = 1;

/** Bullet glyphs by list level; deeper levels start again. */
export const BULLETS = ["•", "–", "▪"] as const;

/** A line break inside a run. PowerPoint writes it as `<a:br/>`. */
export const LINE_BREAK = "\n";
