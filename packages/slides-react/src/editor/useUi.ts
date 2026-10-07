import { useSyncExternalStore } from "react";

import type { EditorUi, UiState } from "./ui-state.ts";

/** The window-level state of the editor (views, panels, zoom), and a re-render when it changes. */
export function useUiState(ui: EditorUi): UiState {
  return useSyncExternalStore(ui.subscribe, ui.getSnapshot, ui.getSnapshot);
}
