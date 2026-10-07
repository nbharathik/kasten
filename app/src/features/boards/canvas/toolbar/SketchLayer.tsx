// What a pen, eraser or shape gesture draws while it runs, over the board
// and in its own pixels, until the finished thing takes its place.

import { useStore } from "@xyflow/react";

import { cssColor } from "../colors";
import { useBoardState } from "../context";
import type { Sketch } from "../hooks/usePointerTools";
import { outlinePath, strokePath } from "../nodes/outlines";
import { shapeOfTool } from "../state/tools";

export function SketchLayer({ sketch }: { sketch: Sketch | null }) {
  const pen = useBoardState((s) => s.pen);
  const zoom = useStore((s) => s.transform[2]);
  if (!sketch || sketch.points.length === 0) return null;
  const points = sketch.points.map((p) => [p.x, p.y] as const);
  if (sketch.tool === "draw") {
    return (
      <svg className="kasten-sketch" aria-hidden="true">
        <path d={strokePath(points)} fill="none" stroke={cssColor(pen.color) ?? "var(--color-ink)"} strokeWidth={pen.size * zoom} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (sketch.tool === "erase") {
    return (
      <svg className="kasten-sketch" aria-hidden="true">
        <path d={strokePath(points.slice(-14))} className="kasten-sketch-eraser" />
      </svg>
    );
  }
  const kind = shapeOfTool(sketch.tool);
  const first = sketch.points[0]!;
  const last = sketch.points[sketch.points.length - 1]!;
  const width = Math.abs(last.x - first.x);
  const height = Math.abs(last.y - first.y);
  if (!kind || (width < 12 && height < 12)) return null;
  return (
    <svg className="kasten-sketch" aria-hidden="true">
      <path transform={`translate(${Math.min(first.x, last.x)} ${Math.min(first.y, last.y)})`} d={outlinePath(kind, width, height, 1)} className="kasten-sketch-shape" />
    </svg>
  );
}
