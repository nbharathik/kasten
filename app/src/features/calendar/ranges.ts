// Date ranges: a note whose
// properties hold both a first and a last day, such as a trip's `start` and
// `end`, is one thing lasting several days rather than two dates. Pure
// functions over parsed days; `dates.ts` finds them per note and keeps the
// list.

import { addDays, daysBetween } from "../../lib/dates";
import type { NoteMeta, TagSchema } from "../../lib/vault/types";

/** One note lasting from one day to another, by two of its date properties. */
export interface DateRange {
  path: string;
  note: NoteMeta;
  /** The properties that hold its first and last day, e.g. `start` and `end`. */
  startKey: string;
  endKey: string;
  start: string;
  end: string;
  /** The tag whose schema names the pair (or either key), when one does. */
  tag: string | null;
}

/** Keys that pair up as a first and a last day, in order of preference. */
export const RANGE_KEYS: readonly (readonly [string, string])[] = [
  ["start", "end"],
  ["from", "to"],
  ["begin", "end"],
  ["start", "back"],
];

/** The most days a range may cover, both ends counted; a longer pair stays
 * two single days (more likely a typo than a trip). */
export const MAX_DAYS = 366;

interface Pair {
  start: string;
  end: string;
}

const pairCache = new WeakMap<readonly TagSchema[], Map<string, Pair>>();

/** Tags whose schema has exactly two date properties, which pair up in the
 * schema's order, by lower-case tag. */
function schemaPairs(schemas: readonly TagSchema[]): Map<string, Pair> {
  let pairs = pairCache.get(schemas);
  if (!pairs) {
    pairs = new Map();
    for (const schema of schemas) {
      const dates = schema.properties.filter((p) => p.type === "date");
      if (dates.length === 2) pairs.set(schema.name.toLowerCase(), { start: dates[0]!.key, end: dates[1]!.key });
    }
    pairCache.set(schemas, pairs);
  }
  return pairs;
}

/** Each range's length, worked out once (ranges never change once made). */
const lengths = new WeakMap<Pick<DateRange, "start" | "end">, number>();

/** Days a range covers, its first and last included. */
export function rangeDays(range: Pick<DateRange, "start" | "end">): number {
  let days = lengths.get(range);
  if (days === undefined) lengths.set(range, (days = daysBetween(range.start, range.end) + 1));
  return days;
}

/** The ranges a note's days form (`days`: each property that reads as a
 * day). Each key serves once: the pairs its tags' schemas name come first,
 * then the well-known pairs. A pair ending before it starts, or covering
 * more than MAX_DAYS, is no range. */
export function findRanges(note: NoteMeta, days: ReadonlyMap<string, string>, schemas: readonly TagSchema[], tagOf: (key: string) => string | null): DateRange[] {
  const out: DateRange[] = [];
  const used: string[] = [];
  const add = (startKey: string, endKey: string, tag: string | null) => {
    if (used.includes(startKey) || used.includes(endKey)) return;
    const start = days.get(startKey);
    const end = days.get(endKey);
    if (!start || !end || start > end) return;
    const length = daysBetween(start, end) + 1;
    if (length > MAX_DAYS) return;
    used.push(startKey, endKey);
    const range: DateRange = { path: note.path, note, startKey, endKey, start, end, tag: tag ?? tagOf(startKey) ?? tagOf(endKey) };
    lengths.set(range, length);
    out.push(range);
  };
  const pairs = schemaPairs(schemas);
  if (pairs.size) {
    for (const tag of note.tags) {
      const pair = pairs.get(tag.toLowerCase());
      if (pair) add(pair.start, pair.end, tag);
    }
  }
  for (const [start, end] of RANGE_KEYS) add(start, end, null);
  return out;
}

/** A range's handle: one note's pair of date properties. */
export const rangeId = (range: Pick<DateRange, "path" | "startKey" | "endKey">) => `${range.path}#${range.startKey}..${range.endKey}`;

/** Which of its days `day` is: `{ day: 2, of: 5 }`. */
export function dayOfRange(range: Pick<DateRange, "start" | "end">, day: string): { day: number; of: number } {
  return { day: daysBetween(range.start, day) + 1, of: rangeDays(range) };
}

const dayLists = new WeakMap<DateRange, readonly string[]>();

/** Every day a range covers, first to last; worked out once per range
 * (and a range once per version of its note). Days are counted, not
 * compared as text, which would never end past 9999-12-31. */
export function eachDay(range: DateRange): readonly string[] {
  let days = dayLists.get(range);
  if (!days) {
    const count = Math.max(0, Math.min(rangeDays(range), MAX_DAYS));
    dayLists.set(range, (days = Array.from({ length: count }, (_, i) => addDays(range.start, i))));
  }
  return days;
}

/** Start, then longer first, then title, path and key: a total order, so a
 * list patched after an edit is the very list a rebuild would give, and the
 * order lanes are filled in. */
export function byStart(a: DateRange, b: DateRange): number {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  if (a.end !== b.end) return a.end > b.end ? -1 : 1;
  const title = a.note.title.localeCompare(b.note.title);
  if (title) return title;
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  return a.startKey < b.startKey ? -1 : a.startKey > b.startKey ? 1 : 0;
}

/** The longest range in a list (in days), worked out once per list. */
const longest = new WeakMap<readonly DateRange[], number>();

function longestOf(ranges: readonly DateRange[]): number {
  let most = longest.get(ranges);
  if (most === undefined) {
    most = 1;
    for (const range of ranges) most = Math.max(most, rangeDays(range));
    longest.set(ranges, most);
  }
  return most;
}

/** The ranges of a list sorted by start (`byStart`) that touch the days from
 * `first` to `last`, in the list's order. Only ranges starting within the
 * longest one's length before `first` are looked at. */
export function rangesBetween(ranges: readonly DateRange[], first: string, last: string): DateRange[] {
  // The first range starting after `last`.
  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (ranges[mid]!.start <= last) lo = mid + 1;
    else hi = mid;
  }
  const floor = addDays(first, 1 - longestOf(ranges));
  const out: DateRange[] = [];
  for (let i = lo - 1; i >= 0 && ranges[i]!.start >= floor; i--) if (ranges[i]!.end >= first) out.push(ranges[i]!);
  return out.reverse();
}
