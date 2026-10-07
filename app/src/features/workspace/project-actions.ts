// What the Projects list does to projects. The order and the pins
// are window preferences; archiving writes `archived: true` into the
// project page with the core's `update_props` op, one commit, and moves or
// deletes nothing. Pages dropped on a project move into it with the core's
// move op.

import { useMemo } from "react";

import type { NoteMeta } from "../../lib/vault/types";
import { writeProps } from "../calendar/write";
import { titleOf } from "./names";
import { usePrefs } from "./prefs";
import { arrangeProjects, partitionArchived, reorder } from "./project-order";
import { useWorkspace } from "./store";
import { nestNote } from "./placing";
import { projects, treeOf } from "./tree";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Projects in use, arranged as the person set them, and archived ones by
 * title. Only a change to a project or to the arrangement redraws. */
export function useProjectLists(): { active: NoteMeta[]; archived: NoteMeta[] } {
  const all = useWorkspace((s) => projects(s.notes));
  const projectOrder = usePrefs((s) => s.projectOrder);
  const pinnedProjects = usePrefs((s) => s.pinnedProjects);
  return useMemo(() => {
    const { active, archived } = partitionArchived(all);
    return { active: arrangeProjects(active, { projectOrder, pinnedProjects }), archived };
  }, [all, projectOrder, pinnedProjects]);
}

/** Moves the shown project at `from` to `to` (within its group) and saves
 * the order. `shown` is every shown project's key, in order. False when
 * nothing changed. */
export function moveProject(shown: readonly string[], from: number, to: number): boolean {
  const prefs = usePrefs.getState();
  const next = reorder(prefs, shown, from, to);
  const same = next.length === prefs.projectOrder.length && next.every((key, i) => key === prefs.projectOrder[i]);
  if (!same) prefs.set({ projectOrder: next });
  return !same;
}

/** What lives in a project's pages or cards, and so moves in and out. */
const MOVES = new Set(["page", "card", "highlight"]);

/** What dropping notes on a project (with null, on Pages) does to each:
 * moves it there, or, when it is there inside a page, takes it out to the
 * top. Pages, cards and highlights go to a project; pages to Pages. */
export function droppedOn(notes: readonly NoteMeta[], paths: readonly string[], project: string | null): { note: NoteMeta; unnest: boolean }[] {
  const index = treeOf(notes);
  const out: { note: NoteMeta; unnest: boolean }[] = [];
  for (const path of paths) {
    const note = index.byPath.get(path);
    if (!note || !(project === null ? note.kind === "page" : MOVES.has(note.kind))) continue;
    const there = project === null ? note.path.startsWith("library/") : note.project === project;
    if (!there) out.push({ note, unnest: false });
    else if (note.parent && index.byId.get(note.parent)?.kind === "page") out.push({ note, unnest: true });
  }
  return out;
}

/** Moves the notes dropped on a project, or on Pages with null, there;
 * with `unnest` false, sub-pages already there stay in their page. */
export async function moveInto(paths: readonly string[], project: string | null, unnest = true): Promise<void> {
  const ws = useWorkspace.getState();
  for (const dropped of droppedOn(ws.notes, paths, project)) {
    if (!dropped.unnest) await ws.move(dropped.note.path, project);
    else if (unnest) await nestNote(dropped.note.path, null);
  }
}

/**
 * Archives a project, or brings it back: `archived: true` in its page's
 * properties, or the property removed. A page open on it writes its typing
 * first and takes the change in. The toast offers Undo, which says what it
 * did without offering another. False when the core refused (toasted).
 */
export async function setArchived(note: NoteMeta, archived: boolean, undo = true): Promise<boolean> {
  const { client, noteChanged, toast } = useWorkspace.getState();
  if (!client) return false;
  let saved;
  try {
    saved = await writeProps(client, note.path, { archived: archived ? true : null });
  } catch (err) {
    toast(message(err));
    return false;
  }
  noteChanged(saved.meta);
  const title = titleOf(saved.meta);
  const meta = saved.meta;
  toast(archived ? `Archived “${title}”` : `“${title}” is back in Projects`, undo ? { label: "Undo", run: () => void setArchived(meta, !archived, false) } : undefined);
  return true;
}
