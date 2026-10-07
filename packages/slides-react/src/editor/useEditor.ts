import { useSyncExternalStore } from "react";

import type { EditorSession } from "./session/session.ts";
import type { EditorState } from "./session/types.ts";

/** The editor's state, and a re-render when it changes. */
export function useEditor(session: EditorSession): EditorState {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

/** One part of the state; the view re-renders only when that part changes. */
export function useEditorValue<T>(session: EditorSession, select: (state: EditorState) => T): T {
  return useSyncExternalStore(
    session.subscribe,
    () => select(session.getSnapshot()),
    () => select(session.getSnapshot()),
  );
}
