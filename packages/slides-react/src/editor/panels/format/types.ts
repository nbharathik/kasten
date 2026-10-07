import type { Element, Theme } from "@kasten-slides/wasm";

import type { EditorSession } from "../../session/session.ts";
import type { EditorUi } from "../../ui-state.ts";

/** What a section of the format panel is given: the elements it acts on (only those it applies to). */
export interface SectionProps {
  session: EditorSession;
  ui: EditorUi;
  elements: readonly Element[];
  theme: Theme;
}

/** What the panel's tabs are given: the session and the window, as every region is. */
export interface PanelProps {
  session: EditorSession;
  ui: EditorUi;
}
