// Bulk actions on the Card Library's selection, the sidebar's picked pages
// and the Inbox's picked captures. Each goes note by note through the
// vault client or the workspace store, so every change is an ordinary core
// op; one failure skips one note. Each gives one notice for all, with one
// Undo that takes the whole action back.

import type { NoteMeta, VaultClient } from "../../lib/vault/types";
import { titleOf } from "../workspace/names";
import { putBack, spotOf, type Spot } from "../workspace/placing";
import { ancestors, movable } from "../workspace/tree";

/** What a bulk action did: the notice, and how to take it all back. */
export interface Done {
  text: string;
  undo?: () => Promise<void>;
}

export interface BulkDeps {
  client: VaultClient;
  /** The notes as they are now (the store's list). */
  notes: () => NoteMeta[];
  noteChanged(meta: NoteMeta): void;
  /** Reloads the store's whole list. */
  refresh(): Promise<void>;
  /** The store's move and trash, quiet (the action gives one notice for
   * all): the note's new path, or null when it failed, which the store
   * reports itself. */
  move(path: string, project: string | null): Promise<string | null>;
  trash(path: string): Promise<string | null>;
  /** Called after each note, for a progress count. */
  progress?(done: number, total: number): void;
  /** What the summaries call the notes: cards in the library, pages in the sidebar. */
  noun?: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** "#Idea " as a tag, or null when it is not one: letters, digits, - _ and /. */
export function cleanTag(text: string): string | null {
  const tag = text.trim().replace(/^#+/, "");
  return /^[\p{L}\p{N}_\-/]+$/u.test(tag) ? tag : null;
}

/** " (2 already had it; 1 failed: reason)" style endings. */
function tail(parts: (string | false)[]): string {
  const shown = parts.filter(Boolean);
  return shown.length ? ` (${shown.join("; ")})` : "";
}

/** Up to this many changed notes go into the store one by one; past it,
 * one reload is cheaper than re-sorting a big list for each. */
const ONE_BY_ONE = 5;

/** Changes the tags of each of `paths` as `edit` says, taking the results
 * into the store; the notes it changed, and the reasons any failed. */
async function retag(deps: BulkDeps, paths: readonly string[], edit: (note: NoteMeta | undefined) => [string[], string[]] | null) {
  const byPath = new Map(deps.notes().map((n) => [n.path, n]));
  const changed: NoteMeta[] = [];
  const failed: string[] = [];
  let skipped = 0;
  for (const [i, path] of paths.entries()) {
    const change = edit(byPath.get(path));
    if (!change) skipped++;
    else {
      try {
        changed.push((await deps.client.setTags(path, ...change)).meta);
      } catch (err) {
        failed.push(errorText(err));
      }
    }
    deps.progress?.(i + 1, paths.length);
  }
  if (changed.length > ONE_BY_ONE) await deps.refresh();
  else changed.forEach(deps.noteChanged);
  return { changed: changed.map((n) => n.path), failed, skipped };
}

const has = (note: NoteMeta | undefined, tag: string) => note?.tags.find((t) => t.toLowerCase() === tag.toLowerCase());

/** Adds `tag` to each note that lacks it; Undo takes it off those again. */
export async function addTag(deps: BulkDeps, paths: string[], tag: string): Promise<Done> {
  const { changed, failed, skipped } = await retag(deps, paths, (note) => (has(note, tag) ? null : [[tag], []]));
  return {
    text: `Tagged ${plural(changed.length, deps.noun ?? "card")} #${tag}${tail([skipped > 0 && `${skipped} already had it`, failed.length > 0 && `${failed.length} failed: ${failed[0]}`])}`,
    undo: changed.length ? async () => void (await retag(deps, changed, () => [[], [tag]])) : undefined,
  };
}

/** Takes `tag` off each note that has it; Undo puts it back. */
export async function removeTag(deps: BulkDeps, paths: string[], tag: string): Promise<Done> {
  const spelled = new Map<string, string>();
  const { changed, failed, skipped } = await retag(deps, paths, (note) => {
    const found = has(note, tag);
    if (!found || !note) return null;
    spelled.set(note.path, found);
    return [[], [found]];
  });
  return {
    text: `Took #${tag} off ${plural(changed.length, deps.noun ?? "card")}${tail([skipped > 0 && `${skipped} didn't have it`, failed.length > 0 && `${failed.length} failed: ${failed[0]}`])}`,
    undo: changed.length ? async () => void (await Promise.all(changed.map((path) => retag(deps, [path], () => [[spelled.get(path) ?? tag], []])))) : undefined,
  };
}

/** Moves each page and card to a project, or with null to Pages. Sub-pages
 * of a page that moves go with it; journal days and projects stay. Undo
 * puts each back where it was, inside its page if it was in one. */
export async function moveTo(deps: BulkDeps, paths: string[], project: string | null, where: string): Promise<Done> {
  const notes = deps.notes();
  const chosen = paths.map((p) => notes.find((n) => n.path === p)).filter((n): n is NoteMeta => Boolean(n));
  const here = (n: NoteMeta) => (project ? n.project === project : !n.project && n.path.startsWith("library/"));
  const fixed = chosen.filter((n) => !movable(n));
  const already = chosen.filter((n) => movable(n) && here(n));
  const moving = chosen.filter((n) => movable(n) && !here(n));
  const going = new Set(moving.map((n) => n.path));
  const todo = moving.filter((n) => !ancestors(notes, n).some((a) => going.has(a.path)));
  const back: [string, Spot][] = [];
  for (const [i, note] of todo.entries()) {
    const spot = spotOf(notes, note.path);
    const to = await deps.move(note.path, project);
    if (to && spot) back.push([to, spot]);
    deps.progress?.(i + 1, todo.length);
  }
  // A failed move the store reported itself; that note is still where it was.
  const now = new Set(deps.notes().map((n) => n.path));
  const moved = moving.filter((n) => !now.has(n.path));
  const extra = tail([
    already.length > 0 && `${already.length} ${already.length === 1 ? "was" : "were"} there already`,
    fixed.length > 0 && `${plural(fixed.length, "journal day or project", "journal days or projects")} can't move`,
    moving.length > moved.length && `${moving.length - moved.length} failed`,
  ]);
  const what = moved.length === 1 && !extra ? `“${titleOf(moved[0]!)}”` : plural(moved.length, deps.noun ?? "card");
  return {
    text: `Moved ${what} to ${where}${extra}`,
    undo: back.length ? async () => void (await Promise.all(back.map(([path, spot]) => putBack(path, spot)))) : undefined,
  };
}

/** Puts the notes on a board, in the order given, laid out in a grid. */
export async function addToBoard(deps: BulkDeps, paths: string[], board: { path: string; title: string }): Promise<Done> {
  const added = await deps.client.addToBoard(board.path, paths, "grid");
  const already = added.nodes.length - added.created.length;
  return { text: `Added ${plural(added.created.length, deps.noun ?? "card")} to “${board.title}”${tail([already > 0 && `${already} ${already === 1 ? "was" : "were"} on it already`])}` };
}

/** Moves each note to the trash; Undo brings them all back. */
export async function trashAll(deps: BulkDeps, paths: string[]): Promise<Done> {
  const titles = new Map(deps.notes().map((n) => [n.path, titleOf(n)]));
  const trashed: string[] = [];
  let failed = 0;
  for (const [i, path] of paths.entries()) {
    // A sub-page may have gone already, with its page.
    if (!deps.notes().some((n) => n.path === path)) {
      if (!titles.has(path)) failed++;
    } else {
      const to = await deps.trash(path);
      if (to) trashed.push(to);
      else failed++;
    }
    deps.progress?.(i + 1, paths.length);
  }
  const what = trashed.length === 1 && failed === 0 && paths.length === 1 ? `“${titles.get(paths[0]!) ?? paths[0]}”` : plural(trashed.length, deps.noun ?? "card");
  return {
    text: `Moved ${what} to the trash${tail([failed > 0 && `${failed} failed`])}`,
    undo: trashed.length
      ? async () => {
          for (const t of trashed) await (t.endsWith(".canvas") ? deps.client.restoreBoard(t) : t.endsWith(".deck") ? deps.client.restoreDeck(t) : deps.client.restore(t));
          await deps.refresh();
        }
      : undefined,
  };
}

/** Shows what a bulk action did, with its Undo. */
export function announce(done: Done, toast: (text: string, action?: { label: string; run: () => void }) => void): void {
  const { undo } = done;
  toast(done.text, undo ? { label: "Undo", run: () => void undo().catch((err: unknown) => toast(errorText(err))) } : undefined);
}

/** The project a new board belongs in: the one every note shares, if any. */
export function sharedProject(notes: NoteMeta[]): string | null {
  const first = notes[0]?.project ?? null;
  return first && notes.every((n) => n.project === first) ? first : null;
}
