// Days as Kasten names them: YYYY-MM-DD in local time, the journal's file names.

// Formatters made once: toLocaleDateString makes one per call, which is slow
// across the thousands of journal titles the palette and sidebar show.
const LONG_DAY = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const SHORT_DATE = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

export function isoDay(date: Date): string {
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today, or `offset` days from it. */
export function dayFrom(offset = 0, now = new Date()): string {
  return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
}

export const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** `day` moved by `days`. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  // setFullYear, as the Date constructor reads years 0 to 99 as 1900 to 1999.
  const date = new Date(2000, 0, 1);
  date.setFullYear(y!, m! - 1, d! + days);
  return isoDay(date);
}

const utcDay = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

/** Whole days from `from` to `to` (negative when `to` comes first), whatever
 * the clocks do in between. */
export const daysBetween = (from: string, to: string) => Math.round((utcDay(to) - utcDay(from)) / 86_400_000);

const SHORT_DAY = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

/** "Wed, Sep 23" for 2026-09-23. */
export function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return SHORT_DAY.format(new Date(y, m - 1, d));
}

/** "Thursday, 24 September 2026" for a YYYY-MM-DD day. */
export function longDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return LONG_DAY.format(new Date(y, m - 1, d));
}

/** "24 Sep 2026" for a time stamp or a day: the day as written, whatever
 * the clock here says; "" for text that starts with no day. */
export function stampDay(stamp: string): string {
  const day = /^\s*(\d{4})-(\d{2})-(\d{2})/.exec(stamp);
  if (!day) return "";
  const date = new Date(2000, 0, 1);
  date.setFullYear(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  return SHORT_DATE.format(date);
}

/** "just now", "5 minutes ago", "yesterday", or a date. */
export function relativeTime(millis: number, now = Date.now()): string {
  const seconds = Math.round((now - millis) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return SHORT_DATE.format(new Date(millis));
}
