// The text module: how words on a slide are drawn, and how they are edited.

export { TextBlock } from "./TextBlock.tsx";
export type { TextBlockProps, TextFields } from "./TextBlock.tsx";
export { TextEditor } from "./TextEditor.tsx";
export type { FormatState, TextEditorHandle, TextEditorProps, Tri } from "./TextEditor.tsx";
export { docToText, textToDoc } from "./convert.ts";
export { createTextSchema } from "./schema.ts";
export type { TextSchema } from "./schema.ts";
export { SIZE_STEPS, nextSize } from "./sizes.ts";
export { cssText, listNumbers, markerFor, paragraphCss, resolveStyle, runCss } from "./text-style.ts";
export type { ParagraphContext, ResolvedStyle } from "./text-style.ts";
export { BULLETS, DEFAULT_INSETS, DEFAULT_LINE_SPACING, LINE_BREAK, LIST_INDENT, LIST_STEP } from "./metrics.ts";
