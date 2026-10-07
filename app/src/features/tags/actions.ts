// What a tag database's views change: one property of one note (a moved
// kanban card, an edited cell), or a new note carrying the tag. Both go
// through the core's ops, each as one commit.

import type { NoteFile } from "../../lib/vault/types";
import { writeProps } from "../calendar/write";
import { namedByPath } from "../panel/links/related";
import { titleOf } from "../workspace/names";
import { useWorkspace } from "../workspace/store";
import type { NoteHome } from "./home";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Writes waiting per note, so they reach the vault, and a page open on
 * the note, in the order they were made. */
const queues = new Map<string, Promise<NoteFile | null>>();

/** Sets one property of a note (null clears it); the list follows at once.
 * Null when the core refused, which is toasted. */
export function setValue(path: string, key: string, value: unknown): Promise<NoteFile | null> {
  const next = (queues.get(path) ?? Promise.resolve(null)).then(() => write(path, key, value));
  queues.set(path, next);
  void next.then(() => {
    if (queues.get(path) === next) queues.delete(path);
  });
  return next;
}

async function write(path: string, key: string, value: unknown): Promise<NoteFile | null> {
  const { client, noteChanged, filesChanged, toast } = useWorkspace.getState();
  if (!client) return null;
  try {
    const saved = await writeProps(client, path, { [key]: value });
    noteChanged(saved.meta);
    const named = namedByPath(value);
    if (named.length > 0) void filesChanged(named);
    return saved;
  } catch (err) {
    toast(message(err));
    return null;
  }
}

/** A new page carrying `tag` and these properties, made in one commit and
 * not opened, in its database's home (home.ts); the toast offers to open it. */
export async function addNote(tag: string, title: string, props: Record<string, unknown> = {}, home: Partial<NoteHome> = {}): Promise<NoteFile | null> {
  const { create, openPath, toast } = useWorkspace.getState();
  const values = Object.fromEntries(Object.entries(props).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  const note = await create({ kind: "page", title: title.trim(), tags: [tag], props: values, project: home.project ?? null, parent: home.parent ?? null }, false);
  if (note) toast(`Added “${titleOf(note.meta)}” to #${tag}`, { label: "Open", run: () => openPath(note.meta.path) });
  return note;
}
