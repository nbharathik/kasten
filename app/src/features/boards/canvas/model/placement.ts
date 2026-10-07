// Where new things go on a board: notes dropped at a point, and new cards,
// stickies and sections near the middle of the view without landing
// exactly on top of something already there.

import type { BoardNode } from "../../../../lib/vault/types";
import { CARD, GAP, shownRect } from "./geometry";

export interface Point {
  x: number;
  y: number;
}

/** Top-left corners for `count` cards dropped at `at`: the first centred on
 * the point, the rest beside and below it in rows of up to four. */
export function dropGrid(at: Point, count: number, size: { width: number; height: number } = CARD): Point[] {
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))));
  const origin = { x: Math.round(at.x - size.width / 2), y: Math.round(at.y - size.height / 2) };
  return Array.from({ length: count }, (_, i) => ({
    x: origin.x + (i % columns) * (size.width + GAP),
    y: origin.y + Math.floor(i / columns) * (size.height + GAP),
  }));
}

/** A top-left corner near `at` whose corner no node already sits on:
 * steps down and right by 24 px until the spot is clear. */
export function freeSpot(nodes: readonly BoardNode[], at: Point): Point {
  let spot = { x: Math.round(at.x), y: Math.round(at.y) };
  const taken = (p: Point) => nodes.some((n) => n.kind !== "group" && Math.abs(shownRect(n).x - p.x) < 12 && Math.abs(shownRect(n).y - p.y) < 12);
  for (let i = 0; i < 50 && taken(spot); i++) spot = { x: spot.x + 24, y: spot.y + 24 };
  return spot;
}

/** The corner that centres something of `size` on `at`. */
export const centredAt = (at: Point, size: { width: number; height: number }): Point => ({
  x: Math.round(at.x - size.width / 2),
  y: Math.round(at.y - size.height / 2),
});
