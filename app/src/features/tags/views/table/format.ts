// Cell values as the table shows and sends them. The core checks every
// value against the tag's schema; these only shape what is typed and read.

import { dayOf } from "../../../panel/properties/values";

// Formatters made once: a table draws hundreds of dates.
const DAY = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** "2 Oct 2026", with the time when the value has one; odd text as written. */
export function readableDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value).trim();
  const day = dayOf(raw);
  if (!day) return raw;
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  if (Number.isNaN(date.getTime())) return raw;
  const text = DAY.format(date);
  const time = /^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})/.exec(raw);
  if (!time) return text;
  const at = new Date(y!, m! - 1, d!, Number(time[1]), Number(time[2]));
  return `${text}, ${TIME.format(at)}`;
}

/** A link as its host and path: "github.com/me/repo". */
export function urlLabel(url: string): string {
  const trimmed = url.trim();
  if (/^mailto:/i.test(trimmed)) return trimmed.slice(7);
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:www\.)?(.+?)\/?$/i.exec(trimmed);
  return match ? match[1]! : trimmed;
}

/** Typed text as a number, null when empty, else as typed: the core names the problem. */
export function numberFrom(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed;
}

/** `record[key]` when the record itself has it: never an object's own
 * methods, whatever a schema names its property or type. */
export const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined => (Object.hasOwn(record, key) ? record[key] : undefined);

/** Options and values match without regard to case, as the core's checks do. */
export const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** An empty list is stored as no value. */
export const listOrNull = (items: string[]) => (items.length > 0 ? items : null);

const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** Whether two values are the same; every empty value counts as one. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (empty(a) || empty(b)) return empty(a) && empty(b);
  return JSON.stringify(a) === JSON.stringify(b);
}
