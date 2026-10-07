// Where a note lives, in a few words, to tell apart notes that share a
// title: "in Trip plan" for a sub-page, a project's name, Pages,
// Inbox, Journal or a folder.

import type { NoteMeta } from "../../lib/vault/types";
import { directoryOf } from "./links";
import { titleOf } from "./names";
import { treeOf } from "./tree";

export function whereOf(note: NoteMeta, notes: readonly NoteMeta[]): string {
  const index = treeOf(notes);
  const parent = note.parent ? index.byId.get(note.parent) : undefined;
  if (parent && parent.path !== note.path) return `in ${titleOf(parent)}`;
  if (note.project) {
    const project = index.projectNote.get(note.project);
    return project ? titleOf(project) : note.project;
  }
  if (note.path.startsWith("library/")) return "Pages";
  if (note.path.startsWith("inbox/")) return "Inbox";
  if (note.kind === "journal") return "Journal";
  const folder = note.path.slice(0, Math.max(0, note.path.lastIndexOf("/")));
  return folder || "Vault";
}

/** `whereOf` when other notes share the note's title, else undefined; the
 * file's name is added when even that does not tell them apart. */
export function whereIfShared(note: NoteMeta, notes: readonly NoteMeta[]): string | undefined {
  const namesakes = directoryOf(notes).titled(note.title);
  if (namesakes.length < 2 || !namesakes.some((n) => n.path === note.path)) return undefined;
  const where = whereOf(note, notes);
  const same = namesakes.some((n) => n.path !== note.path && whereOf(n, notes) === where);
  return same ? `${where} · ${note.path.slice(note.path.lastIndexOf("/") + 1)}` : where;
}
