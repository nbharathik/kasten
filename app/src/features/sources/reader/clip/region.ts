// The geometry of the clip box on a page, in the page's CSS pixels from its
// top left: drawn from a press to the pointer, moved, and resized by a handle.
// Always kept on the page. Pure, so the gestures are tested without a screen.

import type { Box } from "../../pdf/geometry";

export interface Point {
  x: number;
  y: number;
}

/** A page's size in CSS pixels. */
export interface Size {
  width: number;
  height: number;
}

/** A handle is named by the compass sides it sits on. */
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** The least a side of the box is, in CSS pixels. A press that travels less is a click, not a box. */
export const MIN_SIDE = 10;

const clamp = (n: number, low: number, high: number) => Math.min(Math.max(n, low), Math.max(low, high));

/** The box a press at `from` and a pointer now at `to` make. */
export function dragBox(from: Point, to: Point, page: Size): Box {
  const a = { x: clamp(from.x, 0, page.width), y: clamp(from.y, 0, page.height) };
  const b = { x: clamp(to.x, 0, page.width), y: clamp(to.y, 0, page.height) };
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** The box moved by (`dx`, `dy`), at the same size. */
export function moveBox(box: Box, dx: number, dy: number, page: Size): Box {
  return { ...box, left: clamp(box.left + dx, 0, page.width - box.width), top: clamp(box.top + dy, 0, page.height - box.height) };
}

/** The box with the sides the handle sits on moved by (`dx`, `dy`). A side stops short of the one across it. */
export function resizeBox(box: Box, handle: Handle, dx: number, dy: number, page: Size): Box {
  let left = box.left;
  let top = box.top;
  let right = box.left + box.width;
  let bottom = box.top + box.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - MIN_SIDE);
  if (handle.includes("e")) right = clamp(right + dx, left + MIN_SIDE, page.width);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - MIN_SIDE);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + MIN_SIDE, page.height);
  return { left, top, width: right - left, height: bottom - top };
}
