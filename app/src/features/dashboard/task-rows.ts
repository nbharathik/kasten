// Every to-do in the vault, from the core's index, shared by the dashboards:
// a project page that reloads or a second dashboard shows the list at once
// instead of fetching it again. Read again, once, whenever notes change.

import { useEffect } from "react";
import { create } from "zustand";

import type { NoteMeta, TaskRow } from "../../lib/vault/types";
import { useWorkspace } from "../workspace/store";

interface TaskRowsState {
  /** Null until read. */
  rows: TaskRow[] | null;
  load(): Promise<void>;
  /** Shows a tick before the vault has it. */
  patch(row: TaskRow, done: boolean): void;
}

/** Loads cross: the newest one's answer wins. */
let latest = 0;

export const useTaskRows = create<TaskRowsState>()((set) => ({
  rows: null,
  async load() {
    const client = useWorkspace.getState().client;
    if (!client) return;
    const mine = ++latest;
    try {
      const rows = await client.tasks();
      if (mine === latest) set({ rows });
    } catch {
      // Keep what we had.
    }
  },
  patch(row, done) {
    set((s) => ({ rows: s.rows?.map((r) => (r.path === row.path && r.line === row.line ? { ...r, done } : r)) ?? null }));
  },
}));

let askedFor: readonly NoteMeta[] | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** The vault's to-dos, read again a moment after the notes change. */
export function useTaskList(): TaskRow[] | null {
  const notes = useWorkspace((s) => s.notes);
  useEffect(() => {
    if (notes === askedFor) return;
    askedFor = notes;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void useTaskRows.getState().load(), 120);
  }, [notes]);
  return useTaskRows((s) => s.rows);
}

/** Open to-dos first: overdue, then by day (undated last), then by page and line. */
export function byUrgency(a: TaskRow, b: TaskRow): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.due !== b.due) return a.due === null ? 1 : b.due === null ? -1 : a.due.localeCompare(b.due);
  return a.path.localeCompare(b.path) || a.line - b.line;
}
