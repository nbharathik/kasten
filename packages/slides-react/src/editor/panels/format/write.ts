// How the panel changes the deck. Everything goes through the session, and
// what one control does is one engine operation, so it is one step of undo.

import type { Element, SetRichText, Text } from "@kasten-slides/wasm";

import type { Patch } from "../../session/elements.ts";
import type { EditorSession } from "../../session/session.ts";
import { same, textOf } from "./values.ts";

/**
 * Gives each element the patch `make` builds for it; an element that gets
 * null is left alone. When they all get the same patch it goes out as one
 * `session.elements.patch`, otherwise as one operation with a patch each.
 */
export function patchEach<E extends Element>(session: EditorSession, elements: readonly E[], make: (element: E) => Patch | null): void {
  const made = elements.flatMap((element) => {
    const patch = make(element);
    return patch ? [{ id: element.id, patch }] : [];
  });
  const first = made[0];
  if (!first) return;
  if (made.every((m) => same(m.patch, first.patch))) {
    session.elements.patch(first.patch, made.map((m) => m.id));
    return;
  }
  session.run(() => session.core.apply("patch_elements", { slide: session.state.slideId, patches: made }));
}

/** Changes the `style` of each element: `make` builds the part of the style to change. */
export function styleEach<E extends Element>(session: EditorSession, elements: readonly E[], make: (element: E) => Patch | null): void {
  patchEach(session, elements, (element) => {
    const style = make(element);
    return style ? { style } : null;
  });
}

/**
 * Rewrites the words of each element as one step. Anything about the words
 * that the change leaves alone stays as it is, formatting included.
 */
export function rewriteText(session: EditorSession, elements: readonly Element[], change: (text: Text, element: Element) => Text): void {
  const slide = session.state.slideId;
  const operations = elements.flatMap((element) => {
    const text = textOf(element);
    if (!text) return [];
    const next = change(text, element);
    return same(next, text) ? [] : [["set_rich_text", { slide, id: element.id, text: next }] satisfies ["set_rich_text", SetRichText]];
  });
  if (operations.length > 0) session.run(() => session.core.applyBatch(operations));
}

/** An outline the panel starts from when it is asked to change a border that is not there yet. */
export const NEW_STROKE: Patch = { color: "text1", width: 1 };

/** A shadow when the toggle is switched on: soft, a little down and right. */
export const NEW_SHADOW: Patch = { color: "text1", blur: 8, dx: 2, dy: 4, alpha: 0.3 };

/** The patch that changes an outline: only the change where there is one already, and the change on a new outline where there is none. */
export function strokePatch(element: Element, change: Patch): Patch {
  return { stroke: element.style?.stroke ? change : { ...NEW_STROKE, ...change } };
}

/** The same for a shadow. */
export function shadowPatch(element: Element, change: Patch): Patch {
  return { shadow: element.style?.shadow ? change : { ...NEW_SHADOW, ...change } };
}
