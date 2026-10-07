// What sits on the canvas, and finding it with a point.

import type { Point, Rect } from "./geometry.ts";
import { centre, contains, rotatePoint, turnedBounds, union } from "./geometry.ts";

/** A box that may be turned about its own centre. `x` and `y` are its top left corner before the turn. */
export interface Box extends Rect {
  rotation?: number;
}

/** Something on the canvas. Earlier items in a list are further back; the last one is on top. */
export interface Item extends Box {
  id: string;
  locked?: boolean;
}

/** The upright box that just holds `box` once it is turned. */
export const boundsOf = (box: Box): Rect => turnedBounds(box, box.rotation ?? 0);

/** The upright box holding the turned boxes of the chosen items; null when none of them is there. */
export function selectionBounds(items: readonly Item[], ids: Iterable<string>): Rect | null {
  const chosen = new Set(ids);
  return union(items.filter((item) => chosen.has(item.id)).map(boundsOf));
}

export interface HitOptions {
  /** Let locked items be hit too. */
  includeLocked?: boolean;
  /** Units added around every item, so an edge is easy to hit at any zoom. */
  tolerance?: number;
}

/** An item thinner than this gets a band this wide; a hairline line would otherwise be next to impossible to click. */
const MIN_BAND = 6;

/** The id of the topmost item under `point`, or null. */
export function hitTest(items: readonly Item[], point: Point, opts: HitOptions = {}): string | null {
  const tolerance = Math.max(0, opts.tolerance ?? 0);
  const hit = items.findLast((item) => (opts.includeLocked || !item.locked) && covers(item, point, tolerance));
  return hit ? hit.id : null;
}

function covers(item: Item, point: Point, tolerance: number): boolean {
  // In its own frame a turned item is an upright box, so one containment test serves both.
  const local = item.rotation ? rotatePoint(point, centre(item), -item.rotation) : point;
  const gx = tolerance + Math.max(0, MIN_BAND - item.w) / 2;
  const gy = tolerance + Math.max(0, MIN_BAND - item.h) / 2;
  return contains({ x: item.x - gx, y: item.y - gy, w: item.w + 2 * gx, h: item.h + 2 * gy }, local);
}
