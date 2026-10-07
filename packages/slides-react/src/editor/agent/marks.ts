// Reading the marks on an assistant's work: which elements of a slide an agent made or changed and nobody
// has looked at since. The marks are part of the deck (the slide's `x-agent` field, see docs/slides-format.md);
// the engine takes one off when an operation changes the element, and `accept_marks` takes them off on purpose.

import type { AgentBatch, Deck, Element, Slide } from "@kasten-slides/wasm";

/** The field of a slide that holds the marks. */
export const MARKS_KEY = "x-agent";

const isBatch = (value: unknown): value is AgentBatch => {
  if (typeof value !== "object" || value === null) return false;
  const batch = value as Partial<AgentBatch>;
  return typeof batch.at === "number" && typeof batch.by === "string" && Array.isArray(batch.ids);
};

/** The batches on a slide. A field that is not a list of batches counts as none. */
export function batchesOf(slide: Slide): AgentBatch[] {
  const value = (slide as unknown as Record<string, unknown>)[MARKS_KEY];
  return Array.isArray(value) ? value.filter(isBatch) : [];
}

function collect(elements: readonly Element[], ids: Set<string>): void {
  for (const element of elements) {
    ids.add(element.id);
    if (element.type === "group") collect(element.children, ids);
  }
}

const NONE: ReadonlyMap<string, AgentBatch> = new Map();
const cache = new WeakMap<Slide, ReadonlyMap<string, AgentBatch>>();

/** The mark of each marked element that is on the slide, by the element's id. Slides the engine did not change are the same objects, so this is worked out once for them. */
export function marksOf(slide: Slide): ReadonlyMap<string, AgentBatch> {
  const known = cache.get(slide);
  if (known) return known;
  const batches = batchesOf(slide);
  let found: ReadonlyMap<string, AgentBatch> = NONE;
  if (batches.length > 0) {
    const present = new Set<string>();
    collect(slide.elements, present);
    const marks = new Map<string, AgentBatch>();
    for (const batch of batches) for (const id of batch.ids) if (present.has(id)) marks.set(id, batch);
    found = marks.size > 0 ? marks : NONE;
  }
  cache.set(slide, found);
  return found;
}

/** How many elements on the slide are marked. */
export const markedOn = (slide: Slide): number => marksOf(slide).size;

/** How many elements of the deck are marked. */
export function pendingIn(deck: Pick<Deck, "slides">): number {
  let total = 0;
  for (const slide of deck.slides) total += markedOn(slide);
  return total;
}

/** The marks by the element that shows them: a group shows those of its children, since they cannot be seen apart. */
export function shownMarks(slide: Slide): ReadonlyMap<string, AgentBatch> {
  const marks = marksOf(slide);
  if (marks.size === 0) return marks;
  const shown = new Map<string, AgentBatch>();
  const visit = (element: Element, top: string): void => {
    const own = marks.get(element.id);
    if (own && !shown.has(top)) shown.set(top, own);
    if (element.type === "group") for (const child of element.children) visit(child, top);
  };
  for (const element of slide.elements) visit(element, element.id);
  return shown;
}

/** The marked elements among `ids` of the slide. */
export const markedAmong = (slide: Slide, ids: readonly string[]): string[] => {
  const marks = marksOf(slide);
  return ids.filter((id) => marks.has(id));
};

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 minutes ago", "just now". */
export function ago(at: number, now = Date.now()): string {
  const passed = now - at;
  for (const [unit, size] of UNITS) {
    if (passed >= size) return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-Math.floor(passed / size), unit);
  }
  return "just now";
}

/** What the badge says when pointed at: who made the work, and when. */
export const madeBy = (batch: AgentBatch, now = Date.now()): string => `Made by ${batch.by}, ${ago(batch.at, now)}`;
