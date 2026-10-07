// The bibliography a page has, and the numbers a deck gives the works it cites.
//
// The host gives the BibTeX text once (Kasten reads the `.bib` files of the vault; `slides dev` reads
// `refs.bib` beside the decks). It belongs to the page, not to a deck: every deck drawn in the page is
// written from it, the operations that draw a citation use it, and lint checks keys against it. It is
// read in the WebAssembly module; here is the small store views subscribe to, so a change is drawn.

import { closestReference as closest, readingOrder as orderOf, references as listed, setReferences as give } from "../pkg/slides_wasm.js";
import type { Deck, Element, Reference } from "./generated/index.ts";

let version = 0;
let list: readonly Reference[] | null | undefined;
const listeners = new Set<() => void>();

/**
 * Gives the page its bibliography as BibTeX text: the text of every `.bib` file the host has, one after another
 * (a key in two entries is the first one's). Empty text is a bibliography with nothing in it, so every key is
 * unknown; null takes it away, and then keys are written as they are and lint does not check them.
 */
export function setReferences(bibtex: string | null): void {
  give(bibtex ?? undefined);
  version += 1;
  list = undefined;
  for (const listener of listeners) listener();
}

/** Changes every time `setReferences` is called: what a view compares to know what it drew is out of date. */
export function referencesVersion(): number {
  return version;
}

/** Calls `listener` after the bibliography is replaced. Returns a function that stops it. Made to hand to `useSyncExternalStore`. */
export function subscribeReferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The works of the bibliography in the order they were written, or null when the host gave none. */
export function referenceList(): readonly Reference[] | null {
  if (list === undefined) list = JSON.parse(listed()) as Reference[] | null;
  return list;
}

/** The key of the bibliography that looks most like `key`, when one is near enough to be a typo of it. */
export function closestReference(key: string): string | null {
  return closest(key) ?? null;
}

const orders = new WeakMap<Deck, readonly string[]>();
let lastOrder: readonly string[] = [];

/** Whether an element, or something it holds, is a citation. */
function holdsCitation(element: Element): boolean {
  return element.type === "citation" || (element.type === "group" && element.children.some(holdsCitation));
}

/**
 * The works a deck cites, in the order of their numbers: counting through the slides in their order and, on a slide, through
 * the citations in reading order (groups too), a work is numbered when it is first cited. The same rule as the engine's
 * `citationOrder`, which a test holds it to. The list keeps its identity while it does not change, so views can compare it.
 */
export function citationOrder(deck: Deck): readonly string[] {
  const kept = orders.get(deck);
  if (kept) return kept;
  const seen = new Set<string>();
  const order: string[] = [];
  const read = (elements: readonly Element[]): void => {
    if (!elements.some(holdsCitation)) return;
    const boxes = elements.map((e) => (e.x !== undefined && e.y !== undefined && e.w !== undefined && e.h !== undefined ? [e.x, e.y, e.w, e.h] : null));
    for (const at of JSON.parse(orderOf(JSON.stringify(boxes))) as number[]) {
      const element = elements[at];
      if (element?.type === "citation") {
        for (const key of element.keys) {
          if (key !== "" && !seen.has(key)) {
            seen.add(key);
            order.push(key);
          }
        }
      } else if (element?.type === "group") {
        read(element.children);
      }
    }
  };
  for (const slide of deck.slides) read(slide.elements);
  const same = order.length === lastOrder.length && order.every((key, i) => key === lastOrder[i]);
  if (!same) lastOrder = order;
  orders.set(deck, lastOrder);
  return lastOrder;
}
