// Typing `- ` or `* ` at the start of a paragraph makes a bullet item, and
// `1. ` a numbered one, as Markdown habits and Google Slides do.

import { closeHistory } from "prosemirror-history";
import type { EditorState, Transaction } from "prosemirror-state";

import { attrsOf } from "./schema.ts";

const BULLET = /^[-*•]$/;
const NUMBER = /^\d+\.$/;

/**
 * The change a space typed at `from` makes: the marker typed before it is
 * removed and the paragraph becomes a list item. It is its own step of local
 * undo, so undoing it gives the marker back. Null when the space is just a space.
 */
export function listRule(state: EditorState, from: number, to: number, text: string): Transaction | null {
  if (text !== " " || from !== to) return null;
  const $from = state.doc.resolve(from);
  const paragraph = $from.parent;
  if (paragraph.type.name !== "paragraph" || attrsOf(paragraph).list) return null;
  const typed = paragraph.textBetween(0, $from.parentOffset);
  const kind = BULLET.test(typed) ? "bullet" : NUMBER.test(typed) ? "number" : null;
  if (!kind) return null;
  const tr = closeHistory(state.tr);
  tr.delete($from.start(), from);
  tr.setNodeMarkup($from.before(), undefined, { ...paragraph.attrs, list: kind });
  return tr;
}
