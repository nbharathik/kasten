// Choosing items: with a drag rectangle, with modifier keys, and with Tab.

import type { Rect } from "./geometry.ts";
import { encloses, intersects } from "./geometry.ts";
import type { Item } from "./items.ts";
import { boundsOf } from "./items.ts";

/** "contain" takes items wholly inside the rectangle; "touch" takes any it overlaps. */
export type MarqueeMode = "touch" | "contain";

/**
 * Ids of the items a drag rectangle picks, back to front. A turned item counts
 * by the upright box that holds it, which is the box the person sees selected.
 * Locked items are left out, as they are for a click.
 */
export function marqueeHits(
  items: readonly Item[],
  rect: Rect,
  mode: MarqueeMode = "contain",
  opts: { includeLocked?: boolean } = {},
): string[] {
  const picks: (outer: Rect, inner: Rect) => boolean = mode === "touch" ? intersects : encloses;
  return items.filter((item) => (opts.includeLocked || !item.locked) && picks(rect, boundsOf(item))).map((item) => item.id);
}

/** How a click or drag combines with what is already selected. */
export type SelectHow = "replace" | "add" | "toggle";

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

/** The selection after `picked` is applied to `current`. Neither list is changed. */
export function applySelection(current: readonly string[], picked: readonly string[], how: SelectHow): string[] {
  const next = unique(picked);
  switch (how) {
    case "replace":
      return next;
    case "add":
      return unique([...current, ...next]);
    case "toggle": {
      const flipped = new Set(next);
      const had = new Set(current);
      return [...unique(current).filter((id) => !flipped.has(id)), ...next.filter((id) => !had.has(id))];
    }
  }
}

/** The id Tab (or Shift+Tab, `backwards`) moves to, wrapping round; from nothing it starts at the first (or last). */
export function cycle(order: readonly string[], current: string | null, backwards = false): string | null {
  if (order.length === 0) return null;
  const at = current === null ? -1 : order.indexOf(current);
  if (at === -1) return (backwards ? order[order.length - 1] : order[0]) ?? null;
  return order[(at + (backwards ? -1 : 1) + order.length) % order.length] ?? null;
}
