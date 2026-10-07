import { memo } from "react";

import type { BoardNode, BoardView } from "../../lib/vault/types";
import { outlinePath, strokeBox, strokePath } from "./canvas/nodes/outlines";
import { canvasColor } from "./colors";

/** Enough boxes to show a board's shape; the rest would not be seen. */
const MOST = 400;

const FILL: Record<string, string> = {
  group: "color-mix(in srgb, var(--color-accent) 7%, transparent)",
  file: "var(--color-canvas)",
  text: "color-mix(in srgb, #dfab01 16%, var(--color-canvas))",
  link: "color-mix(in srgb, #0b6e99 12%, var(--color-canvas))",
};

/** A drawn stroke as a thin line in its box. */
function Stroke({ node, color }: { node: BoardNode; color: string }) {
  const { points, width, height } = strokeBox(node.draw!);
  return (
    <svg x={node.x} y={node.y} width={Math.max(node.width, 1)} height={Math.max(node.height, 1)} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" overflow="visible">
      <path d={strokePath(points)} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A board in miniature: sections, cards, stickies and links as boxes,
 * shapes by their outlines, drawings as lines and connections as lines,
 * fitted into the space given. */
export const BoardThumb = memo(function BoardThumb({ board }: { board: BoardView | null }) {
  if (!board) return <div className="size-full animate-pulse bg-hover/60" aria-hidden="true" />;
  const nodes = board.nodes.slice(0, MOST);
  if (nodes.length === 0) return <div className="grid size-full place-items-center text-12 text-muted">Empty board</div>;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const n of nodes) {
    left = Math.min(left, n.x);
    top = Math.min(top, n.y);
    right = Math.max(right, n.x + n.width);
    bottom = Math.max(bottom, n.y + n.height);
  }
  const pad = Math.max(40, (right - left) * 0.06);
  const box = `${left - pad} ${top - pad} ${right - left + pad * 2} ${bottom - top + pad * 2}`;
  const at = new Map(nodes.map((n) => [n.id, n]));
  return (
    <svg viewBox={box} preserveAspectRatio="xMidYMid meet" className="size-full" aria-hidden="true">
      {board.edges.map((e) => {
        const a = at.get(e.from);
        const b = at.get(e.to);
        if (!a || !b) return null;
        return (
          <line
            key={e.id}
            x1={a.x + a.width / 2}
            y1={a.y + a.height / 2}
            x2={b.x + b.width / 2}
            y2={b.y + b.height / 2}
            stroke={canvasColor(e.color) ?? "var(--color-muted)"}
            strokeOpacity={0.55}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {nodes.map((n) => {
        const tint = canvasColor(n.color);
        if (n.draw) return <Stroke key={n.id} node={n} color={tint ?? "var(--color-ink)"} />;
        if (n.shape) {
          return (
            <path
              key={n.id}
              transform={`translate(${n.x} ${n.y})`}
              d={outlinePath(n.shape, Math.max(n.width, 1), Math.max(n.height, 1), 0)}
              fill={tint ? `color-mix(in srgb, ${tint} 18%, var(--color-canvas))` : "var(--color-canvas)"}
              stroke={tint ?? "var(--color-muted)"}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        return (
          <rect
            key={n.id}
            x={n.x}
            y={n.y}
            width={Math.max(n.width, 1)}
            height={Math.max(n.height, 1)}
            rx={n.kind === "group" ? 18 : 12}
            fill={tint ? `color-mix(in srgb, ${tint} ${n.kind === "group" ? 8 : 18}%, var(--color-canvas))` : (FILL[n.kind] ?? FILL.file)}
            stroke={tint ?? "var(--color-line)"}
            strokeWidth={1}
            strokeDasharray={n.missing ? "4 3" : undefined}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
});
