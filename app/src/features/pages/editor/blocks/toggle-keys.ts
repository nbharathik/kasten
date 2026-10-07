// Enter and Backspace in a toggle's body, as in Notion. The toggle's title is
// an attribute of the toggle, so ProseMirror's own lift (Enter on an empty
// line, Backspace at the start of the body) would take the whole toggle and
// its title away when the line is all the body has. Here Enter on an empty
// last line leaves the toggle, and Backspace at the start of the body goes
// back to the title.

import { splitBlock } from "@milkdown/kit/prose/commands";
import type { ResolvedPos } from "@milkdown/kit/prose/model";
import { TextSelection, type Command, type EditorState } from "@milkdown/kit/prose/state";

/** The caret, when it is in a paragraph that is directly in a toggle's body. */
function inToggleBody(state: EditorState): ResolvedPos | null {
  const { $from, empty } = state.selection;
  if (!empty || $from.depth < 2 || $from.parent.type.name !== "paragraph") return null;
  return $from.node(-1).type.name === "toggle" ? $from : null;
}

/** Enter on an empty line in a toggle's body. The last line goes after the
 * toggle (a body with nothing else keeps its blank line); a line between
 * others splits as usual rather than splitting the toggle in two. */
export const enterInToggle: Command = (state, dispatch) => {
  const $from = inToggleBody(state);
  if (!$from || $from.parent.content.size > 0) return false;
  const toggle = $from.node(-1);
  if ($from.index(-1) < toggle.childCount - 1) return splitBlock(state, dispatch);
  if (dispatch) {
    const tr = state.tr;
    const after = $from.after(-1);
    if (toggle.childCount > 1) tr.delete($from.before(), $from.after());
    const at = tr.mapping.map(after);
    // An empty line already below the toggle takes the caret.
    const next = tr.doc.resolve(at).nodeAfter;
    if (!(next?.type.name === "paragraph" && next.content.size === 0)) tr.insert(at, state.schema.nodes.paragraph!.create());
    tr.setSelection(TextSelection.create(tr.doc, at + 1));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Backspace at the start of a toggle's body: the caret goes to the end of
 * the toggle's title, and nothing is deleted. */
export const backspaceInToggle: Command = (state, _dispatch, view) => {
  const $from = inToggleBody(state);
  if (!$from || $from.parentOffset > 0 || $from.index(-1) > 0) return false;
  const title = view?.nodeDOM($from.before(-1));
  const input = title instanceof HTMLElement ? title.querySelector<HTMLInputElement>(".kasten-toggle-summary") : null;
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
  return true;
};
