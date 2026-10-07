// What "Move to" offers a note: Pages, each project, and, for a page, the
// pages it can go inside as in Notion, found by what is typed. Where a page
// sits inside another, its own place takes it out to the top.

import type { NoteMeta } from "../../../lib/vault/types";
import { lineIcon } from "../../../ui/glyph";
import { iconOf, titleOf } from "../names";
import { nestable, nestNote } from "../placing";
import { useWorkspace } from "../store";
import { projects, treeOf } from "../tree";
import { whereOf } from "../where";
import { scoreLower } from "./match";

/** What picking a place does. */
export type Go =
  | { kind: "move"; project: string | null }
  | { kind: "nest"; parent: string | null }
  | { kind: "create"; title: string };

export interface Place {
  key: string;
  icon: string;
  label: string;
  detail: string;
  go: Go;
  /** The note is here now, so there is nothing to do. */
  here?: boolean;
}

/** How many pages a typed name lists at most. */
const PAGES_SHOWN = 8;

export function placesFor(notes: readonly NoteMeta[], note: NoteMeta | undefined, query: string): Place[] {
  const name = query.trim();
  const q = name.toLowerCase();
  const index = treeOf(notes);
  const all = projects(notes);
  const holder = note?.parent ? index.byId.get(note.parent) : undefined;
  const inside = holder?.kind === "page" && holder.path !== note?.path ? holder : undefined;

  const spot = (key: string, icon: string, label: string, detail: string, project: string | null): Place => {
    const there = note && (project ? note.project === project : !note.project && note.path.startsWith("library/"));
    if (!there) return { key, icon, label, detail, go: { kind: "move", project } };
    if (inside) return { key, icon, label, detail: `Take it out of “${titleOf(inside)}”`, go: { kind: "nest", parent: null } };
    return { key, icon, label, detail: "It is here now", go: { kind: "move", project }, here: true };
  };
  const places = [
    spot("library", lineIcon("page"), "Pages", "Not in a project", null),
    ...all.map((p) => spot(p.path, iconOf(p), titleOf(p), "Project", p.project ?? null)),
  ].filter((p) => !q || p.label.toLowerCase().includes(q));

  if (note?.kind === "page" && q) places.push(...pagesFor(notes, note, q, inside));
  if (name && !all.some((p) => titleOf(p).toLowerCase() === q)) {
    places.push({ key: "new", icon: lineIcon("plus"), label: `New project “${name}”`, detail: "Make it, and put the page there", go: { kind: "create", title: name } });
  }
  return places;
}

/** The pages whose title matches `q` that `note` can go inside, best first,
 * and the page it is in now. */
function pagesFor(notes: readonly NoteMeta[], note: NoteMeta, q: string, inside: NoteMeta | undefined): Place[] {
  const scored: { page: NoteMeta; score: number }[] = [];
  for (const page of notes) {
    if (page.kind !== "page") continue;
    const score = scoreLower(titleOf(page).toLowerCase(), q);
    if (score > 0 && (page === inside || nestable(notes, [note.path], page).length > 0)) scored.push({ page, score });
  }
  scored.sort((a, b) => b.score - a.score || titleOf(a.page).localeCompare(titleOf(b.page)));
  return scored.slice(0, PAGES_SHOWN).map(({ page }) => ({
    key: `page:${page.path}`,
    icon: iconOf(page),
    label: titleOf(page),
    detail: page === inside ? "It is in this page now" : `Page · ${whereOf(page, notes)}`,
    go: { kind: "nest", parent: page.path },
    here: page === inside,
  }));
}

/** Does what picking a place for the note at `path` says. */
export async function goTo(path: string, go: Go): Promise<void> {
  const ws = useWorkspace.getState();
  if (go.kind === "move") {
    await ws.move(path, go.project);
  } else if (go.kind === "nest") {
    await nestNote(path, go.parent);
  } else {
    const made = await ws.create({ kind: "project", title: go.title, template: null }, false);
    if (made?.meta.project) await ws.move(path, made.meta.project);
  }
}
