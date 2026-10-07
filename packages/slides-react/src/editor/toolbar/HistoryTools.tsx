import type { JSX } from "react";

import { historyLabel } from "../menus/history-label.ts";
import { zoomItems, zoomText } from "../menus/items-view.ts";
import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import { useEditor } from "../useEditor.ts";
import { useUiState } from "../useUi.ts";
import { capturePaint } from "./paint.ts";
import { CommandButton, MenuButton, ToolButton } from "./ToolButton.tsx";

/** Undo and redo, which say what they would undo, and the paint format brush. */
export function HistoryTools({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element {
  const state = useEditor(session);
  const { paint, text } = useUiState(ui);
  const ctx = { session, ui };
  // The brush copies the look of what is selected or being typed in; it can always be put down again.
  const canTake = paint !== null || text !== null || state.selection.length > 0;
  return (
    <>
      <CommandButton id="edit.undo" ctx={ctx} label={historyLabel("Undo", state.undoLabel)} />
      <CommandButton id="edit.redo" ctx={ctx} label={historyLabel("Redo", state.redoLabel)} />
      <ToolButton
        icon="paintbrush"
        label="Paint format"
        className="ks-tb-paint"
        on={paint !== null}
        disabled={!canTake}
        onClick={() => {
          if (paint) return ui.setPaint(null);
          const taken = capturePaint(ctx);
          if (taken) ui.setPaint(taken);
        }}
      />
    </>
  );
}

/** The zoom of the slide: what it is now, and the levels to pick. */
export function ZoomTool({ ui, session }: { ui: EditorUi; session: EditorSession }): JSX.Element {
  const { zoom } = useUiState(ui);
  const ctx = { session, ui };
  return <MenuButton ui={ui} label="Zoom" className="ks-tb-zoom" text={zoomText(zoom)} items={() => zoomItems(ctx)} />;
}
