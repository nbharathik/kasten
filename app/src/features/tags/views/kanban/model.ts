// A board's arithmetic: what a
// column is called and whether it takes cards, where a keyboard move goes,
// moves on their way shown where they are going, columns that did not change
// kept as they were (so they skip redrawing), and the view's card colour.
// Pure functions, unit tested.

import type { NoteMeta, PropDef, TagSchema, TagView } from "../../../../lib/vault/types";
import { propOf } from "../../../panel/properties/values";
import type { Column } from "../../model";

/** A move on its way: the property it sets and the value (null clears it). */
export interface PendingMove {
  key: string;
  value: string | null;
}

/** Moves on their way, by note path. */
export type Pending = ReadonlyMap<string, PendingMove>;

/** The handle of the column for notes without a value. */
export const NO_VALUE = "\u0000";

/** A column's handle: its value in lower case, as `columnsOf` matches values. */
export const columnKey = (value: string | null): string => (value === null ? NO_VALUE : value.toLowerCase());

/** A value as its column heads it: the option as the schema spells it, or "No <key>". */
export function labelOf(value: string | null, def: PropDef): string {
  if (value === null) return `No ${def.key}`;
  return def.options.find((o) => o.toLowerCase() === value.toLowerCase()) ?? value;
}

/** Whether a column takes cards: the core writes only a select's options
 * (any value when it lists none), and clearing it is always allowed. */
export function takesCards(value: string | null, def: PropDef): boolean {
  if (value === null || def.options.length === 0) return true;
  const wanted = value.toLowerCase();
  return def.options.some((o) => o.toLowerCase() === wanted);
}

/** Where a keyboard move from column `from` lands: the nearest column `step`
 * away that takes cards, or null at the board's edge. */
export function stepColumn(columns: readonly Pick<Column, "value">[], from: number, step: 1 | -1, def: PropDef): number | null {
  if (from < 0) return null;
  for (let i = from + step; i >= 0 && i < columns.length; i += step) if (takesCards(columns[i]!.value, def)) return i;
  return null;
}

/** A note's value before a move, for its Undo: the text it has (the first
 * of a list), or null for none. */
export function fromValue(note: NoteMeta, key: string): string | null {
  const raw = propOf(note.props, key);
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first === null || first === undefined || first === "") return null;
  return typeof first === "string" ? first : String(first);
}

/** Copies of moved notes, so a card waiting for its write keeps one object. */
const copies = new WeakMap<NoteMeta, { move: PendingMove; note: NoteMeta }>();

/** The notes with the moves on their way applied: a moved note becomes a
 * copy carrying its new value, the rest keep their objects. */
export function withPending(notes: readonly NoteMeta[], pending: Pending): readonly NoteMeta[] {
  if (pending.size === 0) return notes;
  return notes.map((note) => {
    const move = pending.get(note.path);
    if (!move) return note;
    const known = copies.get(note);
    if (known && known.move.key === move.key && known.move.value === move.value) return known.note;
    const props = { ...note.props };
    if (move.value === null) delete props[move.key];
    else props[move.key] = move.value;
    const copy = { ...note, props };
    copies.set(note, { move, note: copy });
    return copy;
  });
}

const sameNotes = (a: readonly NoteMeta[], b: readonly NoteMeta[]) => a.length === b.length && a.every((note, i) => note === b[i]);

/** `next`, with every column that holds the same cards as before kept as the
 * very same object, so its memoised drawing is skipped. */
export function steadyColumns(before: readonly Column[], next: readonly Column[]): Column[] {
  const old = new Map(before.map((column) => [columnKey(column.value), column]));
  return next.map((column) => {
    const was = old.get(columnKey(column.value));
    return was && was.value === column.value && was.label === column.label && sameNotes(was.notes, column.notes) ? was : column;
  });
}

/** The select a view colours its cards by (`color_by`), while the schema has it. */
export function colorDef(view: TagView, schema: TagSchema | null): PropDef | null {
  const key = typeof view.color_by === "string" ? view.color_by : null;
  if (!key) return null;
  return schema?.properties.find((p) => p.key === key && p.type === "select") ?? null;
}

/** The view colouring its cards by `key`, or with null by nothing: the key goes. */
export function withColorBy(view: TagView, key: string | null): TagView {
  const next: TagView = { ...view };
  delete next.color_by;
  return key ? { ...next, color_by: key } : next;
}

/** The properties a card shows: all of the tag's but the one it is grouped by. */
export function cardDefs(properties: readonly PropDef[] | undefined, groupKey: string): PropDef[] {
  return (properties ?? []).filter((p) => p.key !== groupKey);
}
