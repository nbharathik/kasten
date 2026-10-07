// Block arrows, and the two shapes that point like one.

import { clamp } from "../format.ts";
import { type Preset, poly } from "./geometry.ts";

/** A band that turns to a point at the right, with a notch in the left edge. */
export const chevron: Preset = (g) => {
  const step = g.ss * clamp(g.adj(0, 0.5), 0, g.w / (g.ss || 1));
  const { w, h } = g;
  return poly([
    [0, 0],
    [w - step, 0],
    [w, h / 2],
    [w - step, h],
    [0, h],
    [step, h / 2],
  ]);
};

/** A pentagon that points right, like the marker of a home plate. */
export const homePlate: Preset = (g) => {
  const head = g.ss * clamp(g.adj(0, 0.5), 0, g.w / (g.ss || 1));
  const { w, h } = g;
  return poly([
    [0, 0],
    [w - head, 0],
    [w, h / 2],
    [w - head, h],
    [0, h],
  ]);
};

/** First adjust value: the shaft's thickness as a fraction of the box across it. Second: the head's length as a fraction of the shorter side. */
export const rightArrow: Preset = (g) => {
  const { w, h } = g;
  const half = (h * clamp(g.adj(0, 0.5), 0, 1)) / 2;
  const neck = w - g.ss * clamp(g.adj(1, 0.5), 0, w / (g.ss || 1));
  return poly([
    [0, h / 2 - half],
    [neck, h / 2 - half],
    [neck, 0],
    [w, h / 2],
    [neck, h],
    [neck, h / 2 + half],
    [0, h / 2 + half],
  ]);
};

export const leftArrow: Preset = (g) => {
  const { w, h } = g;
  const half = (h * clamp(g.adj(0, 0.5), 0, 1)) / 2;
  const neck = g.ss * clamp(g.adj(1, 0.5), 0, w / (g.ss || 1));
  return poly([
    [0, h / 2],
    [neck, 0],
    [neck, h / 2 - half],
    [w, h / 2 - half],
    [w, h / 2 + half],
    [neck, h / 2 + half],
    [neck, h],
  ]);
};

export const upArrow: Preset = (g) => {
  const { w, h } = g;
  const half = (w * clamp(g.adj(0, 0.5), 0, 1)) / 2;
  const neck = g.ss * clamp(g.adj(1, 0.5), 0, h / (g.ss || 1));
  return poly([
    [0, neck],
    [w / 2, 0],
    [w, neck],
    [w / 2 + half, neck],
    [w / 2 + half, h],
    [w / 2 - half, h],
    [w / 2 - half, neck],
  ]);
};

export const downArrow: Preset = (g) => {
  const { w, h } = g;
  const half = (w * clamp(g.adj(0, 0.5), 0, 1)) / 2;
  const neck = h - g.ss * clamp(g.adj(1, 0.5), 0, h / (g.ss || 1));
  return poly([
    [0, neck],
    [w / 2 - half, neck],
    [w / 2 - half, 0],
    [w / 2 + half, 0],
    [w / 2 + half, neck],
    [w, neck],
    [w / 2, h],
  ]);
};

export const leftRightArrow: Preset = (g) => {
  const { w, h } = g;
  const half = (h * clamp(g.adj(0, 0.5), 0, 1)) / 2;
  const head = g.ss * clamp(g.adj(1, 0.5), 0, (0.5 * w) / (g.ss || 1));
  return poly([
    [0, h / 2],
    [head, 0],
    [head, h / 2 - half],
    [w - head, h / 2 - half],
    [w - head, 0],
    [w, h / 2],
    [w - head, h],
    [w - head, h / 2 + half],
    [head, h / 2 + half],
    [head, h],
  ]);
};
