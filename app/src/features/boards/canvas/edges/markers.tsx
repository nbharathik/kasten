// Arrowheads, one per colour in use, drawn once for the whole board. The
// same marker serves both ends: it turns to face the way the edge runs.

import { memo } from "react";

import { cssColor } from "../colors";

/** The marker for an edge colour ("1" to "6", "#rrggbb" or none). */
export function markerId(color: string | undefined): string {
  if (!color) return "kasten-arrow";
  return `kasten-arrow-${color.replace("#", "h")}`;
}

const DEFAULTS = [undefined, "1", "2", "3", "4", "5", "6"];

/** Every arrowhead the board's edges use. */
export const EdgeMarkers = memo(function EdgeMarkers({ colors }: { colors: readonly string[] }) {
  const all = [...new Set([...DEFAULTS, ...colors.filter((c) => cssColor(c))])];
  return (
    <svg className="kasten-edge-markers" aria-hidden="true">
      <defs>
        {all.map((color) => (
          <marker key={color ?? "default"} id={markerId(color)} viewBox="0 0 12 12" refX="10.5" refY="6" markerWidth="13" markerHeight="13" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M 1.5 1.5 L 11 6 L 1.5 10.5 z" className="kasten-arrowhead" style={{ fill: cssColor(color) ?? "var(--board-edge)" }} />
          </marker>
        ))}
      </defs>
    </svg>
  );
});
