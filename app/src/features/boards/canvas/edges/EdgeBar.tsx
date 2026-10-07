// The small toolbar of a selected connection: colour, arrowheads, label
// and delete. It keeps its size at every zoom.

import { EdgeToolbar } from "@xyflow/react";

import type { BoardEdge } from "../../../../lib/vault/types";
import { Icon } from "../../../../ui/Icon";
import { useBoard, useBoardState } from "../context";
import { removeFromBoard, restyleEdge, restyleLine } from "../state/gestures";
import { ColorSwatches } from "../toolbar/ColorSwatches";

export function EdgeBar({ id, edge, x, y }: { id: string; edge: BoardEdge; x: number; y: number }) {
  const board = useBoard();
  const moving = useBoardState((s) => s.moving);
  if (moving) return null;
  const startArrow = edge.fromEnd === "arrow";
  const endArrow = (edge.toEnd ?? "arrow") === "arrow";
  return (
    <EdgeToolbar edgeId={id} x={x} y={y - 22} alignY="bottom" isVisible style={{ zIndex: 20 }}>
      <div className="kasten-toolbar nodrag nopan" role="toolbar" aria-label="Connection">
        <ColorSwatches value={edge.color ?? null} onPick={(color) => restyleEdge(board, id, { color: color ?? "" })} />
        <span className="kasten-toolbar-sep" />
        <button type="button" aria-pressed={startArrow} title="Arrow at the start" aria-label="Arrow at the start" onClick={() => restyleEdge(board, id, { fromEnd: startArrow ? "" : "arrow" })}>
          <ArrowIcon reverse />
        </button>
        <button type="button" aria-pressed={endArrow} title="Arrow at the end" aria-label="Arrow at the end" onClick={() => restyleEdge(board, id, { toEnd: endArrow ? "none" : "" })}>
          <ArrowIcon />
        </button>
        <span className="kasten-toolbar-sep" />
        {LINES.map(({ line, name, d }) => (
          <button key={line} type="button" aria-pressed={(edge.line ?? "curve") === line} title={name} aria-label={name} onClick={() => restyleLine(board, id, { line: line === "curve" ? "" : line })}>
            <LineIcon d={d} />
          </button>
        ))}
        <button type="button" aria-pressed={Boolean(edge.dash)} title="Dashed" aria-label="Dashed" onClick={() => restyleLine(board, id, { dash: !edge.dash })}>
          <LineIcon d="M4 18L20 6" dashed />
        </button>
        <span className="kasten-toolbar-sep" />
        <button type="button" title="Label (double-click the connection)" aria-label="Edit label" onClick={() => board.store.setState({ editing: id })}>
          <span className="text-12 font-semibold">Aa</span>
        </button>
        <span className="kasten-toolbar-sep" />
        <button type="button" title="Delete connection" aria-label="Delete connection" onClick={() => removeFromBoard(board, [], [id])}>
          <Icon name="trash" className="size-4" />
        </button>
      </div>
    </EdgeToolbar>
  );
}

/** The connection's line: the board's curve, straight, or elbowed as in a
 * flowchart. */
const LINES = [
  { line: "curve", name: "Curved line", d: "M4 18C10 18 14 6 20 6" },
  { line: "straight", name: "Straight line", d: "M4 18L20 6" },
  { line: "elbow", name: "Elbow line", d: "M4 18H12V6H20" },
] as const;

function LineIcon({ d, dashed = false }: { d: string; dashed?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? "3 3" : undefined} className="size-4" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function ArrowIcon({ reverse = false }: { reverse?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`size-4 ${reverse ? "rotate-180" : ""}`} aria-hidden="true">
      <path d="M4 12h15M14 7l5 5-5 5" />
    </svg>
  );
}
