// The preset shapes a deck can name (`shape: "roundRect"`), drawn as SVG paths.

import {
  can,
  diamond,
  ellipse,
  hexagon,
  inputOutput,
  manualOperation,
  octagon,
  parallelogram,
  pentagon,
  plus,
  preparation,
  rect,
  roundRect,
  rtTriangle,
  terminator,
  trapezoid,
  triangle,
} from "./basic.ts";
import { chevron, downArrow, homePlate, leftArrow, leftRightArrow, rightArrow, upArrow } from "./arrows.ts";
import { cornerRadius } from "./basic.ts";
import { wedgeRectCallout, wedgeRoundRectCallout } from "./callouts.ts";
import { clamp, num } from "../format.ts";
import { type Preset, type ShapeAdjust, geoOf } from "./geometry.ts";
import { star4, star5, star6, star8 } from "./stars.ts";

export type { ShapeAdjust } from "./geometry.ts";
export { textRect } from "./text-rects.ts";

const PRESETS: Readonly<Record<string, Preset>> = {
  rect,
  roundRect,
  ellipse,
  triangle,
  rtTriangle,
  diamond,
  parallelogram,
  trapezoid,
  pentagon,
  hexagon,
  octagon,
  plus,
  star4,
  star5,
  star6,
  star8,
  chevron,
  homePlate,
  rightArrow,
  leftArrow,
  upArrow,
  downArrow,
  leftRightArrow,
  wedgeRectCallout,
  wedgeRoundRectCallout,
  can,
  flowChartProcess: rect,
  flowChartAlternateProcess: roundRect,
  flowChartDecision: diamond,
  flowChartTerminator: terminator,
  flowChartConnector: ellipse,
  flowChartPreparation: preparation,
  flowChartInputOutput: inputOutput,
  flowChartManualOperation: manualOperation,
};

/** Whether `name` is a preset this renderer can draw. */
export function isPresetShape(name: string): boolean {
  return Object.hasOwn(PRESETS, name);
}

/** The names of the presets this renderer can draw. */
export const presetShapeNames = (): string[] => Object.keys(PRESETS);

/**
 * The outline of the preset `name` in a box of `w` x `h` with its top left
 * corner at 0, 0, as the `d` of an SVG path. `adjust` tunes it: a number is a
 * corner radius in slide units (roundRect and the rounded callout; it cannot
 * pass half the shorter side), or `{ values }` gives PowerPoint's adjust
 * values as fractions. A name that is not a preset gives a plain rectangle.
 */
export function shapePath(name: string, w: number, h: number, adjust?: number | ShapeAdjust | null): string {
  const preset = isPresetShape(name) ? PRESETS[name] : undefined;
  return (preset ?? rect)(geoOf(w, h, adjust));
}

/**
 * The CSS `border-radius` that follows the outline of a preset that is a
 * rounded rectangle (its corner radius in units) or an ellipse (50%), for
 * what is drawn around a box and should not have square corners: the
 * outline of a highlighted element. Undefined for every other preset.
 */
export function roundingOf(name: string, w: number, h: number, radius?: number | null): string | undefined {
  switch (name) {
    case "roundRect":
    case "flowChartAlternateProcess": {
      const g = geoOf(w, h, radius);
      return `${num(clamp(cornerRadius(g, 0), 0, g.ss / 2))}px`;
    }
    case "ellipse":
    case "flowChartConnector":
      return "50%";
    default:
      return undefined;
  }
}
