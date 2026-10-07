// What the tests of the filmstrip share: a filmstrip on a deck, and ways to read and drive it.

import { fireEvent, render, screen } from "@testing-library/react";

import { Filmstrip } from "./Filmstrip.tsx";
import { FRAME, LIST_PAD, ROW_PAD, thumbHeight } from "./model.ts";
import { type DeckOptions, openDeck } from "./test-support.ts";

export const ROW = thumbHeight({ w: 960, h: 540 }) + FRAME + 2 * ROW_PAD;
/** Where the pointer has to be to point at the upper half of the row at this place, in a list without sections. */
export const rowY = (place: number) => LIST_PAD + place * ROW + 12;

export async function setup(options: DeckOptions = {}) {
  const made = await openDeck(options);
  const view = render(<Filmstrip session={made.session} ui={made.ui} />);
  return { ...made, ...view };
}

export const rows = () => screen.getAllByRole("option");
export const list = () => screen.getByRole("listbox", { name: "Slides" });
export const shownOf = () => rows().findIndex((row) => row.getAttribute("aria-current") === "true");
export const pickedOf = () => rows().flatMap((row, i) => (row.getAttribute("aria-selected") === "true" ? [i] : []));

/** A press, a pull and a release, the way the pointer does them. */
export function drag(from: HTMLElement, path: { x?: number; y: number }[], options: { release?: boolean } = {}) {
  const first = path[0]!;
  fireEvent.pointerDown(from, { button: 0, pointerId: 1, clientX: first.x ?? 10, clientY: first.y });
  for (const step of path.slice(1)) fireEvent.pointerMove(window, { pointerId: 1, clientX: step.x ?? 10, clientY: step.y });
  const last = path[path.length - 1]!;
  if (options.release !== false) fireEvent.pointerUp(window, { pointerId: 1, clientX: last.x ?? 10, clientY: last.y });
}
