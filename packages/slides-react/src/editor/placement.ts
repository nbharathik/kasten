// Where a new element goes on a slide: in the largest place that nothing else
// is in, at a size that suits it, so that adding a code block or a formula does
// not land on top of the title or of what is already there.

import type { Element, Theme } from "@kasten-slides/wasm";

import { type Box, boxOf, layoutOf } from "../theme/index.ts";

/** How far a new element keeps from what is around it, in slide units. */
export const GAP = 16;
/** How far it keeps from the edge of the slide. */
const MARGIN = { x: 48, y: 40 };
/** The least a new element is shrunk to, as a share of the size it prefers; where that does not fit it goes in the middle of the slide instead. */
const LEAST = 0.6;
/** An element that covers this share of the slide is its background, which a new element goes over. */
const BACKGROUND = 0.75;

const EPSILON = 1e-6;

/** Whether a rectangle is better than the best so far: larger, or as large and wider (a slide is wider than tall), higher, then further left. */
function better(a: Box, b: Box | null): boolean {
  if (!b) return true;
  const [sa, sb] = [a.w * a.h, b.w * b.h];
  if (Math.abs(sa - sb) > EPSILON) return sa > sb;
  if (Math.abs(a.w - b.w) > EPSILON) return a.w > b.w;
  return Math.abs(a.y - b.y) > EPSILON ? a.y < b.y : a.x < b.x - EPSILON;
}

/**
 * The largest rectangle inside `frame` that crosses none of the `obstacles`,
 * or null when there is no room at all. Among rectangles of the same size the
 * widest is taken, then the highest, then the leftmost.
 */
export function largestFree(frame: Box, obstacles: readonly Box[]): Box | null {
  const right = frame.x + frame.w;
  const bottom = frame.y + frame.h;
  const things = obstacles.filter((o) => (o.w > 0 || o.h > 0) && o.x < right && o.x + o.w > frame.x && o.y < bottom && o.y + o.h > frame.y);
  const edges = [frame.x, right, ...things.flatMap((o) => [o.x, o.x + o.w])].filter((x) => x >= frame.x && x <= right);
  const xs = [...new Set(edges)].sort((a, b) => a - b);
  let best: Box | null = null;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const x1 = xs[i] as number;
      const x2 = xs[j] as number;
      // What stands in the strip between the two edges, from top to bottom: the room left between them is a rectangle.
      const strip = things.filter((o) => o.x < x2 && o.x + o.w > x1).sort((a, b) => a.y - b.y);
      let cursor = frame.y;
      const consider = (from: number, to: number): void => {
        if (to - from <= 0) return;
        const found = { x: x1, y: from, w: x2 - x1, h: to - from };
        if (better(found, best)) best = found;
      };
      for (const o of strip) {
        consider(cursor, Math.min(o.y, bottom));
        cursor = Math.max(cursor, o.y + o.h);
      }
      consider(cursor, bottom);
    }
  }
  return best;
}

const inflate = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, w: b.w + 2 * by, h: b.h + 2 * by });

const crosses = (a: Box, b: Box): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** The corners a small element that belongs at the edge of the slide (a step label, a citation) is put in. */
export type Corner = "bottom-left" | "bottom-right";
/** How far a corner element is from the edges: the bottom keeps the room the checker asks for round anything on a slide (24), and the right is further, to leave the slide number its place. */
const CORNER = { left: 64, right: 108, bottom: 24 };

/** Where an element of `size` sits in a corner of the slide, clear of the edge and of the slide number. */
export function cornerBox(size: { w: number; h: number }, corner: Corner, slide: { w: number; h: number }): Box {
  const x = corner === "bottom-right" ? slide.w - CORNER.right - size.w : CORNER.left;
  return { x: Math.round(x), y: Math.round(slide.h - CORNER.bottom - size.h), w: size.w, h: size.h };
}

/** How far each element put over the others is moved from the one before it, so that it does not hide exactly behind it. */
const CASCADE = 24;

/**
 * The box for an element that prefers `size`, on a slide of `slide` units with
 * `obstacles` on it: in the middle of the largest free place (shrunk, with its
 * shape kept, if the place is small); over the middle of the slide when there is
 * hardly any room. Whole numbers.
 */
export function boxFor(size: { w: number; h: number }, obstacles: readonly Box[], slide: { w: number; h: number }, corner?: Corner): Box {
  if (corner) {
    const there = cornerBox(size, corner, slide);
    if (!obstacles.some((o) => crosses(inflate(o, 4), there))) return there;
  }
  const frame: Box = { x: MARGIN.x, y: MARGIN.y, w: slide.w - 2 * MARGIN.x, h: slide.h - 2 * MARGIN.y };
  const free = largestFree(
    frame,
    obstacles.map((o) => inflate(o, GAP)),
  );
  const fits = free ? Math.min(1, free.w / size.w, free.h / size.h) : 0;
  const [room, scale] = free && fits >= LEAST ? [free, fits] : [{ x: 0, y: 0, w: slide.w, h: slide.h }, Math.min(1, slide.w / size.w, slide.h / size.h)];
  const w = Math.max(1, Math.round(size.w * scale));
  const h = Math.max(1, Math.round(size.h * scale));
  let x = Math.round(room.x + (room.w - w) / 2);
  let y = Math.round(room.y + (room.h - h) / 2);
  // Over the middle of the slide: not exactly over something that starts in the same place, or it would be hidden behind it.
  if (room === free) return { x, y, w, h };
  for (let step = 0; step < 8 && obstacles.some((o) => Math.abs(o.x - x) < 6 && Math.abs(o.y - y) < 6) && x + CASCADE + w <= slide.w && y + CASCADE + h <= slide.h; step++) {
    x += CASCADE;
    y += CASCADE;
  }
  return { x, y, w, h };
}

/** Whether an element has nothing to show when presented: an empty prompt of the layout. */
function isEmptyPrompt(element: Element): boolean {
  if (element.placeholder == null) return false;
  if (element.type === "text") return element.text.paragraphs.every((paragraph) => paragraph.runs.every((run) => run.t === "" && !run.field));
  return element.type === "image" && element.src === "";
}

function unionOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

function boxIn(theme: Theme, layout: string, element: Element): Box | null {
  const own = boxOf(theme, layout, element);
  if (own) return own;
  return element.type === "group" ? unionOf(element.children.flatMap((child) => boxIn(theme, layout, child) ?? [])) : null;
}

/**
 * The places on a slide that a new element keeps out of: every element that
 * shows something. Empty prompts are not among them, and neither is a
 * background (an element over most of the slide).
 */
export function occupiedBy(theme: Theme, layout: string, elements: readonly Element[], slide: { w: number; h: number }): Box[] {
  return elements.flatMap((element) => {
    if (isEmptyPrompt(element)) return [];
    const box = boxIn(theme, layout, element);
    return box && box.w * box.h < BACKGROUND * slide.w * slide.h ? [box] : [];
  });
}

/** What the theme draws on every slide of this layout (a header bar, a logo), which is as much in the way as anything on the slide. */
export function masterBoxes(theme: Theme, layout: string, slide: { w: number; h: number }): Box[] {
  if (layoutOf(theme, layout)?.hideMaster) return [];
  return occupiedBy(theme, layout, theme.master ?? [], slide);
}
