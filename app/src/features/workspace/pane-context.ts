// Which pane a view is in, for what each pane keeps to itself (its right
// panel). A view outside the panes, such as a test's page, belongs to the
// focused pane.

import { createContext, useContext } from "react";

import { useWorkspace } from "./store";

export const PaneContext = createContext<string | null>(null);

export function usePaneId(): string {
  const own = useContext(PaneContext);
  const focus = useWorkspace((s) => s.layout.focus);
  return own ?? focus;
}
