// The presentation's controls, faint at the bottom until the
// pointer comes near: back, where the talk is, on, and the way out.

import { useMemo } from "react";

import { useBoard, useBoardState } from "../context";
import { slides } from "../model/slides";
import { step, stopPresenting } from "../state/present";
import { ToolIcon } from "./icons";

export function PresentBar() {
  const board = useBoard();
  const at = useBoardState((s) => s.presenting);
  const doc = useBoardState((s) => s.doc);
  const deck = useMemo(() => slides(doc.nodes), [doc]);
  if (at === null || deck.length === 0) return null;
  const slide = deck[Math.min(at, deck.length - 1)]!;
  return (
    <div className="kasten-present" role="toolbar" aria-label="Presentation">
      <button type="button" className="kasten-tool" aria-label="Previous slide" title="Previous (←)" disabled={at === 0} onClick={() => step(board, -1)}>
        <ToolIcon name="chevron-left" />
      </button>
      <span className="kasten-present-where" aria-live="polite">
        {slide.label && <span className="kasten-present-label">{slide.label}</span>}
        <span>
          {at + 1} / {deck.length}
        </span>
      </span>
      <button type="button" className="kasten-tool" aria-label="Next slide" title="Next (→ or Space)" disabled={at >= deck.length - 1} onClick={() => step(board, 1)}>
        <ToolIcon name="chevron" />
      </button>
      <span className="kasten-toolbar-sep" />
      <button type="button" className="kasten-tool" aria-label="End the presentation" title="End (Esc)" onClick={() => stopPresenting(board)}>
        <ToolIcon name="close" />
      </button>
    </div>
  );
}
