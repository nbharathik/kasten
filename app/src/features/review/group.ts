// Grouping for the review queue and the history view: proposals by agent
// session, commits by day, and the time labels both show.

import { dayFrom, isoDay } from "../../lib/dates";
import type { CommitInfo, Proposal, SessionInfo } from "../../lib/vault/types";

/** Milliseconds for an RFC 3339 time, or null when it does not parse. */
export function millisOf(rfc3339: string): number | null {
  const ms = Date.parse(rfc3339);
  return Number.isNaN(ms) ? null : ms;
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Proposals oldest first: by time, then by id (ids sort by time too). */
export function oldestFirst(proposals: readonly Proposal[]): Proposal[] {
  return [...proposals].sort((x, y) => (millisOf(x.created) ?? 0) - (millisOf(y.created) ?? 0) || byId(x.id, y.id));
}

export interface SessionGroup {
  session: string;
  client: string;
  proposals: Proposal[];
}

/** Proposals by agent session, oldest first inside each, and the sessions
 * in the order their first proposals came. */
export function bySession(proposals: readonly Proposal[]): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();
  for (const p of oldestFirst(proposals)) {
    const group = groups.get(p.session) ?? { session: p.session, client: p.client, proposals: [] };
    group.proposals.push(p);
    groups.set(p.session, group);
  }
  return [...groups.values()];
}

export interface DayGroup<T> {
  /** The local day, YYYY-MM-DD. */
  day: string;
  label: string;
  items: T[];
}

// Formatters made once; a history list labels hundreds of commits.
const DAY = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
const DAY_YEAR = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const SHORT = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const SHORT_YEAR = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const CLOCK = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** "Today", "Yesterday", or the date, with the year when it is not this one. */
export function dayLabel(day: string, now = new Date()): string {
  if (day === isoDay(now)) return "Today";
  if (day === dayFrom(-1, now)) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const sameYear = y === now.getFullYear();
  return (sameYear ? DAY : DAY_YEAR).format(new Date(y, m - 1, d));
}

/** "Today", "Yesterday", or a short date such as "23 Sep". */
export function shortDay(day: string, now = new Date()): string {
  if (day === isoDay(now) || day === dayFrom(-1, now)) return dayLabel(day, now);
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return (y === now.getFullYear() ? SHORT : SHORT_YEAR).format(new Date(y, m - 1, d));
}

/** Items grouped by their local day. Days keep the order they first appear
 * in, so a newest-first list gives newest-first days. */
export function groupByDay<T>(items: readonly T[], time: (item: T) => number, now = new Date()): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const day = isoDay(new Date(time(item)));
    const group = groups.get(day);
    if (group) group.items.push(item);
    else groups.set(day, { day, label: dayLabel(day, now), items: [item] });
  }
  return [...groups.values()];
}

/** "14:05" or "2:05 PM", as the locale writes times. */
export const clock = (ms: number) => CLOCK.format(new Date(ms));

/** When a session ran: "Today, 09:12–09:31", or "Yesterday 23:50 – Today 00:20". */
export function sessionSpan(started: number, last: number, now = new Date()): string {
  const [from, to] = [isoDay(new Date(started)), isoDay(new Date(last))];
  const [a, b] = [clock(started), clock(last)];
  if (from === to) return `${shortDay(from, now)}, ${a === b ? a : `${a}–${b}`}`;
  return `${shortDay(from, now)} ${a} – ${shortDay(to, now)} ${b}`;
}

/** Ids of the commits a later commit undid. */
export function undoneIds(commits: readonly CommitInfo[]): Set<string> {
  return new Set(commits.flatMap((c) => (c.undoes ? [c.undoes] : [])));
}

/** A session's commits in the list, newest first as the list is. */
export const sessionCommits = (commits: readonly CommitInfo[], session: string) => commits.filter((c) => c.session === session);

/** How many of a session's changes an undo would revert: its commits less
 * those already undone. Undos go newest first, so the undone ones are the
 * newest and within the list even when older commits are not. */
export function changesLeft(session: SessionInfo, commits: readonly CommitInfo[]): number {
  if (session.undone) return 0;
  const undone = undoneIds(commits);
  const reverted = sessionCommits(commits, session.id).filter((c) => undone.has(c.id)).length;
  return Math.max(0, session.commits - reverted);
}
