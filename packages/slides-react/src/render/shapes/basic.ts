// The plain geometric presets: rectangles, ellipses, triangles, polygons.
// Their proportions follow PowerPoint's own definitions, so a deck that goes
// to PowerPoint and back looks the same.

import { clamp, num } from "../format.ts";
import { type Geo, type Preset, type Pt, arc, fit, poly } from "./geometry.ts";

const box = (w: number, h: number): string =>
  poly([
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]);

export const rect: Preset = ({ w, h }) => box(w, h);

/** A rectangle with quarter-circle corners; the radius cannot pass half the shorter side. */
export function roundedRect(w: number, h: number, radius: number): string {
  const r = clamp(radius, 0, Math.min(w, h) / 2);
  if (r === 0) return box(w, h);
  const corner = (x: number, y: number) => arc(r, r, 1, x, y);
  return [
    `M${num(r)} 0`,
    `H${num(w - r)}`,
    corner(w, r),
    `V${num(h - r)}`,
    corner(w - r, h),
    `H${num(r)}`,
    corner(0, h - r),
    `V${num(r)}`,
    corner(r, 0),
    "Z",
  ].join("");
}

/** The corner radius of a rounded preset: the one asked for, or a sixth of the shorter side as in PowerPoint. */
export const cornerRadius = (g: Geo, adjustAt: number): number => g.radius ?? g.ss * g.adj(adjustAt, 0.16667);

export const roundRect: Preset = (g) => roundedRect(g.w, g.h, cornerRadius(g, 0));

export const ellipse: Preset = ({ w, h }) => `M0 ${num(h / 2)}${arc(w / 2, h / 2, 1, w, h / 2, 1)}${arc(w / 2, h / 2, 1, 0, h / 2, 1)}Z`;

export const triangle: Preset = (g) =>
  poly([
    [0, g.h],
    [g.w * clamp(g.adj(0, 0.5), 0, 1), 0],
    [g.w, g.h],
  ]);

/** The right angle is at the bottom left. */
export const rtTriangle: Preset = ({ w, h }) =>
  poly([
    [0, h],
    [0, 0],
    [w, h],
  ]);

export const diamond: Preset = ({ w, h }) =>
  poly([
    [w / 2, 0],
    [w, h / 2],
    [w / 2, h],
    [0, h / 2],
  ]);

export const parallelogram: Preset = (g) => {
  const slant = g.ss * clamp(g.adj(0, 0.25), 0, g.w / (g.ss || 1));
  return poly([
    [0, g.h],
    [slant, 0],
    [g.w, 0],
    [g.w - slant, g.h],
  ]);
};

/** The short side is the top. */
export const trapezoid: Preset = (g) => {
  const inset = g.ss * clamp(g.adj(0, 0.25), 0, (0.5 * g.w) / (g.ss || 1));
  return poly([
    [0, g.h],
    [inset, 0],
    [g.w - inset, 0],
    [g.w, g.h],
  ]);
};

/** A regular pentagon, point up, stretched to fill the box. */
export const pentagon: Preset = ({ w, h }) => {
  const corners: Pt[] = [0, 1, 2, 3, 4].map((k): Pt => {
    const angle = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    return [Math.cos(angle), Math.sin(angle)];
  });
  return poly(fit(corners, corners, w, h));
};

export const hexagon: Preset = (g) => {
  const inset = g.ss * clamp(g.adj(0, 0.25), 0, (0.5 * g.w) / (g.ss || 1));
  return poly([
    [0, g.h / 2],
    [inset, 0],
    [g.w - inset, 0],
    [g.w, g.h / 2],
    [g.w - inset, g.h],
    [inset, g.h],
  ]);
};

export const octagon: Preset = (g) => {
  const cut = g.ss * clamp(g.adj(0, 0.29289), 0, 0.5);
  const { w, h } = g;
  return poly([
    [0, cut],
    [cut, 0],
    [w - cut, 0],
    [w, cut],
    [w, h - cut],
    [w - cut, h],
    [cut, h],
    [0, h - cut],
  ]);
};

export const plus: Preset = (g) => {
  const arm = g.ss * clamp(g.adj(0, 0.25), 0, 0.5);
  const { w, h } = g;
  return poly([
    [0, arm],
    [arm, arm],
    [arm, 0],
    [w - arm, 0],
    [w - arm, arm],
    [w, arm],
    [w, h - arm],
    [w - arm, h - arm],
    [w - arm, h],
    [arm, h],
    [arm, h - arm],
    [0, h - arm],
  ]);
};

/** A cylinder: the body, and the front edge of its lid as an open line. */
export const can: Preset = (g) => {
  const lid = (g.ss * clamp(g.adj(0, 0.25), 0, (0.5 * g.h) / (g.ss || 1))) / 2;
  const { w, h } = g;
  const body = `M0 ${num(lid)}${arc(w / 2, lid, 1, w, lid)}V${num(h - lid)}${arc(w / 2, lid, 1, 0, h - lid)}Z`;
  // Drawn clockwise like the body, so filling it does not cut a hole in the body's fill.
  return `${body}M${num(w)} ${num(lid)}${arc(w / 2, lid, 1, 0, lid)}`;
};

/** A flowchart terminator: a rectangle with elliptical ends, PowerPoint's proportions. */
export const terminator: Preset = ({ w, h }) => {
  const rx = Math.min((w * 3475) / 21600, w / 2);
  const ry = h / 2;
  return `M${num(rx)} 0H${num(w - rx)}${arc(rx, ry, 1, w - rx, h)}H${num(rx)}${arc(rx, ry, 1, rx, 0)}Z`;
};

/** A flowchart input or output: a parallelogram slanted by a fifth of the width. */
export const inputOutput: Preset = ({ w, h }) =>
  poly([
    [w / 5, 0],
    [w, 0],
    [(4 * w) / 5, h],
    [0, h],
  ]);

/** A flowchart manual operation: a trapezoid with the long side on top. */
export const manualOperation: Preset = ({ w, h }) =>
  poly([
    [0, 0],
    [w, 0],
    [(4 * w) / 5, h],
    [w / 5, h],
  ]);

/** A flowchart preparation: a hexagon whose points are a fifth of the width in. */
export const preparation: Preset = ({ w, h }) =>
  poly([
    [0, h / 2],
    [w / 5, 0],
    [(4 * w) / 5, 0],
    [w, h / 2],
    [(4 * w) / 5, h],
    [w / 5, h],
  ]);
