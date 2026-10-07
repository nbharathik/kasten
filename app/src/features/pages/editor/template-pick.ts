// How an empty page is filled from a template: the page hands the editor a
// way to open the template gallery, and the slash menu offers "Template…"
// while the page holds nothing but the "/" being typed. The editor alone
// (and its tests) has none.

import type { Ctx } from "@milkdown/kit/ctx";
import type { EditorState } from "@milkdown/kit/prose/state";
import { $ctx } from "@milkdown/kit/utils";

export const templatePickerCtx = $ctx<(() => void) | null, "kastenTemplate">(null, "kastenTemplate");

/** Opens the gallery to fill this page; null when the page offers none. */
export function templatePickerOf(ctx: Ctx): (() => void) | null {
  try {
    return ctx.get(templatePickerCtx.key);
  } catch {
    return null;
  }
}

/** True when the page is one line holding only a "/query": empty but for
 * the slash menu's own text. */
export function onlySlash(state: EditorState): boolean {
  const { doc } = state;
  const first = doc.firstChild;
  return doc.childCount === 1 && first !== null && first.isTextblock && /^\/\S*$/.test(first.textContent);
}
