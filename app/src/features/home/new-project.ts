// "New project" from Home: the sidebar's own name field, opened and focused.

import { useShell } from "../../lib/store";

export function newProject(): void {
  useShell.getState().nameProject(true);
}
