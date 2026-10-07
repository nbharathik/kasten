// Where an element is. An element with its own box is where it says; one that
// fills a placeholder takes what it does not name from its layout's slot.

import type { Layout, PlaceholderDef, Theme } from "@kasten-slides/wasm";

/** A box in slide units. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What is read of an element to place it: its own box, if it names one, and the slot it fills. Every element type has these. */
export interface Boxed {
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  placeholder?: string | null;
}

/** The layout a slide uses. */
export function layoutOf(theme: Theme, layoutName: string): Layout | undefined {
  return theme.layouts.find((layout) => layout.name === layoutName);
}

/** The slot an element fills on the layout called `layoutName`. */
export function placeholderOf(theme: Theme, layoutName: string, element: Pick<Boxed, "placeholder">): PlaceholderDef | undefined {
  const role = element.placeholder;
  if (role == null) return undefined;
  return layoutOf(theme, layoutName)?.placeholders.find((slot) => slot.role === role);
}

/**
 * The box an element occupies on a slide that uses the layout `layoutName`:
 * each of x, y, w and h the element names itself, and the rest from its
 * placeholder. Null when a side is named by neither.
 */
export function boxOf(theme: Theme, layoutName: string, element: Boxed): Box | null {
  const slot = placeholderOf(theme, layoutName, element);
  const x = element.x ?? slot?.x;
  const y = element.y ?? slot?.y;
  const w = element.w ?? slot?.w;
  const h = element.h ?? slot?.h;
  if (x == null || y == null || w == null || h == null) return null;
  return { x, y, w, h };
}
