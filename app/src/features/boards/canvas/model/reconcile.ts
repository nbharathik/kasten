// A board read fresh from the core is all new objects. Keeping the old
// object for every node and edge that did not change lets the canvas
// redraw only what did, and tells whether anything changed at all.

import type { BoardDoc } from "./apply";

/** Whether two records hold the same values; records inside them, such as
 * a drawing's points, are compared by value too. */
export function sameRecord(a: object, b: object): boolean {
  if (a === b) return true;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((key) => sameValue(ra[key], rb[key]));
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) || Array.isArray(b)) return false;
  return sameRecord(a, b);
}

function keepSame<T extends { id: string }>(old: readonly T[], next: readonly T[]): T[] | null {
  const byId = new Map(old.map((item) => [item.id, item]));
  let changed = old.length !== next.length;
  const out = next.map((item, i) => {
    const before = byId.get(item.id);
    const kept = before && sameRecord(before, item) ? before : item;
    if (kept !== old[i]) changed = true;
    return kept;
  });
  return changed ? out : null;
}

/** `next`, reusing `old`'s objects where nothing changed; `old` itself
 * when the two boards are the same. */
export function reconcile(old: BoardDoc, next: BoardDoc): BoardDoc {
  const nodes = keepSame(old.nodes, next.nodes);
  const edges = keepSame(old.edges, next.edges);
  if (!nodes && !edges && old.title === next.title && old.path === next.path) return old;
  return { ...next, nodes: nodes ?? old.nodes, edges: edges ?? old.edges };
}
