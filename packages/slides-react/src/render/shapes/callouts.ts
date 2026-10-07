// Speech-bubble callouts: a rectangle with a pointed tail. The tip of the
// tail is placed relative to the centre of the box, as a fraction of its width
// and height (the first two adjust values), and the tail leaves the side the
// tip is furthest beyond, at the third of that side nearest the tip.

import { clamp, num } from "../format.ts";
import { type Geo, type Preset, type Pt, arc, poly } from "./geometry.ts";
import { cornerRadius } from "./basic.ts";

type Side = "top" | "right" | "bottom" | "left";

interface Tail {
  tip: Pt;
  side: Side;
  /** Where the tail starts and ends along its side, in the direction of increasing x or y. */
  from: number;
  to: number;
}

function tailOf(w: number, h: number, dx: number, dy: number): Tail {
  const tip: Pt = [w / 2 + w * dx, h / 2 + h * dy];
  const alongX = Math.abs(dy) > Math.abs(dx);
  if (alongX) {
    const [from, to] = dx > 0 ? [(w * 7) / 12, (w * 10) / 12] : [(w * 2) / 12, (w * 5) / 12];
    return { tip, side: dy > 0 ? "bottom" : "top", from, to };
  }
  const [from, to] = dy > 0 ? [(h * 7) / 12, (h * 10) / 12] : [(h * 2) / 12, (h * 5) / 12];
  return { tip, side: dx > 0 ? "right" : "left", from, to };
}

/** The tail's base on `side`, in the order the outline goes round the box: clockwise from the top left. */
function inserted(tail: Tail, side: Side, w: number, h: number, margin: number): Pt[] {
  if (tail.side !== side) return [];
  const along = side === "top" || side === "bottom" ? w : h;
  const from = clamp(tail.from, margin, along - margin);
  const to = clamp(tail.to, margin, along - margin);
  switch (side) {
    case "top":
      return [[from, 0], tail.tip, [to, 0]];
    case "right":
      return [[w, from], tail.tip, [w, to]];
    case "bottom":
      return [[to, h], tail.tip, [from, h]];
    case "left":
      return [[0, to], tail.tip, [0, from]];
  }
}

const DEFAULT_TIP_X = -0.20833;
const DEFAULT_TIP_Y = 0.625;

export const wedgeRectCallout: Preset = (g) => {
  const { w, h } = g;
  const tail = tailOf(w, h, g.adj(0, DEFAULT_TIP_X), g.adj(1, DEFAULT_TIP_Y));
  return poly([
    [0, 0],
    ...inserted(tail, "top", w, h, 0),
    [w, 0],
    ...inserted(tail, "right", w, h, 0),
    [w, h],
    ...inserted(tail, "bottom", w, h, 0),
    [0, h],
    ...inserted(tail, "left", w, h, 0),
  ]);
};

/** The same, with rounded corners; the third adjust value is the radius as a fraction of the shorter side. */
export const wedgeRoundRectCallout: Preset = (g: Geo) => {
  const { w, h } = g;
  const r = clamp(cornerRadius(g, 2), 0, g.ss / 2);
  const tail = tailOf(w, h, g.adj(0, DEFAULT_TIP_X), g.adj(1, DEFAULT_TIP_Y));
  const lineTo = (points: Pt[]) => points.map(([x, y]) => `L${num(x)} ${num(y)}`).join("");
  const corner = (x: number, y: number) => arc(r, r, 1, x, y);
  return [
    `M${num(r)} 0`,
    lineTo(inserted(tail, "top", w, h, r)),
    `L${num(w - r)} 0`,
    corner(w, r),
    lineTo(inserted(tail, "right", w, h, r)),
    `L${num(w)} ${num(h - r)}`,
    corner(w - r, h),
    lineTo(inserted(tail, "bottom", w, h, r)),
    `L${num(r)} ${num(h)}`,
    corner(0, h - r),
    lineTo(inserted(tail, "left", w, h, r)),
    `L0 ${num(r)}`,
    corner(r, 0),
    "Z",
  ].join("");
};
