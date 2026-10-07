// Commands that shape paragraphs: alignment, lists, indent, line spacing,
// and what Enter, Shift-Enter and Backspace do at the edges of a paragraph.

import type { Align, ListKind } from "@kasten-slides/wasm";

import { MAX_LEVEL, levelOf } from "./lists.ts";
import { LINE_BREAK } from "./metrics.ts";
import type { Command } from "./mark-commands.ts";
import type { ParagraphAttrs } from "./paragraph-attrs.ts";
import { attrsOf } from "./schema.ts";
import { selectedParagraphs } from "./selection-info.ts";

/** Changes the settings of every paragraph the selection touches. */
function withParagraphs(change: (attrs: ParagraphAttrs) => Partial<ParagraphAttrs>): Command {
  return (state, dispatch) => {
    const paragraphs = selectedParagraphs(state);
    if (paragraphs.length === 0) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const { node, pos } of paragraphs) {
        const attrs = attrsOf(node);
        tr.setNodeMarkup(pos, undefined, { ...attrs, ...change(attrs) });
      }
      dispatch(tr);
    }
    return true;
  };
}

export const setAlign = (align: Align): Command => withParagraphs(() => ({ align }));

/** A multiple of the line height, or null for the text style's own. */
export const setLineSpacing = (value: number | null): Command => withParagraphs(() => ({ lineSpacing: value }));

/** Makes the selected paragraphs a list of `kind`, or plain paragraphs if they all are one already. */
export function toggleList(kind: ListKind): Command {
  return (state, dispatch) => {
    const all = selectedParagraphs(state).every(({ node }) => attrsOf(node).list === kind);
    return withParagraphs(() => (all ? { list: null, level: null } : { list: kind }))(state, dispatch);
  };
}

/** Moves the selected paragraphs one level in or out, within the nine levels there are. The key is taken even at the end of the range, so it never moves focus away. */
export function indent(delta: 1 | -1): Command {
  return (state, dispatch) => {
    const paragraphs = selectedParagraphs(state);
    if (paragraphs.length === 0) return false;
    const moved = paragraphs.some(({ node }) => {
      const level = levelOf(attrsOf(node));
      return Math.min(MAX_LEVEL, Math.max(0, level + delta)) !== level;
    });
    if (!moved) return true;
    return withParagraphs((attrs) => {
      const level = Math.min(MAX_LEVEL, Math.max(0, levelOf(attrs) + delta));
      return { level: level === 0 ? null : level };
    })(state, dispatch);
  };
}

/**
 * Enter: splits the paragraph, and the new one is set like the old, so a list
 * goes on. Text typed there carries on the formatting at the caret. In an
 * empty list item it ends the list instead.
 */
export const enter: Command = (state, dispatch) => {
  const { selection } = state;
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return false;
  const { $from } = selection;
  if (selection.empty && $from.parent.content.size === 0 && attrsOf($from.parent).list) {
    dispatch?.(state.tr.setNodeMarkup($from.before(), undefined, { ...$from.parent.attrs, list: null, level: null }));
    return true;
  }
  if (!dispatch) return true;
  const marks = state.storedMarks ?? $from.marks();
  const tr = state.tr;
  if (!selection.empty) tr.deleteSelection();
  const pos = tr.selection.from;
  tr.split(pos, 1, [{ type: paragraph, attrs: tr.doc.resolve(pos).parent.attrs }]);
  tr.ensureMarks(marks);
  dispatch(tr);
  return true;
};

/** Shift-Enter: a line break inside the paragraph, which is a `LINE_BREAK` in the text. */
export const softBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.insertText(LINE_BREAK));
  return true;
};

/** Backspace at the start of a list item takes the bullet or number away first. */
export const backspaceListStart: Command = (state, dispatch) => {
  const { selection } = state;
  const { $from } = selection;
  if (!selection.empty || $from.parentOffset !== 0 || !attrsOf($from.parent).list) return false;
  dispatch?.(state.tr.setNodeMarkup($from.before(), undefined, { ...$from.parent.attrs, list: null, level: null }));
  return true;
};
