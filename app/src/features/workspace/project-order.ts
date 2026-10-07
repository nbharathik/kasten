// How the Projects list is arranged: dragged into order, pinned or
// archived. The order and the pins are window preferences
// holding project folder names; archiving is `archived: true` in the
// project page's properties. Everything here is pure.

import type { NoteMeta } from "../../lib/vault/types";

export interface Arrangement {
  /** Project folders in the order the person arranged them. */
  projectOrder: readonly string[];
  /** Project folders pinned to the top of the list. */
  pinnedProjects: readonly string[];
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const byTitle = (a: NoteMeta, b: NoteMeta) => collator.compare(a.title, b.title) || collator.compare(a.path, b.path);

/** A project's name in the preferences: its folder under `projects/`. */
export const projectKey = (note: NoteMeta): string => note.project ?? note.path;

/** Whether the project page says the project is archived. */
export function isArchived(note: NoteMeta): boolean {
  const value = note.props.archived;
  return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

/** Projects still in use and archived ones, each in the order given. */
export function partitionArchived(projects: readonly NoteMeta[]): { active: NoteMeta[]; archived: NoteMeta[] } {
  const active: NoteMeta[] = [];
  const archived: NoteMeta[] = [];
  for (const note of projects) (isArchived(note) ? archived : active).push(note);
  return { active, archived };
}

/** Projects in the order the sidebar shows them: pinned ones first, then
 * the rest. Each group follows the arranged order, with projects nobody
 * arranged yet after the arranged ones, by title. Names of projects that
 * are not there are ignored, and no project is ever left out. */
export function arrangeProjects(projects: readonly NoteMeta[], prefs: Arrangement): NoteMeta[] {
  const rank = new Map<string, number>();
  prefs.projectOrder.forEach((key, i) => {
    if (!rank.has(key)) rank.set(key, i);
  });
  const arranged = projects.filter((n) => rank.has(projectKey(n)));
  const fresh = projects.filter((n) => !rank.has(projectKey(n)));
  arranged.sort((a, b) => rank.get(projectKey(a))! - rank.get(projectKey(b))! || byTitle(a, b));
  fresh.sort(byTitle);
  const all = [...arranged, ...fresh];
  const pins = new Set(prefs.pinnedProjects);
  return [...all.filter((n) => pins.has(projectKey(n))), ...all.filter((n) => !pins.has(projectKey(n)))];
}

/** A copy of `list` with the item at `from` moved to index `to` (clamped
 * to the list); a copy as it is when there is no item at `from`. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length || !Number.isInteger(from)) return out;
  const [item] = out.splice(from, 1);
  out.splice(Math.min(Math.max(to, 0), out.length), 0, item!);
  return out;
}

/** Where the row at `from` lands when dropped at insertion `slot` (slot i
 * is just above row i; the last slot is below the last row). */
export const targetOf = (from: number, slot: number): number => (slot > from ? slot - 1 : slot);

/** The insertion slot that lands the row at `from` on index `to`. */
export const slotOf = (from: number, to: number): number => (to > from ? to + 1 : to);

/** The rows the shown project at `index` may move among: the pinned ones
 * at the top, or the rest. Bounds are inclusive. */
export function groupOf(shown: readonly string[], pinned: readonly string[], index: number): { start: number; end: number } {
  const pins = new Set(pinned);
  const count = shown.filter((key) => pins.has(key)).length;
  return index < count ? { start: 0, end: count - 1 } : { start: count, end: shown.length - 1 };
}

/**
 * The new `projectOrder` after the shown project at `from` moved to `to`,
 * kept within its group. Every shown project gets a place, and names not
 * shown (archived projects, projects in the trash) keep theirs, so an
 * archived project comes back where it was. The moved project goes just
 * above the project now below it in its group, or else just below the one
 * now above it; the shown order is then exactly the one asked for.
 */
export function reorder(prefs: Arrangement, shown: readonly string[], from: number, to: number): string[] {
  const order = [...prefs.projectOrder];
  const key = shown[from];
  if (key === undefined) return order;
  const { start, end } = groupOf(shown, prefs.pinnedProjects, from);
  const target = Math.min(Math.max(to, start), end);
  if (target === from) return order;
  const next = moved(shown, from, target);
  const full = [...order];
  for (const k of shown) if (!full.includes(k)) full.push(k);
  const without = full.filter((k) => k !== key);
  const below = next.slice(target + 1, end + 1).find((k) => k !== key);
  const above = next.slice(start, target).reverse().find((k) => k !== key);
  if (below !== undefined) without.splice(without.indexOf(below), 0, key);
  else if (above !== undefined) without.splice(without.indexOf(above) + 1, 0, key);
  else return order;
  return without;
}
