// Top right: undo and redo, zoom out and in (the percentage resets to
// 100 %), fit everything in view, the minimap, presenting, and the keys.

import { useReactFlow, useStore } from "@xyflow/react";

import { motionMs } from "../../../../lib/motion";
import { useBoard, useBoardState } from "../context";
import { present } from "../state/present";
import { ToolIcon } from "./icons";

const percent = (s: { transform: [number, number, number] }) => Math.round(s.transform[2] * 100);

export function ZoomBar({ minimap, onMinimap, onHelp }: { minimap: boolean; onMinimap: () => void; onHelp: () => void }) {
  const board = useBoard();
  const flow = useReactFlow();
  const zoom = useStore(percent);
  const canUndo = useBoardState((s) => s.canUndo);
  const canRedo = useBoardState((s) => s.canRedo);
  return (
    <div className="kasten-zoombar" role="toolbar" aria-label="View">
      <button type="button" className="kasten-tool" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => void board.undo()}>
        <ToolIcon name="undo" />
      </button>
      <button type="button" className="kasten-tool" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => void board.redo()}>
        <ToolIcon name="redo" />
      </button>
      <span className="kasten-toolbar-sep" />
      <button type="button" className="kasten-tool" aria-label="Zoom out" title="Zoom out (−, Ctrl+scroll)" onClick={() => void flow.zoomOut({ duration: motionMs(180) })}>
        <ToolIcon name="minus" />
      </button>
      <button type="button" className="kasten-zoom-value" aria-label={`Zoom ${zoom}%, reset to 100%`} title="Back to 100% (Shift+0)" onClick={() => void flow.zoomTo(1, { duration: motionMs(180) })}>
        {zoom}%
      </button>
      <button type="button" className="kasten-tool" aria-label="Zoom in" title="Zoom in (+, Ctrl+scroll)" onClick={() => void flow.zoomIn({ duration: motionMs(180) })}>
        <ToolIcon name="plus" />
      </button>
      <button type="button" className="kasten-tool" aria-label="Fit to view" title="Fit everything in view (F)" onClick={() => void flow.fitView({ padding: 0.12, duration: motionMs(260), maxZoom: 1 })}>
        <ToolIcon name="fit" />
      </button>
      <button type="button" className="kasten-tool" aria-label="Minimap" aria-pressed={minimap} title="Minimap (M)" onClick={onMinimap}>
        <ToolIcon name="map" />
      </button>
      <button type="button" className="kasten-tool" aria-label="Present" title="Present the sections as slides (P)" onClick={() => present(board)}>
        <ToolIcon name="present" />
      </button>
      <button type="button" className="kasten-tool" aria-label="Board keys" title="Board keys (?)" onClick={onHelp}>
        <ToolIcon name="keyboard" />
      </button>
    </div>
  );
}
