// The Tasks view's filters and groups: which to-dos show (open or done, by
// day, by where they live, by words) and how they gather. Pure.

import { isDay, longDay } from "../../lib/dates";
import type { TaskRow } from "../../lib/vault/types";
import { lineIcon } from "../../ui/glyph";

export type StatusFilter = "open" | "done" | "all";
export type DueFilter = "any" | "overdue" | "today" | "week" | "none";
export type Grouping = "page" | "day" | "project";

export interface TaskFilter {
  status: StatusFilter;
  due: DueFilter;
  /** "all", "journal", "other" (pages in no project) or "project:<folder>". */
  where: string;
  text: string;
}

export const ALL_TASKS: TaskFilter = { status: "open", due: "any", where: "all", text: "" };

/** Where a to-do lives, as `TaskFilter.where` names places. */
export function whereOf(path: string): string {
  const project = /^projects\/([^/]+)\//.exec(path)?.[1];
  if (project) return `project:${project}`;
  return path.startsWith("journal/") ? "journal" : "other";
}

/** The day seven days after `today`, YYYY-MM-DD. */
function weekAfter(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + 7));
  return date.toISOString().slice(0, 10);
}

export function filterTasks(rows: readonly TaskRow[], filter: TaskFilter, today: string): TaskRow[] {
  const words = filter.text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const week = weekAfter(today);
  return rows.filter((row) => {
    if (filter.status === "open" && row.done) return false;
    if (filter.status === "done" && !row.done) return false;
    if (filter.where !== "all" && whereOf(row.path) !== filter.where) return false;
    switch (filter.due) {
      case "overdue":
        if (!row.due || row.due >= today || row.done) return false;
        break;
      case "today":
        if (row.due !== today) return false;
        break;
      case "week":
        if (!row.due || row.due < today || row.due > week) return false;
        break;
      case "none":
        if (row.due) return false;
        break;
    }
    const hay = `${row.text} ${row.title}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export interface TaskGroup {
  key: string;
  label: string;
  /** An icon string (ui/glyph.ts) before the label: the page's, or the place's. */
  icon?: string;
  /** The page the group is, when grouped by page. */
  path?: string;
  tone?: "late" | "today";
  rows: TaskRow[];
}

/** Groups by page (as listed), by day (overdue, today, each day, then no
 * day) or by project (projects by name, then the journal and other pages). */
export function groupTasks(rows: readonly TaskRow[], by: Grouping, today: string, projectTitle: (folder: string) => string): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  const add = (key: string, make: () => Omit<TaskGroup, "rows">, row: TaskRow) => {
    const found = groups.get(key) ?? { ...make(), rows: [] };
    found.rows.push(row);
    groups.set(key, found);
  };
  for (const row of rows) {
    if (by === "page") {
      // A journal day is named as the journal names it.
      const day = isDay(row.title);
      add(row.path, () => ({ key: row.path, label: day ? longDay(row.title) : row.title, icon: day ? lineIcon("journal") : row.icon || lineIcon("page"), path: row.path }), row);
    }
    else if (by === "project") {
      const where = whereOf(row.path);
      const label = where === "journal" ? "Journal" : where === "other" ? "Other pages" : projectTitle(where.slice("project:".length));
      const icon = lineIcon(where === "journal" ? "journal" : where === "other" ? "page" : "folder");
      const order = where.startsWith("project:") ? `0${label.toLowerCase()}` : where === "journal" ? "1" : "2";
      add(order, () => ({ key: order, label, icon }), row);
    } else if (!row.due) add("~none", () => ({ key: "~none", label: "No day" }), row);
    else if (row.due < today && !row.done) add("!late", () => ({ key: "!late", label: "Overdue", tone: "late" }), row);
    else if (row.due === today) add(row.due, () => ({ key: row.due!, label: "Today", tone: "today" }), row);
    else add(row.due, () => ({ key: row.due!, label: longDay(row.due!) }), row);
  }
  const list = [...groups.values()];
  // By code point, so "!late" comes first and "~none" last.
  return by === "page" ? list : list.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The places to-dos and tasks live in, for the "Where" menu: everywhere,
 * each project by name, then the journal and pages in no project. */
export function placesOf(projects: readonly { folder: string; title: string }[]): { value: string; label: string }[] {
  const named = projects.map((p) => ({ value: `project:${p.folder}`, label: p.title })).sort((a, b) => a.label.localeCompare(b.label));
  return [{ value: "all", label: "Everywhere" }, ...named, { value: "journal", label: "Journal" }, { value: "other", label: "Other pages" }];
}
