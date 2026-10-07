// The pieces preset shapes are built from. A shape is drawn in a box of
// `w` x `h` slide units with its top left corner at 0, 0, so the same path
// serves at any position and any zoom.

import { num } from "../format.ts";

export type Pt = readonly [number, number];

/** A closed polygon through the points, as the `d` of an SVG path. */
export const poly = (points: readonly Pt[]): string => `M${points.map(([x, y]) => `${num(x)} ${num(y)}`).join("L")}Z`;

/** An SVG elliptical arc to (x, y); `sweep` 1 turns clockwise on screen. */
export const arc = (rx: number, ry: number, sweep: 0 | 1, x: number, y: number, large: 0 | 1 = 0): string =>
  `A${num(rx)} ${num(ry)} 0 ${large} ${sweep} ${num(x)} ${num(y)}`;

/**
 * How a preset is tuned. A number is a corner radius in slide units, which
 * is what a deck's `style.radius` is. `values` are PowerPoint's adjust
 * values as fractions (25000 is 0.25) in the preset's own order; a value that
 * is left out takes the preset's default.
 */
export interface ShapeAdjust {
  radius?: number;
  values?: readonly number[];
}

/** What a preset is told about the box it is drawn in. */
export interface Geo {
  readonly w: number;
  readonly h: number;
  /** The shorter side, which PowerPoint measures most adjustments against. */
  readonly ss: number;
  /** A corner radius asked for in slide units, if any. */
  readonly radius: number | undefined;
  /** The i-th adjust value, or `fallback` (the preset's default) when none was given. */
  adj(i: number, fallback: number): number;
}

/** Draws a shape as the `d` of an SVG path. */
export type Preset = (g: Geo) => string;

export function geoOf(w: number, h: number, adjust?: number | ShapeAdjust | null): Geo {
  const width = Math.max(0, Number.isFinite(w) ? w : 0);
  const height = Math.max(0, Number.isFinite(h) ? h : 0);
  const options: ShapeAdjust = typeof adjust === "number" ? { radius: adjust } : (adjust ?? {});
  const radius = options.radius !== undefined && Number.isFinite(options.radius) ? Math.max(0, options.radius) : undefined;
  return {
    w: width,
    h: height,
    ss: Math.min(width, height),
    radius,
    adj: (i, fallback) => {
      const value = options.values?.[i];
      return typeof value === "number" && Number.isFinite(value) ? value : fallback;
    },
  };
}

/** The points scaled and moved so that the box around `extent` becomes 0, 0 to `w`, `h`. */
export function fit(points: readonly Pt[], extent: readonly Pt[], w: number, h: number): Pt[] {
  const xs = extent.map(([x]) => x);
  const ys = extent.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left || 1;
  const height = Math.max(...ys) - top || 1;
  return points.map(([x, y]): Pt => [((x - left) * w) / width, ((y - top) * h) / height]);
}
