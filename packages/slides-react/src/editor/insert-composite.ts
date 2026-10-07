// Putting something new on the shown slide: where it goes, and the one
// operation that adds it. A menu, the insert palette and a dialog all come here.

import type { Element } from "@kasten-slides/wasm";

import { type CompositeKind, type Source, compositeSpec, newComposite } from "./composite-kinds.ts";
import { type Corner, boxFor, masterBoxes, occupiedBy } from "./placement.ts";
import type { EditorSession } from "./session/session.ts";
import type { Box } from "./session/types.ts";

/** Where on the shown slide an element of this size goes: the middle of the largest place nothing is in, or the `corner` if it is free. */
export function freeBox(session: EditorSession, size: { w: number; h: number }, corner?: Corner): Box {
  const { deck } = session;
  const { layout, elements } = session.slide;
  return boxFor(size, [...occupiedBy(deck.theme, layout, elements, deck.size), ...masterBoxes(deck.theme, layout, deck.size)], deck.size, corner);
}

/**
 * Adds an element to the shown slide, on top, in the largest free place, at the
 * size given (shrunk if the place is small). It is selected afterwards, and the
 * whole is one step of undo. Resolves to its id.
 */
export function insertPlaced(session: EditorSession, element: Element, size: { w: number; h: number }, corner?: Corner): string | undefined {
  return session.elements.insert([{ ...element, ...freeBox(session, size, corner) } as Element])[0];
}

/** Adds a new composite of a kind, with something in it to look at and change. `source` is the address a page or a video is made from. */
export function insertComposite(session: EditorSession, kind: CompositeKind, source?: Source): string | undefined {
  const spec = compositeSpec(kind);
  return insertPlaced(session, newComposite(kind, source), spec.size, spec.corner);
}
