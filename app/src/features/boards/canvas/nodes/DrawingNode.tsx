// A drawn stroke: its points smoothed into one line. The line
// keeps its width when the drawing is resized, and takes the drawing's
// colour, else the ink's.

import { memo, useMemo } from "react";

import { cssColor } from "../colors";
import { strokeBox, strokePath } from "./outlines";
import { Resizer, sameNode, type BoardNodeProps } from "./parts";

export const DrawingNode = memo(function DrawingNode({ id, data, selected }: BoardNodeProps) {
  const node = data.node;
  const size = node.draw?.size ?? 2;
  const { d, width, height } = useMemo(() => {
    // The box the points were drawn in, which the node's own size scales.
    const box = strokeBox(node.draw ?? { points: "", size });
    return { d: strokePath(box.points), width: box.width, height: box.height };
  }, [node.draw, size]);
  return (
    <div className="kasten-node kasten-drawing" aria-label="Drawing">
      {selected && <Resizer id={id} minWidth={8} minHeight={8} />}
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={d} fill="none" stroke={cssColor(node.color) ?? "var(--color-ink)"} strokeWidth={size} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}, sameNode);
