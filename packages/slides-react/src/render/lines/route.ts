// The path a line or a connector takes inside its box. A line runs from the
// box's top left corner to its bottom right one; the element's flips turn that
// into the other diagonal, so the path is always drawn in the box's own
// unflipped coordinates.

import type { Route } from "@kasten-slides/wasm";

import { num } from "../format.ts";

export type Pt = readonly [number, number];

/** A stretch of the path: a straight line to `to`, or a cubic curve with two control points. */
export interface Seg {
  readonly to: Pt;
  readonly control?: readonly [Pt, Pt];
}

export interface RoutePath {
  readonly start: Pt;
  readonly segs: readonly Seg[];
}

/** A polyline through the points, leaving out any step that goes nowhere. */
function through(start: Pt, ...rest: Pt[]): RoutePath {
  const segs: Seg[] = [];
  let at = start;
  for (const to of rest) {
    if (at[0] !== to[0] || at[1] !== to[1]) segs.push({ to });
    at = to;
  }
  return { start, segs };
}

/**
 * The path of a line in a box of `w` x `h`. Straight goes corner to corner.
 * Elbow goes across to the middle, down, and across again (PowerPoint's
 * bentConnector3), and curved is the S-shaped curve between the same two
 * ends, leaving and arriving horizontally.
 */
export function routePath(route: Route | null | undefined, w: number, h: number): RoutePath {
  switch (route) {
    case "elbow":
      return through([0, 0], [w / 2, 0], [w / 2, h], [w, h]);
    case "curved":
      return {
        start: [0, 0],
        segs: [
          {
            to: [w, h],
            control: [
              [w / 2, 0],
              [w / 2, h],
            ],
          },
        ],
      };
    default:
      return through([0, 0], [w, h]);
  }
}

/** The path as the `d` of an SVG path. */
export function pathData(path: RoutePath): string {
  const point = ([x, y]: Pt) => `${num(x)} ${num(y)}`;
  const segment = (seg: Seg) => (seg.control ? `C${point(seg.control[0])} ${point(seg.control[1])} ${point(seg.to)}` : `L${point(seg.to)}`);
  return `M${point(path.start)}${path.segs.map(segment).join("")}`;
}

const distance = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** The unit vector from `a` to `b`, or null when they are the same point. */
function heading(a: Pt, b: Pt): Pt | null {
  const len = distance(a, b);
  return len < 1e-9 ? null : [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

/** Each segment as the points it is drawn through: where it starts, its control points, where it ends. */
function outlines(path: RoutePath): Pt[][] {
  let at = path.start;
  return path.segs.map((seg) => {
    const points: Pt[] = [at, ...(seg.control ?? []), seg.to];
    at = seg.to;
    return points;
  });
}

/** The direction the path travels at its end; along the chord if the last stretch has no length, and to the right if the path has none. */
export function endDirection(path: RoutePath): Pt {
  for (const points of outlines(path).reverse()) {
    const tip = points[points.length - 1];
    if (!tip) continue;
    for (const before of points.slice(0, -1).reverse()) {
      const dir = heading(before, tip);
      if (dir) return dir;
    }
  }
  const last = path.segs[path.segs.length - 1];
  return (last && heading(path.start, last.to)) ?? [1, 0];
}

/** The direction the path travels at its start. */
export function startDirection(path: RoutePath): Pt {
  for (const points of outlines(path)) {
    const [origin, ...after] = points;
    if (!origin) continue;
    for (const next of after) {
      const dir = heading(origin, next);
      if (dir) return dir;
    }
  }
  return endDirection(path);
}

const advance = (p: Pt, dir: Pt, by: number): Pt => [p[0] + dir[0] * by, p[1] + dir[1] * by];

/** The path with `by` cut off its end, so a line does not poke out through the arrowhead that sits there. */
export function trimEnd(path: RoutePath, by: number): RoutePath {
  const last = path.segs[path.segs.length - 1];
  if (!last || by <= 0) return path;
  const before = path.segs[path.segs.length - 2]?.to ?? path.start;
  const dir = endDirection({ start: before, segs: [last] });
  const cut = -Math.min(by, distance(before, last.to));
  const shortened: Seg = last.control
    ? { to: advance(last.to, dir, cut), control: [last.control[0], advance(last.control[1], dir, cut)] }
    : { to: advance(last.to, dir, cut) };
  return { start: path.start, segs: [...path.segs.slice(0, -1), shortened] };
}

/** The path with `by` cut off its start. */
export function trimStart(path: RoutePath, by: number): RoutePath {
  const first = path.segs[0];
  if (!first || by <= 0) return path;
  const dir = startDirection({ start: path.start, segs: [first] });
  const cut = Math.min(by, distance(path.start, first.to));
  const moved: Seg = first.control ? { to: first.to, control: [advance(first.control[0], dir, cut), first.control[1]] } : { to: first.to };
  return { start: advance(path.start, dir, cut), segs: [moved, ...path.segs.slice(1)] };
}
