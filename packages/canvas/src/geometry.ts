// Points, sizes and boxes on the canvas, in the canvas's own units. Angles
// are degrees, clockwise, because the canvas's y axis points down.

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Point, Size {}

export const right = (r: Rect): number => r.x + r.w;
export const bottom = (r: Rect): number => r.y + r.h;
export const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= right(r) && p.y >= r.y && p.y <= bottom(r);
}

/** Whether `inner` lies wholly inside `outer`. */
export function encloses(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && right(inner) <= right(outer) && bottom(inner) <= bottom(outer);
}

/** Whether two boxes share any area; boxes that only touch do not. */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y;
}

/** The smallest box holding every box given; null when there are none. */
export function union(rects: readonly Rect[]): Rect | null {
  const [first, ...rest] = rects;
  if (!first) return null;
  let x0 = first.x;
  let y0 = first.y;
  let x1 = right(first);
  let y1 = bottom(first);
  for (const r of rest) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, right(r));
    y1 = Math.max(y1, bottom(r));
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The box between two corners, whichever way the drag went. */
export function between(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** `degrees` folded into [0, 360). */
export function normaliseAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * The unit vector that points `degrees` clockwise from the x axis. Quarter
 * turns are exact: Math.cos(Math.PI / 2) is 6e-17, which would leave fuzz in
 * every corner of a box turned 90 degrees and make edge hits flicker.
 */
export function directionOf(degrees: number): Point {
  const d = normaliseAngle(degrees);
  if (d === 0) return { x: 1, y: 0 };
  if (d === 90) return { x: 0, y: 1 };
  if (d === 180) return { x: -1, y: 0 };
  if (d === 270) return { x: 0, y: -1 };
  const t = (d * Math.PI) / 180;
  return { x: Math.cos(t), y: Math.sin(t) };
}

/** `p` turned by `degrees` around `pivot`. */
export function rotatePoint(p: Point, pivot: Point, degrees: number): Point {
  const { x: cos, y: sin } = directionOf(degrees);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
}

/** The four corners of a box turned by `degrees` around its centre, clockwise from the top left. */
export function corners(r: Rect, degrees = 0): [Point, Point, Point, Point] {
  const c = centre(r);
  const at = (x: number, y: number): Point => (degrees === 0 ? { x, y } : rotatePoint({ x, y }, c, degrees));
  return [at(r.x, r.y), at(right(r), r.y), at(right(r), bottom(r)), at(r.x, bottom(r))];
}

/** The upright box that holds a box turned by `degrees` around its centre. */
export function turnedBounds(r: Rect, degrees: number): Rect {
  const [a, b, c, d] = corners(r, degrees);
  const xs = [a.x, b.x, c.x, d.x];
  const ys = [a.y, b.y, c.y, d.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** `n` rounded to a multiple of `step`; used for snapping to a grid and to angles. */
export function snapTo(n: number, step: number): number {
  return step > 0 ? Math.round(n / step) * step : n;
}

/** `n` held between `lo` and `hi`. */
export const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);
