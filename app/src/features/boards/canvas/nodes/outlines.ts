// What shapes and strokes look like: an SVG outline for each
// shape in its box, and a drawn line smoothed through its points.

import type { ShapeKind } from "../../../../lib/vault/types";

/** The shapes in the order the tool bar offers them, with their names. */
export const SHAPES: readonly { kind: ShapeKind; name: string }[] = [
  { kind: "rect", name: "Rectangle" },
  { kind: "rounded", name: "Rounded rectangle" },
  { kind: "ellipse", name: "Ellipse" },
  { kind: "diamond", name: "Diamond" },
  { kind: "parallelogram", name: "Parallelogram" },
  { kind: "hexagon", name: "Hexagon" },
  { kind: "cylinder", name: "Cylinder" },
  { kind: "document", name: "Document" },
  { kind: "triangle", name: "Triangle" },
];

/** A new shape's size: flowchart boxes are wider than tall. */
export function shapeSize(kind: ShapeKind): { width: number; height: number } {
  if (kind === "ellipse" || kind === "diamond" || kind === "triangle") return { width: 160, height: 120 };
  return { width: 180, height: 96 };
}

const r = (n: number) => Math.round(n * 10) / 10;

/** The outline of `shape` in a `w` by `h` box, `inset` in from its edges
 * so a stroke of twice that width stays inside. */
export function outlinePath(shape: ShapeKind, w: number, h: number, inset = 1): string {
  const x0 = inset;
  const y0 = inset;
  const x1 = r(Math.max(inset + 1, w - inset));
  const y1 = r(Math.max(inset + 1, h - inset));
  const cx = r(w / 2);
  const cy = r(h / 2);
  const bw = x1 - x0;
  const bh = y1 - y0;
  switch (shape) {
    case "rect":
      return `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
    case "rounded": {
      const k = r(Math.min(16, bw / 4, bh / 4));
      return `M${x0 + k} ${y0}H${x1 - k}Q${x1} ${y0} ${x1} ${y0 + k}V${y1 - k}Q${x1} ${y1} ${x1 - k} ${y1}H${x0 + k}Q${x0} ${y1} ${x0} ${y1 - k}V${y0 + k}Q${x0} ${y0} ${x0 + k} ${y0}Z`;
    }
    case "ellipse": {
      const rx = r(bw / 2);
      const ry = r(bh / 2);
      return `M${x0} ${cy}A${rx} ${ry} 0 1 0 ${x1} ${cy}A${rx} ${ry} 0 1 0 ${x0} ${cy}Z`;
    }
    case "diamond":
      return `M${cx} ${y0}L${x1} ${cy}L${cx} ${y1}L${x0} ${cy}Z`;
    case "parallelogram": {
      const s = r(Math.min(bw * 0.2, bh * 0.6));
      return `M${x0 + s} ${y0}H${x1}L${r(x1 - s)} ${y1}H${x0}Z`;
    }
    case "hexagon": {
      const s = r(Math.min(bw * 0.2, bh * 0.5));
      return `M${x0 + s} ${y0}H${r(x1 - s)}L${x1} ${cy}L${r(x1 - s)} ${y1}H${x0 + s}L${x0} ${cy}Z`;
    }
    case "cylinder": {
      const rx = r(bw / 2);
      const ry = r(Math.min(14, bh * 0.16));
      return `M${x0} ${y0 + ry}A${rx} ${ry} 0 0 1 ${x1} ${y0 + ry}V${r(y1 - ry)}A${rx} ${ry} 0 0 1 ${x0} ${r(y1 - ry)}ZM${x0} ${y0 + ry}A${rx} ${ry} 0 0 0 ${x1} ${y0 + ry}`;
    }
    case "document": {
      const wave = r(Math.min(12, bh * 0.16));
      return `M${x0} ${y0}H${x1}V${r(y1 - wave)}C${r(x1 - bw * 0.3)} ${r(y1 - wave * 2.4)} ${r(x0 + bw * 0.3)} ${r(y1 + wave * 0.4)} ${x0} ${r(y1 - wave)}Z`;
    }
    case "triangle":
      return `M${cx} ${y0}L${x1} ${y1}H${x0}Z`;
  }
}

type Point = readonly [number, number];

/** A stroke's points from the file's `x,y x,y` form. */
export function parsePoints(points: string): Point[] {
  return points
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => pair.split(",").map(Number) as unknown as Point)
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

/** A smooth line through `points`: quadratic curves between the midpoints,
 * which keeps a hand-drawn line's shape without its jitter. */
export function strokePath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  const [first] = points;
  if (points.length === 1) return `M${first![0]} ${first![1]}l0.01 0`;
  let d = `M${first![0]} ${first![1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]!;
    const [nx, ny] = points[i + 1]!;
    d += `Q${x} ${y} ${r((x + nx) / 2)} ${r((y + ny) / 2)}`;
  }
  const last = points[points.length - 1]!;
  return `${d}L${last[0]} ${last[1]}`;
}

/** The room around a stroke's points, so its width is never cut off. */
export const strokePad = (size: number) => Math.ceil(size / 2) + 2;

/** The most points a drawing keeps (the core's limit). */
export const MAX_POINTS = 5000;

/** A stroke drawn on the board (in board units) as the core keeps it: its
 * box, and whole-number points relative to the box, points closer than a
 * pixel to the last one dropped. A very long stroke is thinned evenly to
 * the core's limit, its ends kept, rather than refused. */
export function toStroke(drawn: readonly { x: number; y: number }[], size: number): { x: number; y: number; width: number; height: number; points: string } | null {
  let kept: { x: number; y: number }[] = [];
  for (const p of drawn) {
    const last = kept[kept.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 1) kept.push(p);
  }
  if (kept.length === 0) return null;
  if (kept.length > MAX_POINTS) {
    const every = Math.ceil((kept.length - 1) / (MAX_POINTS - 1));
    kept = kept.filter((_, i) => i % every === 0 || i === kept.length - 1);
  }
  const pad = strokePad(size);
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of kept) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const x = Math.floor(minX) - pad;
  const y = Math.floor(minY) - pad;
  const points = kept.map((p) => `${Math.round(p.x - x)},${Math.round(p.y - y)}`).join(" ");
  return { x, y, width: Math.max(1, Math.ceil(maxX) + pad - x), height: Math.max(1, Math.ceil(maxY) + pad - y), points };
}

