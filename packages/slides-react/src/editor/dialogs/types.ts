import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";

/** What a dialog is given: the session and the window, and how to close itself. */
export interface DialogProps {
  session: EditorSession;
  ui: EditorUi;
  onClose(): void;
}
