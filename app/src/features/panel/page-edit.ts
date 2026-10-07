// Changes the panel makes to the open note (properties, tags, a restored
// version) go through the vault client, then into the page's session, so
// the next body save builds on them instead of merging or conflicting.

import type { NoteFile, VaultClient } from "../../lib/vault/types";
import { pageView, type PageView } from "../workspace/page/open-page";
import type { PageSession } from "../workspace/page/page-session";
import { useWorkspace } from "../workspace/store";

/** Starts the page again on `note`, keeping the reader's place. */
export type Reload = (note: NoteFile, keep?: PageView | null) => void;

/** The open page, as the panel's tabs reach it. */
export interface PanelPage {
  client: VaultClient;
  session: PageSession;
  onReload: Reload;
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Edits waiting per page, so they reach the vault and the session in order. */
const queues = new WeakMap<PageSession, Promise<unknown>>();

/**
 * Runs `edit`, which changes only the note's frontmatter, and takes the
 * result into the open page. Typing that waits is written first, so the
 * session can adopt the change; when it cannot, the page reloads from disk.
 * An error (such as a property the tag's schema refuses) becomes a toast,
 * and the result is null. Edits run one after another.
 */
export function editFrontmatter(page: PanelPage, edit: () => Promise<NoteFile>): Promise<NoteFile | null> {
  const next = (queues.get(page.session) ?? Promise.resolve()).then(() => apply(page, edit));
  queues.set(page.session, next);
  return next;
}

async function apply(page: PanelPage, edit: () => Promise<NoteFile>): Promise<NoteFile | null> {
  const { client, session, onReload } = page;
  try {
    await session.flush();
    const note = await edit();
    useWorkspace.getState().noteChanged(note.meta);
    if (!session.adopt(note)) {
      await session.flush();
      onReload(await client.read(note.meta.path), pageView(session));
    }
    return note;
  } catch (err) {
    useWorkspace.getState().toast(errorText(err));
    return null;
  }
}