type Drawn = { points: string; size: number };

const measured = new WeakMap<Drawn, { points: Point[]; width: number; height: number }>();

/** A drawing's points and the box they were drawn in (which the node's own
 * size scales), worked out once per drawing: the eraser asks on every
 * move of the pointer. */
export function strokeBox(draw: Drawn): { points: Point[]; width: number; height: number } {
  const known = measured.get(draw);
  if (known) return known;
  const points = parsePoints(draw.points);
  const pad = strokePad(draw.size);
  let width = 1;
  let height = 1;
  for (const [px, py] of points) {
    width = Math.max(width, px + pad);
    height = Math.max(height, py + pad);
  }
  const box = { points, width, height };
  measured.set(draw, box);
  return box;
}

/** How far `p` is from the segment `a`–`b`. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Whether a drawing's line passes within `tolerance` of the board point
 * `p`: the eraser's test, by the line itself rather than its box. */
export function strokeHit(node: { x: number; y: number; width: number; height: number; draw?: Drawn }, p: { x: number; y: number }, tolerance: number): boolean {
  if (!node.draw) return false;
  const local: Point = [p.x - node.x, p.y - node.y];
  if (local[0] < -tolerance || local[1] < -tolerance || local[0] > node.width + tolerance || local[1] > node.height + tolerance) return false;
  const { points, width, height } = strokeBox(node.draw);
  // The drawing may have been resized since it was drawn.
  const sx = node.width / width;
  const sy = node.height / height;
  const reach = tolerance + node.draw.size / 2;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1] ?? a;
    if (segmentDistance(local, [a[0] * sx, a[1] * sy], [b[0] * sx, b[1] * sy]) <= reach) return true;
  }
  return false;
}
