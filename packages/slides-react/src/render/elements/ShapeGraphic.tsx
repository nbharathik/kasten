import type { Style, Theme } from "@kasten-slides/wasm";
import type { JSX } from "react";

import { paintOf, shadowFilter } from "../style.ts";
import { type ShapeAdjust, shapePath } from "../shapes/index.ts";

export interface ShapeGraphicProps {
  theme: Theme;
  style: Style | null | undefined;
  /** The preset to draw: `rect`, `ellipse`, ... */
  name: string;
  w: number;
  h: number;
  adjust?: number | ShapeAdjust | null | undefined;
}

/** A preset shape as SVG, in its box: fill, outline, dashes and shadow from the style. */
export function ShapeGraphic({ theme, style, name, w, h, adjust }: ShapeGraphicProps): JSX.Element {
  const paint = paintOf(theme, style);
  const filter = shadowFilter(theme, style?.shadow);
  // An SVG with no width or height draws nothing, so a shape with no size still gets a box.
  const width = Math.max(w, 1);
  const height = Math.max(h, 1);
  return (
    <svg className="ks-shape" width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={filter ? { filter } : undefined} aria-hidden="true">
      <path
        d={shapePath(name, w, h, adjust)}
        fill={paint.fill}
        stroke={paint.stroke}
        strokeWidth={paint.strokeWidth}
        strokeDasharray={paint.strokeDasharray}
        strokeLinejoin="round"
      />
    </svg>
  );
}
