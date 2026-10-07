// A deck's `Style` (fill, outline, shadow) as what SVG and CSS are told.

import type { Dash, Shadow, Stroke, Style, Theme } from "@kasten-slides/wasm";

import { colorOf } from "../theme/index.ts";
import { num } from "./format.ts";

/** How thick an outline is when the deck names a colour but no width: 1 unit, PowerPoint's 0.75 pt. */
export const DEFAULT_STROKE_WIDTH = 1;

/** Dash and gap lengths in units of the line's width, as PowerPoint draws its presets. */
const PATTERNS: Readonly<Record<Dash, readonly number[]>> = {
  solid: [],
  dash: [4, 3],
  dot: [1, 3],
  dashDot: [4, 3, 1, 3],
  longDash: [8, 3],
};

/** The `stroke-dasharray` for a dash pattern on a line `width` units thick; undefined for a solid line. */
export function dashArray(dash: Dash | null | undefined, width: number): string | undefined {
  const pattern = dash ? PATTERNS[dash] : undefined;
  if (!pattern || pattern.length === 0) return undefined;
  const unit = Math.max(width, 0.5);
  return pattern.map((part) => num(part * unit)).join(" ");
}

/** What an SVG shape is painted with. */
export interface Paint {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string | undefined;
}

export function strokeWidthOf(stroke: Stroke | null | undefined): number {
  return stroke ? Math.max(0, stroke.width ?? DEFAULT_STROKE_WIDTH) : 0;
}

/** Fill and outline of an SVG shape: `none` for what the style does not name. */
export function paintOf(theme: Theme, style: Style | null | undefined): Paint {
  const stroke = style?.stroke;
  const width = strokeWidthOf(stroke);
  return {
    fill: style?.fill ? colorOf(theme, style.fill.color, style.fill.alpha) : "none",
    stroke: stroke && width > 0 ? colorOf(theme, stroke.color, stroke.alpha) : "none",
    strokeWidth: width,
    strokeDasharray: dashArray(stroke?.dash, width),
  };
}

/** The CSS `filter` that casts a shadow, or undefined when the style has none. */
export function shadowFilter(theme: Theme, shadow: Shadow | null | undefined): string | undefined {
  if (!shadow) return undefined;
  const color = colorOf(theme, shadow.color, shadow.alpha);
  return `drop-shadow(${num(shadow.dx)}px ${num(shadow.dy)}px ${num(Math.max(0, shadow.blur))}px ${color})`;
}

/** Whether the style paints anything on a shape's box: a fill, an outline that is thick enough to see, or a shadow. */
export function paintsBox(style: Style | null | undefined): boolean {
  return Boolean(style && (style.fill || style.shadow || strokeWidthOf(style.stroke) > 0));
}
