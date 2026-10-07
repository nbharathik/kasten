// The floating toolbar over a selection: colour, card size, wrap in a
// section, layout, open, fold, and take off the board. It keeps its size at
// every zoom and steps aside while things move.

import { NodeToolbar, Position, useStore, type ReactFlowState } from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";

import type { BoardNode } from "../../../../lib/vault/types";
import { useBoard, useBoardState } from "../context";
import { removeFromBoard, setCardSize, setColor, toggleFold, wrapInSection } from "../state/gestures";
import { openFile } from "../state/making";
import { ColorSwatches } from "./ColorSwatches";
import { ToolIcon } from "./icons";
import { LayoutMenu } from "./LayoutMenu";

const SIZES = [
  ["title", "Title only"],
  [null, "Title and first lines"],
  ["expanded", "Whole note"],
] as const;

/** The value every node shares, or null when they differ. */
function shared<T>(nodes: BoardNode[], pick: (n: BoardNode) => T): T | null {
  const first = nodes[0] ? pick(nodes[0]) : null;
  return nodes.every((n) => pick(n) === first) ? first : null;
}

/** Whether the selection's top is too near the top of the view for the
 * toolbar to fit above it. */
function useNearTop(ids: readonly string[]): boolean {
  return useStore(
    useCallback(
      (s: ReactFlowState) => {
        let top = Infinity;
        for (const id of ids) {
          const node = s.nodeLookup.get(id);
          if (node) top = Math.min(top, node.internals.positionAbsolute.y);
        }
        return top * s.transform[2] + s.transform[1] < 64;
      },
      [ids],
    ),
  );
}

export function SelectionBar() {
  const board = useBoard();
  const key = useBoardState((s) => s.nodes.reduce((ids, n) => (n.selected && !n.hidden ? `${ids}${ids ? " " : ""}${n.id}` : ids), ""));
  const busy = useBoardState((s) => s.moving || s.menu !== null || s.editing !== null);
  const doc = useBoardState((s) => s.doc);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const ids = useMemo(() => (key ? key.split(" ") : []), [key]);
  const nearTop = useNearTop(ids);
  if (!key || busy) return null;
  const nodes = ids.map((id) => doc.nodes.find((n) => n.id === id)).filter((n): n is BoardNode => Boolean(n));
  const cards = nodes.filter((n) => n.kind === "file" && n.file?.endsWith(".md") && !n.missing);
  const sections = nodes.filter((n) => n.kind === "group");
  const size = shared(cards, (n) => n.size ?? null);
  return (
    <NodeToolbar nodeId={ids} isVisible position={nearTop ? Position.Bottom : Position.Top} offset={14}>
      <div className="kasten-toolbar nodrag nopan" role="toolbar" aria-label="Selection">
        <ColorSwatches value={shared(nodes, (n) => n.color ?? null)} onPick={(color) => setColor(board, ids, color)} />
        {cards.length > 0 && (
          <>
            <span className="kasten-toolbar-sep" />
            <span className="kasten-segmented" role="group" aria-label="Card size">
              {SIZES.map(([value, label]) => (
                <button key={label} type="button" aria-pressed={size === value && cards.length > 0} title={label} onClick={() => setCardSize(board, cards.map((c) => c.id), value)}>
                  {value === "title" ? "Title" : value === "expanded" ? "Full" : "Preview"}
                </button>
              ))}
            </span>
          </>
        )}
        <span className="kasten-toolbar-sep" />
        <button type="button" title="Wrap in a section" aria-label="Wrap in a section" onClick={() => void wrapInSection(board, ids)}>
          <ToolIcon name="wrap" className="size-4" />
        </button>
        {sections.length === 1 && nodes.length === 1 && (
          <button type="button" title={sections[0]!.collapsed ? "Unfold" : "Fold"} aria-label={sections[0]!.collapsed ? "Unfold section" : "Fold section"} onClick={() => toggleFold(board, sections[0]!.id)}>
            <ToolIcon name="fold" className={`size-4 ${sections[0]!.collapsed ? "-rotate-90" : ""}`} />
          </button>
        )}
        {nodes.length > 1 && (
          <span className="relative inline-flex">
            <button type="button" title="Align and arrange" aria-label="Align and arrange" aria-expanded={layoutOpen} onClick={() => setLayoutOpen((o) => !o)}>
              <ToolIcon name="layout" className="size-4" />
            </button>
            {layoutOpen && (
              <div className="kasten-pop is-below">
                <LayoutMenu onDone={() => setLayoutOpen(false)} />
              </div>
            )}
          </span>
        )}
        {cards.length > 0 && (
          <button type="button" title="Open in the side stack (Enter)" aria-label="Open in the side stack" onClick={() => [...cards].reverse().forEach((c) => openFile(board, c.file!, "stack"))}>
            <ToolIcon name="open" className="size-4" />
          </button>
        )}
        <span className="kasten-toolbar-sep" />
        <button type="button" title="Remove from board (Delete). Notes stay in the vault." aria-label="Remove from board" onClick={() => removeFromBoard(board, ids)}>
          <ToolIcon name="remove" className="size-4" />
        </button>
      </div>
    </NodeToolbar>
  );
}
