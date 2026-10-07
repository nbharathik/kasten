// Arrowheads. Each is a small shape drawn with its tip at the end of the line
// and pointing along it, sized from the line's width so a thick line gets a
// bigger head, but never smaller than 8 units.

import type { Arrow } from "@kasten-slides/wasm";

import { num } from "../format.ts";

export const MIN_HEAD = 8;

/** How big an arrowhead is for a line `width` units thick: 3 widths long and across, at least 8 units. */
export const headSize = (width: number): number => Math.max(MIN_HEAD, 3 * width);

export interface HeadShape {
  /** The outline in a frame whose origin is the tip and whose x axis runs along the line, back from the tip towards negative x. */
  d: string;
  /** Whether the outline is filled with the line's colour; an open head is only stroked. */
  filled: boolean;
  /** How far the line stops short of the tip, so its end is hidden inside the head. */
  setback: number;
}

const closed = (points: readonly (readonly [number, number])[]): string =>
  `M${points.map(([x, y]) => `${num(x)} ${num(y)}`).join("L")}Z`;

/** The head for `kind` at `size`, or null for none. */
export function headShape(kind: Arrow | null | undefined, size: number): HeadShape | null {
  const half = size / 2;
  switch (kind) {
    case "triangle":
      return {
        d: closed([
          [0, 0],
          [-size, -half],
          [-size, half],
        ]),
        filled: true,
        setback: size,
      };
    case "stealth":
      return {
        d: closed([
          [0, 0],
          [-size, -half],
          [-0.7 * size, 0],
          [-size, half],
        ]),
        filled: true,
        setback: 0.7 * size,
      };
    case "open":
      return { d: `M${num(-size)} ${num(-half)}L0 0L${num(-size)} ${num(half)}`, filled: false, setback: 0 };
    case "oval":
      return {
        d: `M0 0A${num(half)} ${num(half)} 0 1 1 ${num(-size)} 0A${num(half)} ${num(half)} 0 1 1 0 0Z`,
        filled: true,
        setback: half,
      };
    case "diamond":
      return {
        d: closed([
          [0, 0],
          [-half, -half],
          [-size, 0],
          [-half, half],
        ]),
        filled: true,
        setback: half,
      };
    default:
      return null;
  }
}

/** The SVG transform that puts a head's frame at `tip`, pointing along `dir`. */
export function headTransform(tip: readonly [number, number], dir: readonly [number, number]): string {
  const degrees = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  // Straight back is 180 whichever way the sign of a zero fell.
  const angle = degrees <= -180 ? degrees + 360 : degrees;
  return `translate(${num(tip[0])} ${num(tip[1])}) rotate(${num(angle)})`;
}
