// How clicks and keys pick slides, worked out on lists of ids so that the
// filmstrip and the grid choose the same way. Every answer is in deck order.

/** The slides from `a` to `b`, both included, whichever comes first. */
export function rangeBetween(order: readonly string[], a: string, b: string): string[] {
  const from = order.indexOf(a);
  const to = order.indexOf(b);
  if (from < 0 || to < 0) return to < 0 ? [] : [b];
  return order.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** What a chosen set of slides and the one shown become. */
export interface Choice {
  ids: string[];
  show: string;
}

/**
 * Ctrl or Cmd and a click: the slide joins the selection and is shown, or
 * leaves it. The last one left cannot be taken away, and taking away the shown
 * slide shows the one before it, or the first that is left.
 */
export function toggled(order: readonly string[], selection: readonly string[], shown: string, id: string): Choice | null {
  if (selection.includes(id)) {
    const rest = order.filter((other) => other !== id && selection.includes(other));
    if (rest.length === 0) return null;
    const before = order.slice(0, order.indexOf(id)).filter((other) => rest.includes(other));
    return { ids: rest, show: id === shown ? (before[before.length - 1] ?? rest[0]!) : shown };
  }
  return { ids: order.filter((other) => other === id || selection.includes(other)), show: id };
}

/** Shift and a click: the range from the shown slide (kept shown) to the one clicked. */
export function extendedTo(order: readonly string[], shown: string, id: string): Choice {
  const range = rangeBetween(order, shown, id);
  return range.length > 0 && order.includes(shown) ? { ids: range, show: shown } : { ids: [id], show: id };
}

/** The slide `delta` places from `from` among those that can be seen, walking the whole deck from where `from` is. */
export function neighbour(deck: readonly string[], visible: ReadonlySet<string>, from: string, delta: number): string | undefined {
  const at = deck.indexOf(from);
  if (at < 0 || delta === 0) return undefined;
  const step = delta > 0 ? 1 : -1;
  let left = Math.abs(delta);
  let found: string | undefined;
  for (let i = at + step; i >= 0 && i < deck.length && left > 0; i += step) {
    const id = deck[i]!;
    if (!visible.has(id)) continue;
    found = id;
    left -= 1;
  }
  return found;
}

/**
 * Shift and an arrow: the selection grows or shrinks by one slide at its far
 * end, the shown slide (the anchor) staying where it is. Answers the new
 * selection, or null when there is nowhere to go.
 */
export function extendedBy(order: readonly string[], selection: readonly string[], anchor: string, delta: number): string[] | null {
  const at = order.indexOf(anchor);
  if (at < 0) return null;
  const places = selection.map((id) => order.indexOf(id)).filter((place) => place >= 0);
  const low = places.length > 0 ? Math.min(...places) : at;
  const high = places.length > 0 ? Math.max(...places) : at;
  const active = at === low ? high : at === high ? low : delta > 0 ? high : low;
  const next = Math.min(Math.max(active + delta, 0), order.length - 1);
  const range = order.slice(Math.min(at, next), Math.max(at, next) + 1);
  return range.length === selection.length && range.every((id, i) => id === selection[i]) ? null : range;
}
