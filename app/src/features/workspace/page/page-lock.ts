// A locked page is read-only for agents: `locked: true` in its frontmatter,
// which the core honours for every agent op and lets only a person change.
// The page menu and the palette switch it for the open page.

import type { NoteMeta } from "../../../lib/vault/types";
import { useWorkspace } from "../store";
import { pageFor } from "./open-page";

export async function setLocked(note: NoteMeta, locked: boolean): Promise<void> {
  const ws = useWorkspace.getState();
  const value = locked ? "true" : null;
  const session = pageFor(note.path);
  try {
    if (session) {
      // Through the open page, so its next save builds on this one.
      session.editHeader("locked", value);
      await session.flush();
    } else if (ws.client) {
      ws.noteChanged((await ws.client.setMeta(note.path, "locked", value)).meta);
    } else return;
  } catch (err) {
    return ws.toast(err instanceof Error ? err.message : String(err));
  }
  const now = useWorkspace.getState().notes.find((n) => n.path === note.path) ?? note;
  ws.toast(locked ? "Locked: agents can read this page but not change it" : "Unlocked: agents can change this page again", {
    label: "Undo",
    run: () => void setLocked(now, !locked),
  });
}
