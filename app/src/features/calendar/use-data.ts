// What the Calendar asks the vault for besides the note list: tag schemas
// (which properties are dates, and tag colours) and the dated to-dos. Each
// is one index query through the client; nothing reads notes one by one.

import { useEffect, useMemo, useRef, useState } from "react";

import { isDay } from "../../lib/dates";
import type { DayMention, NoteMeta, TagSchema, TaskRow, VaultClient } from "../../lib/vault/types";
import { journalDays } from "../workspace/tree";
import { activityByDay, byDay } from "./dates";

/** How long after the notes change the to-dos are fetched again. */
const TASKS_DELAY = 500;
const NO_SCHEMAS: TagSchema[] = [];
const NONE = new Map<string, never[]>();

/** The schemas each vault answered last. A visit starts with them, and an
 * answer equal to them keeps their identity, so `dateItems` (cached per
 * notes and schemas) is not worked out again for nothing. */
const known = new WeakMap<VaultClient, TagSchema[]>();

/** The vault's tag schemas, fetched once per visit; null until the first
 * answer, so dated notes are gathered once, with them. */
export function useSchemas(client: VaultClient | null): TagSchema[] | null {
  const [schemas, setSchemas] = useState<TagSchema[] | null>(() => (client && known.get(client)) || null);
  useEffect(() => {
    if (!client) return;
    let live = true;
    client.tagSchemas().then(
      (found) => {
        const before = known.get(client);
        const next = before && JSON.stringify(before) === JSON.stringify(found) ? before : found;
        known.set(client, next);
        if (live) setSchemas(next);
      },
      // Without schemas, well-known keys such as `due` still show.
      () => live && setSchemas((current) => current ?? NO_SCHEMAS),
    );
    return () => {
      live = false;
    };
  }, [client]);
  return schemas;
}

/** Each tag's colour name by lower-case tag. */
export function useTagColors(schemas: readonly TagSchema[] | null): ReadonlyMap<string, string> {
  return useMemo(() => new Map((schemas ?? NO_SCHEMAS).filter((s) => s.color).map((s) => [s.name.toLowerCase(), s.color!])), [schemas]);
}

/** Open to-dos that name a day: fetched on arrival, then again a moment
 * after the notes change. Null until the first answer. */
export function useDatedTasks(client: VaultClient | null, notes: readonly NoteMeta[]): TaskRow[] | null {
  const [rows, setRows] = useState<TaskRow[] | null>(null);
  const fetched = useRef(false);
  useEffect(() => {
    if (!client) return;
    let live = true;
    const timer = setTimeout(
      () => {
        fetched.current = true;
        client.tasks().then(
          (all) => live && setRows(all.filter((t) => t.due && !t.done)),
          () => live && setRows((known) => known ?? []),
        );
      },
      fetched.current ? TASKS_DELAY : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [client, notes]);
  return rows;
}

/** Journal pages by day, from the note list's index. */
export function useJournalPages(notes: readonly NoteMeta[]): ReadonlyMap<string, NoteMeta> {
  const journal = journalDays(notes);
  return useMemo(() => {
    const out = new Map<string, NoteMeta>();
    for (const note of journal) {
      const stem = note.path.slice(note.path.lastIndexOf("/") + 1).replace(/\.md$/, "");
      const day = isDay(stem) ? stem : isDay(note.title) ? note.title : null;
      if (day && !out.has(day)) out.set(day, note);
    }
    return out;
  }, [journal]);
}

/** Notes that link a day from `from` to `to` (`[[2026-10-01]]`), by day:
 * fetched at once for other days, and a moment after the notes change.
 * Nothing while `enabled` is off. */
export function useDayMentions(client: VaultClient | null, from: string, to: string, notes: readonly NoteMeta[], enabled: boolean): ReadonlyMap<string, DayMention[]> {
  const [found, setFound] = useState<ReadonlyMap<string, DayMention[]>>(NONE);
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!client || !enabled) return;
    let live = true;
    const days = `${from}/${to}`;
    const timer = setTimeout(
      () => {
        asked.current = days;
        client.dayMentions(from, to).then(
          (rows) => live && setFound(byDay(rows)),
          () => {},
        );
      },
      asked.current === days ? TASKS_DELAY : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [client, from, to, notes, enabled]);
  return enabled ? found : NONE;
}

/** Notes made on each day from `from` to `to`, journal days and templates
 * aside; nothing while `enabled` is off. */
export function useMadeByDay(notes: readonly NoteMeta[], from: string, to: string, enabled: boolean): ReadonlyMap<string, NoteMeta[]> {
  return useMemo(() => {
    if (!enabled) return NONE;
    const out = new Map<string, NoteMeta[]>();
    for (const [day, { created }] of activityByDay(notes)) if (created.length && day >= from && day <= to) out.set(day, created);
    return out;
  }, [notes, from, to, enabled]);
}
