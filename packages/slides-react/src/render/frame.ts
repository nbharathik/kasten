// The box each element is drawn in: where it is, how it is turned, how see-through it is.

import type { CSSProperties } from "react";
import type { Element, StepState, Theme } from "@kasten-slides/wasm";

import type { Box } from "../theme/index.ts";
import { clamp, num } from "./format.ts";

/** How opaque the outline of an element a step hides is, in an editor. */
export const GHOST_OPACITY = 0.3;

/**
 * The CSS transform for a turn (degrees clockwise) and flips, about the
 * centre. The flip is done first and the turn after it, so a flipped
 * element still turns the way its rotation says. Undefined when it is upright.
 */
export function transformOf(rotation: number | null | undefined, flipH: boolean | undefined, flipV: boolean | undefined): string | undefined {
  const turn = rotation != null && Number.isFinite(rotation) ? rotation : 0;
  if (turn === 0 && !flipH && !flipV) return undefined;
  return `rotate(${num(turn)}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`;
}

/** How opaque an element is: its own opacity, faded further when a step dims it, and ghostly when an editor shows what a step hides. */
export function opacityOf(element: Pick<Element, "style">, state: StepState, theme: Theme): number {
  const own = clamp(element.style?.opacity ?? 1, 0, 1);
  if (state === "hidden") return GHOST_OPACITY;
  return state === "dimmed" ? own * clamp(theme.dimmedOpacity, 0, 1) : own;
}

/** The style of the box an element is drawn in. */
export function frameStyle(box: Box, element: Pick<Element, "rotation" | "flipH" | "flipV">, opacity: number): CSSProperties {
  const transform = transformOf(element.rotation, element.flipH, element.flipV);
  return {
    position: "absolute",
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    ...(transform ? { transform, transformOrigin: "center" } : {}),
    ...(opacity === 1 ? {} : { opacity }),
  };
}
