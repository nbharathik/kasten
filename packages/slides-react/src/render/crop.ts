// Cropping an image. `crop` says how much to cut from each edge, as a
// fraction of the whole picture. The box the image occupies shows what is
// left, so the whole picture is drawn larger than the box and moved up and to
// the left; the box then clips it.

import type { Crop } from "@kasten-slides/wasm";

import { clamp, num } from "./format.ts";

/** Where the whole picture goes inside the element's box, as percentages of that box. */
export interface CropFrame {
  left: string;
  top: string;
  width: string;
  height: string;
}

/** The smallest part of a picture a crop may leave: a crop that cuts everything still shows a sliver. */
const LEAST_SHOWN = 0.01;

const percent = (fraction: number): string => `${num(fraction * 100)}%`;

/** The placement of the whole picture for a crop; null when nothing is cut. */
export function cropFrame(crop: Crop | null | undefined): CropFrame | null {
  if (!crop) return null;
  const [left, top, right, bottom] = [crop.left, crop.top, crop.right, crop.bottom].map((cut) => (Number.isFinite(cut) ? cut : 0));
  if (!left && !top && !right && !bottom) return null;
  const shownW = clamp(1 - (left ?? 0) - (right ?? 0), LEAST_SHOWN, Number.POSITIVE_INFINITY);
  const shownH = clamp(1 - (top ?? 0) - (bottom ?? 0), LEAST_SHOWN, Number.POSITIVE_INFINITY);
  return {
    left: percent(-(left ?? 0) / shownW),
    top: percent(-(top ?? 0) / shownH),
    width: percent(1 / shownW),
    height: percent(1 / shownH),
  };
}
