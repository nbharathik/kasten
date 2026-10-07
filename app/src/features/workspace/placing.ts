// Where a note sits (its project and the page it is in), putting a page
// inside another as in Notion, and putting a note back where it sat, so a
// move or a nest can be undone from its notice.

import type { NoteFile, NoteMeta, Placed } from "../../lib/vault/types";
import { titleOf } from "./names";
import { flushOpenPage } from "./page/open-page";
import { useWorkspace } from "./store";
import { isWithin, noteAt, treeOf } from "./tree";

export interface Spot {
  project: string | null;
  /** The path of the page it is in, if any. */
  parent: string | null;
  /** It was waiting in the inbox. */
  inbox?: boolean;
}

/** Where the note at `path` sits now. */
export function spotOf(notes: readonly NoteMeta[], path: string): Spot | null {
  const note = noteAt(notes, path);
  if (!note) return null;
  const parent = note.parent ? treeOf(notes).byId.get(note.parent) : undefined;
  return { project: note.project ?? null, parent: parent && parent.path !== note.path ? parent.path : null, inbox: note.path.startsWith("inbox/") };
}

/** The notes among `paths` that can go inside the page `into`: pages and
 * cards, not it, not in it already, and not a page it is inside. */
export function nestable(notes: readonly NoteMeta[], paths: readonly string[], into: NoteMeta): NoteMeta[] {
  return paths
    .map((path) => noteAt(notes, path))
    .filter((n): n is NoteMeta => n !== undefined && (n.kind === "page" || n.kind === "card") && n.path !== into.path)
    .filter((n) => !(into.id && n.parent === into.id) && !isWithin(notes, into.path, n));
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Puts the page at `path` inside the page at `parent`, or with null makes
 * it a page of its own; the notice offers Undo unless `undo` is false. */
export async function nestNote(path: string, parent: string | null, undo = true): Promise<NoteFile | null> {
  const ws = useWorkspace.getState();
  if (!ws.client) return null;
  const spot = spotOf(ws.notes, path);
  await flushOpenPage();
  let note: Placed;
  try {
    note = await ws.client.nest(path, parent);
  } catch (err) {
    ws.toast(message(err));
    return null;
  }
  await useWorkspace.getState().renamed(path, { note, relinked: note.relinked }, note.moves);
  if (undo) {
    const into = parent ? noteAt(useWorkspace.getState().notes, parent) : undefined;
    const text = into ? `Put “${titleOf(note.meta)}” in “${titleOf(into)}”` : `“${titleOf(note.meta)}” is a page of its own`;
    ws.toast(text, spot ? { label: "Undo", run: () => void putBack(note.meta.path, spot) } : undefined);
  }
  return note;
}

/** Puts the note now at `path` back at `spot`, without a notice of its own. */
export async function putBack(path: string, spot: Spot): Promise<void> {
  if (spot.inbox) {
    if (path.startsWith("inbox/")) return;
    const ws = useWorkspace.getState();
    try {
      const note = await ws.client!.moveToInbox(path);
      await useWorkspace.getState().renamed(path, { note, relinked: note.relinked }, note.moves);
    } catch (err) {
      ws.toast(message(err));
    }
    return;
  }
  if (spot.parent) {
    await nestNote(path, spot.parent, false);
    return;
  }
  let at = path;
  const now = noteAt(useWorkspace.getState().notes, path);
  if ((now?.project ?? null) !== spot.project) at = (await useWorkspace.getState().move(path, spot.project, true)) ?? path;
  if (noteAt(useWorkspace.getState().notes, at)?.parent) await nestNote(at, null, false);
}
