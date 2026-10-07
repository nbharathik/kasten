// What is selected, in the terms the formatting commands and the toolbar
// state need: the text pieces, the paragraphs, and the marks at the caret.

import type { TextStyle, Theme } from "@kasten-slides/wasm";
import type { Mark, MarkType, Node as PMNode, ResolvedPos } from "prosemirror-model";
import { type EditorState, Selection, TextSelection } from "prosemirror-state";

import { attrsOf } from "./schema.ts";
import { textStyleOf } from "./text-style.ts";

/** What the commands need to know about the box being edited. */
export interface EditorContext {
  theme: Theme;
  baseStyle: string;
}

/** A stretch of text inside the selection, and the paragraph it is in. */
export interface Piece {
  text: PMNode;
  paragraph: PMNode;
}

/** A paragraph inside the selection, and where it starts. */
export interface Located {
  node: PMNode;
  pos: number;
}

/** The text style a paragraph node is set in. */
export const styleOfNode = (ctx: EditorContext, node: PMNode): TextStyle => textStyleOf(ctx.theme, ctx.baseStyle, { style: attrsOf(node).style });

/** The stretches of text inside a range selection; none for a caret. */
export function selectedPieces(state: EditorState): Piece[] {
  const pieces: Piece[] = [];
  for (const { $from, $to } of state.selection.ranges) {
    if ($from.pos === $to.pos) continue;
    state.doc.nodesBetween($from.pos, $to.pos, (node, _pos, parent) => {
      if (node.isText && parent) pieces.push({ text: node, paragraph: parent });
      return true;
    });
  }
  return pieces;
}

/** The paragraphs the selection touches, in order. A caret touches the one it is in. */
export function selectedParagraphs(state: EditorState): Located[] {
  const found: Located[] = [];
  const seen = new Set<number>();
  for (const { $from, $to } of state.selection.ranges) {
    if ($from.pos === $to.pos && $from.depth >= 1) {
      const pos = $from.before(1);
      if (!seen.has(pos)) found.push({ node: $from.node(1), pos });
      seen.add(pos);
      continue;
    }
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (node.type.name === "paragraph" && !seen.has(pos)) {
        seen.add(pos);
        found.push({ node, pos });
      }
      return false;
    });
  }
  return found;
}

/** The marks new text would get at the caret: the ones set aside by a command, else the ones around it. */
export const caretMarks = (state: EditorState): readonly Mark[] => state.storedMarks ?? state.selection.$from.marks();

/** The marks of the first stretch of text in the selection, or the caret's when there is none. */
export function marksAtStart(state: EditorState): readonly Mark[] {
  if (state.selection.empty) return caretMarks(state);
  return selectedPieces(state)[0]?.text.marks ?? caretMarks(state);
}

/** The extent of the run of text around a position that carries a mark of a type, if the position is in or touches one. */
export function markRange($pos: ResolvedPos, type: MarkType): { from: number; to: number; mark: Mark } | null {
  const start = $pos.start();
  const spans: { from: number; to: number; mark: Mark }[] = [];
  $pos.parent.forEach((child, offset) => {
    const mark = child.isText ? type.isInSet(child.marks) : undefined;
    if (!mark) return;
    const from = start + offset;
    const last = spans[spans.length - 1];
    if (last && last.to === from && last.mark.eq(mark)) last.to = from + child.nodeSize;
    else spans.push({ from, to: from + child.nodeSize, mark });
  });
  return spans.find((span) => span.from <= $pos.pos && $pos.pos <= span.to) ?? null;
}

/**
 * A selection of all the words, from the start of the first paragraph to the
 * end of the last. It is a range of text like any other, not ProseMirror's
 * "everything" selection, so replacing it keeps the settings of the first
 * paragraph (a placeholder stays a list) as replacing any range does.
 */
export function wholeText(state: EditorState): Selection {
  const { doc } = state;
  return TextSelection.create(doc, Selection.atStart(doc).from, Selection.atEnd(doc).to);
}
