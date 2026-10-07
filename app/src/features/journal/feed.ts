// What the journal lists beside the day's page: every day from
// today back to the first journal page, and a mark on each calendar day that
// has something: its page, notes made or edited, or things due.

import { addDays, daysBetween, isDay } from "../../lib/dates";
import type { NoteMeta } from "../../lib/vault/types";
import type { DateItem } from "../calendar/dates";
import { activityByDay } from "../calendar/dates";
import { eachDay, type DateRange } from "../calendar/ranges";
import { journalDays } from "../workspace/tree";

/** The most days the list goes back: ten years. */
const MAX_DAYS = 3660;

export interface DayMark {
  /** The day has a journal page. */
  journal: boolean;
  /** Notes made or edited that day. */
  activity: number;
  /** Things due that day. */
  due: number;
  /** Ranges under way that day, such as a trip. */
  ongoing: number;
}

/** A mark for each day with anything on it, for the mini calendar. */
export function dayMarks(notes: readonly NoteMeta[], items: readonly DateItem[], ranges: readonly DateRange[] = []): Map<string, DayMark> {
  const marks = new Map<string, DayMark>();
  const at = (day: string) => {
    let mark = marks.get(day);
    if (!mark) marks.set(day, (mark = { journal: false, activity: 0, due: 0, ongoing: 0 }));
    return mark;
  };
  for (const n of journalDays(notes)) at(n.title).journal = true;
  for (const [day, found] of activityByDay(notes)) at(day).activity += found.created.length + found.edited.length;
  for (const item of items) at(item.day).due += 1;
  for (const range of ranges) for (const day of eachDay(range)) at(day).ongoing += 1;
  return marks;
}

/** "Today", "Yesterday", "Tomorrow" or null for other days. */
export function relativeDay(day: string, today: string, yesterday: string, tomorrow: string): string | null {
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  if (day === tomorrow) return "Tomorrow";
  return null;
}

/** The journal page's path for a day, whether or not it exists yet. */
export function journalPath(day: string): string {
  return `journal/${day.slice(0, 4)}/${day}.md`;
}

/** The day a journal place shows: its page's day, or today. */
export function dayOfPath(path: string | undefined, today: string): string {
  const day = path?.match(/(\d{4}-\d{2}-\d{2})\.md$/)?.[1];
  return day ?? today;
}

/** The day a journal note is for: its file's name, or a title that is a
 * day. A folder opened as it is may name its days otherwise. */
export function dayOfNote(note: NoteMeta): string | null {
  const named = /(\d{4}-\d{2}-\d{2})\.md$/.exec(note.path)?.[1];
  return named ?? (isDay(note.title) ? note.title : null);
}

/** The days the journal lists beside the page, newest first: every day
 * from `today` back to the first page, at least `min` of them and at most
 * ten years. */
export function daysBack(notes: readonly NoteMeta[], today: string, min = 21): string[] {
  let first = addDays(today, 1 - min);
  for (const n of journalDays(notes)) {
    const day = dayOfNote(n);
    if (day && day < first) first = day;
  }
  const count = Math.min(daysBetween(first, today) + 1, MAX_DAYS);
  return Array.from({ length: count }, (_, i) => addDays(today, -i));
}
