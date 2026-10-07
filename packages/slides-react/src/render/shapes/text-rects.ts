// The part of a shape's box that its text is set in. PowerPoint sets the text
// of an ellipse in the rectangle that fits inside it, of a diamond in its
// middle quarter, and so on, so that words stay inside the outline. Presets
// that are not listed here use the whole box.

import { clamp } from "../format.ts";
import type { Box } from "../../theme/index.ts";
import { cornerRadius } from "./basic.ts";
import { geoOf, type ShapeAdjust } from "./geometry.ts";

/** One minus the cosine of 45 degrees, halved: how far in a rectangle inscribed in an ellipse starts. */
const ELLIPSE_INSET = 0.14645;
/** The corner of a rounded rectangle cuts this fraction of the radius off the text's rectangle. */
const ROUND_INSET = 0.29289;

const whole = (w: number, h: number): Box => ({ x: 0, y: 0, w, h });
const between = (left: number, top: number, right: number, bottom: number): Box => ({
  x: left,
  y: top,
  w: Math.max(0, right - left),
  h: Math.max(0, bottom - top),
});

/** The rectangle inside a shape of `w` x `h` where its text goes, with its top left corner relative to the shape's. */
export function textRect(name: string, w: number, h: number, adjust?: number | ShapeAdjust | null): Box {
  const g = geoOf(w, h, adjust);
  switch (name) {
    case "roundRect":
    case "flowChartAlternateProcess": {
      const inset = clamp(cornerRadius(g, 0), 0, g.ss / 2) * ROUND_INSET;
      return between(inset, inset, g.w - inset, g.h - inset);
    }
    case "wedgeRoundRectCallout": {
      const inset = clamp(cornerRadius(g, 2), 0, g.ss / 2) * ROUND_INSET;
      return between(inset, inset, g.w - inset, g.h - inset);
    }
    case "ellipse":
    case "flowChartConnector":
      return between(g.w * ELLIPSE_INSET, g.h * ELLIPSE_INSET, g.w * (1 - ELLIPSE_INSET), g.h * (1 - ELLIPSE_INSET));
    case "diamond":
    case "flowChartDecision":
      return between(g.w / 4, g.h / 4, (3 * g.w) / 4, (3 * g.h) / 4);
    case "rtTriangle":
      return between(g.w / 12, (g.h * 7) / 12, (g.w * 7) / 12, (g.h * 11) / 12);
    case "triangle": {
      const left = (g.w * clamp(g.adj(0, 0.5), 0, 1)) / 2;
      return between(left, g.h / 2, left + g.w / 2, g.h);
    }
    case "can": {
      const lid = (g.ss * clamp(g.adj(0, 0.25), 0, (0.5 * g.h) / (g.ss || 1))) / 2;
      return between(0, 2 * lid, g.w, g.h - lid);
    }
    case "plus": {
      const arm = g.ss * clamp(g.adj(0, 0.25), 0, 0.5);
      return between(arm, arm, g.w - arm, g.h - arm);
    }
    case "flowChartTerminator":
      return between((g.w * 1018) / 21600, (g.h * 3163) / 21600, (g.w * 20582) / 21600, (g.h * 18437) / 21600);
    case "rightArrow":
    case "leftArrow": {
      const half = (g.h * clamp(g.adj(0, 0.5), 0, 1)) / 2;
      const top = g.h / 2 - half;
      const head = g.ss * clamp(g.adj(1, 0.5), 0, g.w / (g.ss || 1));
      const slope = (top * head) / (g.h / 2 || 1);
      return name === "rightArrow"
        ? between(0, top, g.w - head + slope, g.h / 2 + half)
        : between(head - slope, top, g.w, g.h / 2 + half);
    }
    case "upArrow":
    case "downArrow": {
      const half = (g.w * clamp(g.adj(0, 0.5), 0, 1)) / 2;
      const left = g.w / 2 - half;
      const head = g.ss * clamp(g.adj(1, 0.5), 0, g.h / (g.ss || 1));
      const slope = (left * head) / (g.w / 2 || 1);
      return name === "upArrow"
        ? between(left, head - slope, g.w / 2 + half, g.h)
        : between(left, 0, g.w / 2 + half, g.h - head + slope);
    }
    default:
      return whole(g.w, g.h);
  }
}
