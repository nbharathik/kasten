// The board's tools, on its left edge as in tldraw: select,
// hand, draw and erase, and the draw.io-style shapes. Drawing shows the
// pen's widths and colours beside the bar.

import { useState } from "react";

import type { ShapeKind } from "../../../../lib/vault/types";
import { useBoard, useBoardState } from "../context";
import { SHAPES, outlinePath } from "../nodes/outlines";
import { PEN_SIZES, setPen } from "../state/pen";
import { setTool, shapeOfTool, type Tool } from "../state/tools";
import { ColorSwatches } from "./ColorSwatches";

const TOOLS: readonly { tool: Tool; label: string; key: string; d: string }[] = [
  { tool: "select", label: "Select", key: "V", d: "M6 3l12 9-5.5 1.2L16 20l-2.6 1.2-2.7-6.4L6 18.5z" },
  { tool: "hand", label: "Hand", key: "H", d: "M8 12V6.5a1.5 1.5 0 013 0V11m0-5.5v-1a1.5 1.5 0 013 0V11m0-4.5a1.5 1.5 0 013 0V12m0-3a1.5 1.5 0 013 0v5.5a6.5 6.5 0 01-6.5 6.5h-1.2a6 6 0 01-4.8-2.4L4.6 14.9a1.6 1.6 0 012.4-2.1L8 14" },
  { tool: "draw", label: "Draw", key: "D", d: "M4 20l1.2-4.4L15.6 5.2a2.1 2.1 0 013 3L8.2 18.6zM13.5 7.3l3 3" },
  { tool: "erase", label: "Eraser", key: "X", d: "M8.5 20h11M4.4 15.6l9.2-9.2a2 2 0 012.8 0l3.2 3.2a2 2 0 010 2.8L12 20H8.8l-4.4-4.4z" },
];

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function ShapeGlyph({ kind }: { kind: ShapeKind }) {
  const wide = kind !== "ellipse" && kind !== "diamond" && kind !== "triangle";
  const [w, h] = wide ? [20, 13] : [17, 15];
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path transform={`translate(${(24 - w) / 2} ${(24 - h) / 2})`} d={outlinePath(kind, w, h, 1)} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

export function ToolBar() {
  const board = useBoard();
  const tool = useBoardState((s) => s.tool);
  const pen = useBoardState((s) => s.pen);
  const [shapes, setShapes] = useState(false);
  const shape = shapeOfTool(tool);
  const [lastShape, setLastShape] = useState<ShapeKind>("rect");
  const pick = (next: Tool) => {
    setShapes(false);
    setTool(board, next);
  };
  return (
    <div className="kasten-tools" role="toolbar" aria-label="Tools" aria-orientation="vertical" onKeyDown={(e) => e.key === "Escape" && setShapes(false)}>
      {TOOLS.map((t) => (
        <button key={t.tool} type="button" className="kasten-tool" aria-pressed={tool === t.tool} aria-label={t.label} title={`${t.label} (${t.key})`} onClick={() => pick(t.tool)}>
          <Glyph d={t.d} />
        </button>
      ))}
      <span className="kasten-tools-sep" />
      <span className="relative inline-flex">
        <button
          type="button"
          className="kasten-tool"
          aria-pressed={Boolean(shape)}
          aria-expanded={shapes}
          aria-label="Shapes"
          title="Shapes (R rectangle, O ellipse)"
          onClick={() => (shape ? setShapes((open) => !open) : (setTool(board, `shape:${lastShape}`), setShapes(true)))}
        >
          <ShapeGlyph kind={shape ?? lastShape} />
        </button>
        {shapes && (
          <div className="kasten-pop kasten-shapes" role="group" aria-label="Shapes">
            {SHAPES.map(({ kind, name }) => (
              <button
                key={kind}
                type="button"
                className="kasten-tool"
                aria-pressed={shape === kind}
                aria-label={name}
                title={name}
                onClick={() => {
                  setLastShape(kind);
                  pick(`shape:${kind}`);
                }}
              >
                <ShapeGlyph kind={kind} />
              </button>
            ))}
          </div>
        )}
      </span>
      {tool === "draw" && (
        <div className="kasten-pop kasten-pen" role="group" aria-label="Pen">
          {PEN_SIZES.map((size) => (
            <button key={size} type="button" className="kasten-tool" aria-pressed={pen.size === size} aria-label={`Width ${size}`} title={`Width ${size}`} onClick={() => setPen(board, { size })}>
              <span className="kasten-pen-dot" style={{ width: size + 2, height: size + 2 }} />
            </button>
          ))}
          <span className="kasten-tools-sep" />
          <ColorSwatches value={pen.color} onPick={(color) => setPen(board, { color })} />
        </div>
      )}
    </div>
  );
}
