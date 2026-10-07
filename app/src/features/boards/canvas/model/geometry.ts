// Board geometry in the app: node rectangles as they show on screen, which
// sides face each other, and what a section holds. Sizes and the sides rule
// match the core (crates/kasten-core/src/board/geometry.rs).

import type { BoardNode, BoardSide } from "../../../../lib/vault/types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the core makes: a card, a sticky, a link card. */
export const CARD = { width: 320, height: 180 } as const;
export const STICKY = { width: 260, height: 120 } as const;
/** How tall a card showing only its title is on screen. */
export const TITLE_HEIGHT = 48;
/** How tall a folded section is on screen: its label bar. */
export const FOLDED_HEIGHT = 44;
/** Inside a section around its nodes; its label gets as much again on top. */
export const PAD = 40;
/** Between cards laid out in a grid or a section. */
export const GAP = 40;

export const rectOf = (node: BoardNode): Rect => ({ x: node.x, y: node.y, width: node.width, height: node.height });

/** The rectangle a node takes on screen: title-only cards and folded
 * sections are shorter than the size the file keeps for them. */
export function shownRect(node: BoardNode): Rect {
  if (node.kind === "file" && node.size === "title") return { x: node.x, y: node.y, width: node.width, height: TITLE_HEIGHT };
  if (node.kind === "group" && node.collapsed) return { x: node.x, y: node.y, width: node.width, height: FOLDED_HEIGHT };
  return rectOf(node);
}

export const right = (r: Rect) => r.x + r.width;
export const bottom = (r: Rect) => r.y + r.height;
export const area = (r: Rect) => r.width * r.height;
export const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** The smallest rectangle holding both. */
export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(right(a), right(b)) - x, height: Math.max(bottom(a), bottom(b)) - y };
}

/** The rectangle around all of them, or null for none. */
export function bounds(rects: readonly Rect[]): Rect | null {
  return rects.length === 0 ? null : rects.reduce(union);
}

/** A section around `r`: 40 px on every side and 40 more on top for the
 * label (the core's `Rect::section`). */
export function sectionAround(r: Rect): Rect {
  return { x: r.x - PAD, y: r.y - 2 * PAD, width: r.width + 2 * PAD, height: r.height + 3 * PAD };
}

/** The sides an edge leaves and enters when none are given: the ones facing
 * each other along the axis where the centres are further apart. */
export function facingSides(from: Rect, to: Rect): [BoardSide, BoardSide] {
  const dx = 2 * to.x + to.width - (2 * from.x + from.width);
  const dy = 2 * to.y + to.height - (2 * from.y + from.height);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["right", "left"] : ["left", "right"];
  return dy > 0 ? ["bottom", "top"] : ["top", "bottom"];
}

/** Whether a section holds an item: JSON Canvas groups list no children, so
 * what is inside is what sits there. The item's centre must be in the
 * section, and the item smaller than it. */
export function holds(section: Rect, item: Rect): boolean {
  const c = centre(item);
  return c.x >= section.x && c.x <= right(section) && c.y >= section.y && c.y <= bottom(section) && area(item) < area(section);
}

/** Whether two rectangles overlap. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
}
