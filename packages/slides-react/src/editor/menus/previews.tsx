// Small drawings that stand beside a menu entry: what a shape, a line, a
// border weight, a dash pattern or an arrowhead looks like. All are drawn in
// the current text colour, so they follow the menu's hover and disabled looks.

import type { Arrow, Dash, Route } from "@kasten-slides/wasm";
import type { JSX } from "react";

import { shapePath } from "../../render/shapes/index.ts";

/** An outline of a preset shape, 22 units square. */
export function ShapePreview({ preset, size = 24 }: { preset: string; size?: number }): JSX.Element {
  return (
    <svg className="ks-preview" width={size} height={size} viewBox="-1 -1 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden="true">
      <path d={shapePath(preset, 22, 22)} />
    </svg>
  );
}

/** The head of an arrow, drawn at the origin pointing right. */
function Head({ arrow }: { arrow: Arrow }): JSX.Element | null {
  switch (arrow) {
    case "triangle":
      return <path d="M0 0 L-8 -4 L-8 4 Z" fill="currentColor" stroke="none" />;
    case "stealth":
      return <path d="M0 0 L-9 -4.5 L-6 0 L-9 4.5 Z" fill="currentColor" stroke="none" />;
    case "open":
      return <path d="M-7 -4.5 L0 0 L-7 4.5" fill="none" />;
    case "oval":
      return <ellipse cx={-3.5} cy={0} rx={3.5} ry={3.5} fill="currentColor" stroke="none" />;
    case "diamond":
      return <path d="M0 0 L-4.5 -4 L-9 0 L-4.5 4 Z" fill="currentColor" stroke="none" />;
    default:
      return null;
  }
}

/** How far a line is pulled back from its end so the arrowhead is not drawn over it. */
const PULL: Record<Arrow, number> = { none: 0, triangle: 7, stealth: 6, open: 0, oval: 6, diamond: 8 };

/** A line ending, or starting, in an arrowhead. `scale` draws it smaller, for a button. */
export function ArrowPreview({ arrow, end = true, scale = 1 }: { arrow: Arrow; end?: boolean; scale?: number }): JSX.Element {
  const pull = PULL[arrow];
  return (
    <svg className="ks-preview is-wide" width={40 * scale} height={16 * scale} viewBox="0 0 40 16" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform={end ? undefined : "translate(40 0) scale(-1 1)"}>
        <line x1={3} y1={8} x2={35 - pull} y2={8} />
        <g transform="translate(36 8)">
          <Head arrow={arrow} />
        </g>
      </g>
    </svg>
  );
}

/** The path of a line of the given route across a 40 x 16 box, and the way it arrives at its end. */
function routeOf(route: Route): { d: string; end: [number, number]; angle: number } {
  if (route === "elbow") return { d: "M3 13 H19 V3 H35", end: [35, 3], angle: 0 };
  if (route === "curved") return { d: "M3 13 C17 13 21 3 35 3", end: [35, 3], angle: 0 };
  return { d: "M3 13 L35 3", end: [35, 3], angle: -17.4 };
}

/** A line, elbow or curved, with or without an arrowhead. */
export function LinePreview({ route, arrow }: { route: Route; arrow: boolean }): JSX.Element {
  const { d, end, angle } = routeOf(route);
  return (
    <svg className="ks-preview is-wide" width={40} height={16} viewBox="0 0 40 16" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
      {arrow ? (
        <g transform={`translate(${end[0]} ${end[1]}) rotate(${angle})`}>
          <Head arrow="triangle" />
        </g>
      ) : null}
    </svg>
  );
}

/** A line as thick as a border weight. */
export function WeightPreview({ width, scale = 1 }: { width: number; scale?: number }): JSX.Element {
  return (
    <svg className="ks-preview is-wide" width={40 * scale} height={16 * scale} viewBox="0 0 40 16" aria-hidden="true">
      <line x1={3} y1={8} x2={37} y2={8} stroke="currentColor" strokeWidth={Math.min(width, 14)} />
    </svg>
  );
}

/** How each dash pattern is drawn, as an SVG dash array. */
export const DASH_ARRAYS: Readonly<Record<Dash, string | undefined>> = {
  solid: undefined,
  dash: "6 4",
  dot: "1.6 4",
  dashDot: "7 3.5 1.6 3.5",
  longDash: "12 4",
};

/** A line drawn in a dash pattern. */
export function DashPreview({ dash, scale = 1 }: { dash: Dash; scale?: number }): JSX.Element {
  return (
    <svg className="ks-preview is-wide" width={40 * scale} height={16 * scale} viewBox="0 0 40 16" aria-hidden="true">
      <line x1={3} y1={8} x2={37} y2={8} stroke="currentColor" strokeWidth={2} strokeLinecap={dash === "dot" || dash === "dashDot" ? "round" : "butt"} strokeDasharray={DASH_ARRAYS[dash]} />
    </svg>
  );
}
