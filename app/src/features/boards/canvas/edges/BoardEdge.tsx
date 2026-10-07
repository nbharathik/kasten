// A connection: a curve between the sides it joins, an arrowhead at each
// end JSON Canvas asks for (by default none at the start, one at the end),
// its colour and label. Double-click writes the label; selected, it shows
// a small toolbar.

import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, getStraightPath, type EdgeProps } from "@xyflow/react";
import { memo } from "react";

import { cssColor } from "../colors";
import { useBoard, useBoardState } from "../context";
import type { FlowEdge } from "../model/flow";
import { LineEditor } from "../nodes/editors";
import { restyleEdge } from "../state/gestures";
import { EdgeBar } from "./EdgeBar";
import { markerId } from "./markers";

export const BoardEdge = memo(function BoardEdge(props: EdgeProps<FlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const board = useBoard();
  const editing = useBoardState((s) => s.editing === id);
  const edge = data?.edge;
  if (!edge) return null;
  // Straight, elbowed as in a flowchart, or the board's own curve.
  const [path, labelX, labelY] =
    edge.line === "straight"
      ? getStraightPath({ sourceX, sourceY, targetX, targetY })
      : edge.line === "elbow"
        ? getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 10, offset: 24 })
        : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.3 });
  const colour = cssColor(edge.color);
  const style = colour || edge.dash ? { ...(colour ? { stroke: colour } : {}), ...(edge.dash ? { strokeDasharray: "7 6" } : {}) } : undefined;
  const start = edge.fromEnd === "arrow" ? `url(#${markerId(edge.color)})` : undefined;
  const end = (edge.toEnd ?? "arrow") === "arrow" ? `url(#${markerId(edge.color)})` : undefined;
  return (
    <>
      {selected && <path d={path} className="kasten-edge-halo" />}
      <BaseEdge id={id} path={path} markerStart={start} markerEnd={end} interactionWidth={20} className="kasten-edge-path" style={style} />
      {(edge.label || editing) && (
        <EdgeLabelRenderer>
          <div className={`kasten-edge-label nodrag nopan${selected ? " is-selected" : ""}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, ...(colour ? { borderColor: colour } : {}) }}>
            {editing ? (
              <LineEditor text={edge.label ?? ""} label="Connection label" placeholder="Label" onDone={(text) => (text === null ? board.store.setState({ editing: null }) : restyleEdge(board, id, { label: text }))} />
            ) : (
              <span onDoubleClick={() => board.store.setState({ editing: id })}>{edge.label}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
      {selected && !editing && <EdgeBar id={id} edge={edge} x={labelX} y={labelY} />}
    </>
  );
});
