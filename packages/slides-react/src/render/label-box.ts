// How big the label of a connector is. The label sits on the connector's
// midpoint on a chip of the slide's own colour, so the line does not run
// through the words. Its size is worked out from the text without measuring
// it, which is close enough for a chip that only has to cover the line.

import type { Insets, Text, Theme } from "@kasten-slides/wasm";

import { DEFAULT_INSETS } from "../text/metrics.ts";
import { pointsToUnits } from "../units.ts";
import { clamp } from "./format.ts";

export const LABEL_STYLE = "caption";

/** An average letter is about this wide as a fraction of the type size. */
const CHAR_WIDTH = 0.55;
const LINE_HEIGHT = 1.25;
const MIN_WIDTH = 24;
const MAX_WIDTH = 320;

export function labelBox(theme: Theme, text: Text, insets: Insets = text.insets ?? DEFAULT_INSETS): { w: number; h: number } {
  const sizes = text.paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.size ?? 0));
  const points = Math.max(0, ...sizes) || (theme.textStyles[LABEL_STYLE]?.size ?? 14);
  const size = pointsToUnits(points);
  const lines = text.paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.t).join("").split("\n"));
  const widest = Math.max(1, ...lines.map((line) => line.length));
  return {
    w: clamp(widest * size * CHAR_WIDTH + insets.left + insets.right, MIN_WIDTH, MAX_WIDTH),
    h: Math.max(1, lines.length) * size * LINE_HEIGHT + insets.top + insets.bottom,
  };
}
