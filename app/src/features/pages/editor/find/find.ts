// Find and replace in a page: every place the text occurs is marked, one
// is the current, and replacing goes through one transaction, so Mod+Z
// undoes a whole "Replace all". Matching ignores case and never runs
// across a block's end or an inline node such as a page link.

import type { Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export interface Match {
  from: number;
  to: number;
}

interface FindState {
  query: string;
  /** Which match is the current one. */
  index: number;
  matches: Match[];
  decorations: DecorationSet;
}

/** Stands for an inline node that is not text, so no match spans it. */
const OBJECT = "￼";

/** Where `query` occurs in `doc`'s text, ignoring case. */
export function findMatches(doc: Node, query: string): Match[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const found: Match[] = [];
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true;
    // The block's text, and where in the document each of its characters is.
    let text = "";
    const at: number[] = [];
    block.forEach((child, offset) => {
      const start = blockPos + 1 + offset;
      const piece = child.isText ? child.text! : OBJECT;
      for (let i = 0; i < piece.length; i++) at.push(start + (child.isText ? i : 0));
      text += piece;
    });
    const hay = text.toLowerCase();
    // Lower-casing can change a string's length; then positions are unsure.
    if (hay.length !== text.length) return false;
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) {
      found.push({ from: at[i]!, to: at[i + needle.length - 1]! + 1 });
    }
    return false;
  });
  return found;
}

const key = new PluginKey<FindState>("KASTEN_FIND");

type Meta = { query?: string; index?: number };

function decorate(doc: Node, matches: Match[], index: number): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === index ? "kasten-find-match is-current" : "kasten-find-match" })),
  );
}

const EMPTY: FindState = { query: "", index: 0, matches: [], decorations: DecorationSet.empty };

export const findPlugin = $prose(
  () =>
    new Plugin<FindState>({
      key,
      state: {
        init: () => EMPTY,
        apply(tr, old) {
          const meta = tr.getMeta(key) as Meta | undefined;
          if (!meta && (!tr.docChanged || !old.query)) return old;
          const query = meta?.query ?? old.query;
          if (!query) return EMPTY;
          const matches = findMatches(tr.doc, query);
          const wanted = meta?.index ?? (meta?.query !== undefined ? 0 : old.index);
          const index = matches.length === 0 ? 0 : Math.min(Math.max(wanted, 0), matches.length - 1);
          return { query, index, matches, decorations: decorate(tr.doc, matches, index) };
        },
      },
      props: {
        decorations: (state) => key.getState(state)?.decorations,
      },
      view: (view) => ({ update: () => listeners.get(view)?.forEach((listener) => listener()) }),
    }),
);

const listeners = new WeakMap<EditorView, Set<() => void>>();

/** Calls `listener` after every change to the editor, until the returned
 * function is called: the find bar's count follows typing. */
export function onFindChange(view: EditorView, listener: () => void): () => void {
  const set = listeners.get(view) ?? new Set();
  listeners.set(view, set);
  set.add(listener);
  return () => void set.delete(listener);
}

export const findState = (state: EditorState): FindState => key.getState(state) ?? EMPTY;

/** Selects the current match and scrolls to it, without taking focus. */
function showCurrent(tr: Transaction, view: EditorView): Transaction {
  const { matches, index } = findState(view.state.apply(tr));
  const match = matches[index];
  return match ? tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView() : tr;
}

/** Looks for `query`, from the match nearest the caret. */
export function setQuery(view: EditorView, query: string): void {
  const from = view.state.selection.from;
  const index = Math.max(0, findMatches(view.state.doc, query).findIndex((m) => m.to >= from));
  view.dispatch(showCurrent(view.state.tr.setMeta(key, { query, index }), view));
}

/** Moves to the next match, or back with -1, going round at the ends. */
export function step(view: EditorView, by: 1 | -1): void {
  const { matches, index } = findState(view.state);
  if (matches.length === 0) return;
  const next = (index + by + matches.length) % matches.length;
  view.dispatch(showCurrent(view.state.tr.setMeta(key, { index: next }), view));
}

/** Replaces the current match and moves to the next after it. */
export function replaceCurrent(view: EditorView, text: string): void {
  const { query, matches, index } = findState(view.state);
  const match = matches[index];
  if (!match) return;
  const tr = view.state.tr.insertText(text, match.from, match.to);
  // The next match after the new text, which may itself hold the query.
  const after = findMatches(tr.doc, query).findIndex((m) => m.from >= match.from + text.length);
  view.dispatch(showCurrent(tr.setMeta(key, { index: Math.max(after, 0) }), view));
}

/** Replaces every match, in one step Mod+Z undoes. Returns how many. */
export function replaceAll(view: EditorView, text: string): number {
  const { matches } = findState(view.state);
  if (matches.length === 0) return 0;
  const tr = view.state.tr;
  for (const match of [...matches].reverse()) tr.insertText(text, match.from, match.to);
  view.dispatch(tr);
  return matches.length;
}

/** Stops finding: the marks go, the selection stays on the last match. */
export function clearFind(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(key, { query: "" }));
}
