// Stars: points on a circle, alternately at the full radius and at a fraction
// of it, then stretched so the outer points touch the box, as PowerPoint does.

import { clamp } from "../format.ts";
import { type Preset, type Pt, fit, poly } from "./geometry.ts";

/** An n-pointed star, one point straight up. `ratio` is the inner radius over the outer one. */
function star(points: number, ratio: number, w: number, h: number): string {
  const all: Pt[] = [];
  const outer: Pt[] = [];
  for (let k = 0; k < points * 2; k++) {
    const angle = -Math.PI / 2 + (k * Math.PI) / points;
    const radius = k % 2 === 0 ? 1 : ratio;
    const point: Pt = [radius * Math.cos(angle), radius * Math.sin(angle)];
    all.push(point);
    if (k % 2 === 0) outer.push(point);
  }
  return poly(fit(all, outer, w, h));
}

/** PowerPoint's adjust value is half the ratio: 0.19098 makes the five-pointed star the usual one. */
const starOf = (points: number, fallback: number): Preset => (g) => star(points, 2 * clamp(g.adj(0, fallback), 0, 0.5), g.w, g.h);

export const star4 = starOf(4, 0.125);
export const star5 = starOf(5, 0.19098);
export const star6 = starOf(6, 0.28868);
export const star8 = starOf(8, 0.375);
