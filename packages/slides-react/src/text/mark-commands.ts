// Commands that format the words: bold and the other switches, and the
// settings that carry a value (colour, size, font, link). With a range
// selected they change the text; with a caret they set aside marks for the
// next words typed, as Google Slides does.

import type { TextStyle } from "@kasten-slides/wasm";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";

import { formatStateOf } from "./format-state.ts";
import { MARK_ATTR } from "./marks.ts";
import { NO_ATTRS } from "./paragraph-attrs.ts";
import { type EditorContext, markRange, marksAtStart, selectedParagraphs, styleOfNode } from "./selection-info.ts";
import { attrsOf } from "./schema.ts";
import { nextSize } from "./sizes.ts";

export type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

export type Flag = "bold" | "italic" | "underline" | "strike" | "code";
export type ValueMark = "color" | "size" | "font" | "link";

/** The non-empty ranges of the selection. */
function ranges(state: EditorState): { from: number; to: number }[] {
  return state.selection.ranges.map(({ $from, $to }) => ({ from: $from.pos, to: $to.pos })).filter(({ from, to }) => from < to);
}

/**
 * Turns a switch on for all the selected text, or off when it is already on
 * for all of it. A selection that is partly on is turned on.
 */
export function toggleFlag(flag: Flag, ctx: EditorContext): Command {
  return (state, dispatch) => {
    const type = state.schema.marks[flag];
    if (!type) return false;
    const on = formatStateOf(state, ctx)[flag] === true;
    if (!dispatch) return true;
    const tr = state.tr;
    if (state.selection.empty) {
      if (on) tr.removeStoredMark(type);
      else tr.addStoredMark(type.create());
    } else {
      for (const { from, to } of ranges(state)) {
        if (on) tr.removeMark(from, to, type);
        else tr.addMark(from, to, type.create());
      }
    }
    dispatch(tr);
    return true;
  };
}

/** Sets a colour, size, font or link for the selected text, or takes it away with null. */
export function setValueMark(name: ValueMark, value: string | number | null): Command {
  return (state, dispatch) => {
    const type = state.schema.marks[name];
    if (!type) return false;
    if (!dispatch) return true;
    const mark = value === null ? null : type.create({ [MARK_ATTR[name]]: value });
    const tr = state.tr;
    if (state.selection.empty) {
      tr.removeStoredMark(type);
      if (mark) tr.addStoredMark(mark);
    } else {
      for (const { from, to } of ranges(state)) {
        tr.removeMark(from, to, type);
        if (mark) tr.addMark(from, to, mark);
      }
    }
    dispatch(tr);
    return true;
  };
}

/**
 * Makes the selected text a link to `href`, or takes the link away with null.
 * A caret in a link changes the whole link; a caret elsewhere puts the
 * address in as text, linked.
 */
export function setLink(href: string | null): Command {
  return (state, dispatch) => {
    const type = state.schema.marks.link;
    if (!type) return false;
    if (!state.selection.empty) return setValueMark("link", href)(state, dispatch);
    const { $from } = state.selection;
    const range = markRange($from, type);
    if (!range && href === null) return true;
    if (!dispatch) return true;
    const tr = state.tr;
    if (range) {
      tr.removeMark(range.from, range.to, type);
      if (href !== null) tr.addMark(range.from, range.to, type.create({ href }));
    } else if (href !== null) {
      tr.replaceSelectionWith(state.schema.text(href, type.create({ href }).addToSet($from.marks())), false);
    }
    dispatch(tr);
    return true;
  };
}

/** The size, in points, of the text at the start of the selection: its own, else its text style's. */
export function sizeAtStart(state: EditorState, ctx: EditorContext): number {
  const own: unknown = marksAtStart(state).find((mark) => mark.type.name === "size")?.attrs.value;
  if (typeof own === "number" && own > 0) return own;
  const first: PMNode | undefined = selectedParagraphs(state)[0]?.node;
  const style: TextStyle | undefined = first ? styleOfNode(ctx, first) : undefined;
  return style?.size ?? ctx.theme.textStyles[ctx.baseStyle]?.size ?? ctx.theme.textStyles.body?.size ?? 18;
}

/** Steps the size of the selected text along the list of sizes, from the size the selection starts with. */
export function stepFontSize(delta: number, ctx: EditorContext): Command {
  return (state, dispatch) => {
    const current = sizeAtStart(state, ctx);
    const next = nextSize(current, delta);
    if (next === current) return true;
    return setValueMark("size", next)(state, dispatch);
  };
}

const CHARACTER_MARKS = ["bold", "italic", "underline", "strike", "color", "size", "font", "code"] as const;

/**
 * Takes off what was applied to the selected text (bold, italic, underline,
 * strike, colour, size, font, code) and to its paragraphs (alignment,
 * spacing, text style). Links, lists and levels stay. With only a caret it
 * clears the paragraph the caret is in.
 */
export const clearFormatting: Command = (state, dispatch) => {
  if (!dispatch) return true;
  const tr = state.tr;
  const paragraphs = selectedParagraphs(state);
  const spans = state.selection.empty ? paragraphs.map(({ node, pos }) => ({ from: pos + 1, to: pos + node.nodeSize - 1 })) : ranges(state);
  for (const name of CHARACTER_MARKS) {
    const type = state.schema.marks[name];
    if (!type) continue;
    if (state.selection.empty) tr.removeStoredMark(type);
    for (const { from, to } of spans) if (from < to) tr.removeMark(from, to, type);
  }
  for (const { node, pos } of paragraphs) {
    tr.setNodeMarkup(pos, undefined, { ...attrsOf(node), align: NO_ATTRS.align, lineSpacing: NO_ATTRS.lineSpacing, spaceBefore: NO_ATTRS.spaceBefore, spaceAfter: NO_ATTRS.spaceAfter, style: NO_ATTRS.style });
  }
  dispatch(tr);
  return true;
};
