// What the arrow keys and their neighbours do in a list of slides. The
// filmstrip and the grid share it; each decides which keys mean which step.

import type { KeyboardEvent } from "react";

import type { EditorSession } from "../session/session.ts";
import { extendedBy, neighbour, rangeBetween } from "./selection.ts";

/**
 * Shows the slide `delta` places on among those that can be seen (a section
 * folded away hides its slides), or with `extend` grows the selection by
 * that much, keeping the shown slide.
 */
export function stepShown(session: EditorSession, visible: readonly string[], delta: number, extend: boolean): void {
  const { slideId, slideSelection, deck } = session.state;
  if (extend) {
    const next = extendedBy(visible, slideSelection, slideId, delta);
    if (next) session.selectSlides(next, slideId);
    return;
  }
  const target = neighbour(
    deck.slides.map((slide) => slide.id),
    new Set(visible),
    slideId,
    delta,
  );
  if (target) session.selectSlides([target]);
}

/** Shows the first or the last slide that can be seen; with `extend`, selects everything from the shown slide to it. */
export function jumpShown(session: EditorSession, visible: readonly string[], end: "first" | "last", extend: boolean): void {
  const target = end === "first" ? visible[0] : visible[visible.length - 1];
  if (!target) return;
  const { slideId } = session.state;
  if (extend && visible.includes(slideId)) session.selectSlides(rangeBetween(visible, slideId, target), slideId);
  else session.selectSlides([target]);
}

/** Selects every slide that can be seen, keeping the one shown. */
export function selectEvery(session: EditorSession, visible: readonly string[]): void {
  if (visible.length > 0) session.selectSlides(visible, session.state.slideId);
}

/** Drops the selection back to the shown slide. Answers whether there was more than that to drop. */
export function collapseSelection(session: EditorSession): boolean {
  const { slideId, slideSelection } = session.state;
  if (slideSelection.length <= 1) return false;
  session.selectSlides([slideId]);
  return true;
}

/**
 * Ctrl or Cmd with Z, Shift+Z or Y, pressed in a text field of the deck (the
 * notes, a title or a body in the outline): undoes or redoes the deck's last
 * change, unless there are words typed in the field that are not yet written,
 * where the field's own undo takes back the typing. Answers whether it took
 * the key.
 */
export function undoKey(event: KeyboardEvent, session: EditorSession, typing: boolean): boolean {
  if (typing || event.altKey || !(event.ctrlKey || event.metaKey)) return false;
  const key = event.key.toLowerCase();
  const undo = key === "z" && !event.shiftKey;
  const redo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
  if (!undo && !redo) return false;
  event.preventDefault();
  if (undo) session.undo();
  else session.redo();
  return true;
}
