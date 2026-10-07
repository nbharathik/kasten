import type { Route, Stroke, Style, Theme } from "@kasten-slides/wasm";
import type { JSX } from "react";

import { colorOf } from "../../theme/index.ts";
import { headShape, headSize, headTransform } from "../lines/heads.ts";
import { endDirection, pathData, routePath, startDirection, trimEnd, trimStart } from "../lines/route.ts";
import { dashArray, shadowFilter, strokeWidthOf } from "../style.ts";

/** What a line with no stroke of its own is drawn with, so that it is never invisible. */
const FALLBACK_STROKE: Stroke = { color: "text1", width: 1.5 };

export interface LineGraphicProps {
  theme: Theme;
  style: Style | null | undefined;
  route: Route | null | undefined;
  w: number;
  h: number;
}

/**
 * A line, elbow or curve from the top left of its box to the bottom right,
 * with the arrowheads the style asks for. The element's flips are done by the
 * element around it, so a flipped line runs along the other diagonal.
 */
export function LineGraphic({ theme, style, route, w, h }: LineGraphicProps): JSX.Element {
  const stroke = style?.stroke ?? FALLBACK_STROKE;
  const width = strokeWidthOf(stroke);
  const color = colorOf(theme, stroke.color, stroke.alpha);
  const size = headSize(width);
  const first = headShape(style?.startArrow, size);
  const last = headShape(style?.endArrow, size);

  const whole = routePath(route, w, h);
  const [startX, startY] = startDirection(whole);
  const startFacing: [number, number] = [-startX, -startY];
  const endFacing = endDirection(whole);
  const end = whole.segs[whole.segs.length - 1]?.to ?? whole.start;
  const path = trimStart(trimEnd(whole, last?.setback ?? 0), first?.setback ?? 0);

  // A line of no width or no height still has a box to draw in, wide enough to show the stroke.
  const room = Math.max(width, 1);
  const boxW = Math.max(w, room);
  const boxH = Math.max(h, room);
  const filter = shadowFilter(theme, style?.shadow);
  const head = (shape: NonNullable<typeof first>, tip: readonly [number, number], facing: readonly [number, number]) => (
    <path
      d={shape.d}
      transform={headTransform(tip, facing)}
      fill={shape.filled ? color : "none"}
      stroke={shape.filled ? "none" : color}
      strokeWidth={width}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
  return (
    <svg className="ks-line" width={boxW} height={boxH} viewBox={`0 0 ${boxW} ${boxH}`} style={filter ? { filter } : undefined} aria-hidden="true">
      {width > 0 && (
        <>
          <path d={pathData(path)} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dashArray(stroke.dash, width)} strokeLinejoin="round" />
          {first && head(first, whole.start, startFacing)}
          {last && head(last, end, endFacing)}
        </>
      )}
    </svg>
  );
}
