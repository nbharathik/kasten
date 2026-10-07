import { describe, expect, it } from "vitest";

import type { TagSchema } from "../../lib/vault/types";
import { metaFor } from "../workspace/preview/note-meta";
import { applyView, columnsOf, freshName, groupDef, newView, notesWith, passes, vaultTags, viewsOf } from "./model";

const note = (path: string, title: string, tags: string[], props: Record<string, string | number | boolean | string[]> = {}) => {
  const lines = Object.entries(props).map(([k, v]) => `  ${k}: ${Array.isArray(v) ? `[${v.join(", ")}]` : v}`);
  const text = `---\ntitle: ${title}\ntags: [${tags.join(", ")}]\n${lines.length ? `props:\n${lines.join("\n")}\n` : ""}---\nBody\n`;
  return metaFor(path, text, 0);
};

const TASK: TagSchema = {
  name: "task",
  color: "green",
  path: "tags/task.yaml",
  properties: [
    { key: "status", type: "select", options: ["Todo", "Doing", "Done"] },
    { key: "due", type: "date", options: [] },
    { key: "points", type: "number", options: [] },
    { key: "urgent", type: "checkbox", options: [] },
  ],
  views: [{ name: "Board", type: "kanban", group_by: "status" }, { name: "Odd", type: "timeline" }, { type: "table" }],
};

const notes = [
  note("a.md", "Write intro", ["task"], { status: "Doing", due: "2026-10-02", points: 3 }),
  note("b.md", "Book flights", ["Task", "travel"], { status: "Todo", due: "2026-09-30", points: 10, urgent: true }),
  note("c.md", "Plan budget", ["task"], { status: "Done", points: 1 }),
  note("d.md", "Loose end", ["task"], { status: "Blocked" }),
  note("e.md", "No status yet", ["task"], {}),
  note("f.md", "Other", ["idea"], {}),
];

describe("tag database model", () => {
  it("lists a tag's notes whatever the case, and every tag with its count", () => {
    expect(notesWith(notes, "TASK").map((n) => n.path)).toEqual(["a.md", "b.md", "c.md", "d.md", "e.md"]);
    const tags = vaultTags(
      [
        { tag: "task", count: 4 },
        { tag: "Task", count: 1 },
        { tag: "idea", count: 1 },
      ],
      [TASK, { ...TASK, name: "meeting", path: "tags/meeting.yaml" }],
    );
    expect(tags.map((t) => [t.tag, t.count, t.schema?.name ?? null])).toEqual([
      ["task", 5, "task"],
      ["idea", 1, null],
      ["meeting", 0, "meeting"],
    ]);
  });

  it("shows the views it can, else one table, and names new ones", () => {
    expect(viewsOf(TASK)).toEqual([{ name: "Board", type: "kanban", group_by: "status" }]);
    expect(viewsOf(null)).toEqual([{ name: "All", type: "table" }]);
    expect(freshName(viewsOf(TASK), "Board")).toBe("Board 2");
    expect(newView("kanban", TASK, [])).toEqual({ name: "Board", type: "kanban", group_by: "status" });
    expect(newView("calendar", TASK, [])).toEqual({ name: "Calendar", type: "calendar", date: "due" });
    expect(newView("list", null, [])).toEqual({ name: "List", type: "list" });
  });

  it("reads a view written by hand, leaving out settings in a shape it cannot use", () => {
    const views = viewsOf({
      ...TASK,
      views: [
        null,
        "table",
        { name: " Loose ", type: "table", filter: "oops", sort: { key: "due" }, columns: ["due", 2026, null], group_by: 5, date: ["due"], extra: 1 },
        { name: "Soon", type: "list", filter: [{ key: "status", op: "is", value: "Todo" }, { key: "x", op: "near" }, null], sort: [{ key: "due" }, { dir: "desc" }] },
      ],
    } as unknown as TagSchema);
    expect(views).toEqual([
      { name: "Loose", type: "table", filter: [], sort: [], columns: ["due", "2026"], group_by: "5", extra: 1 },
      { name: "Soon", type: "list", filter: [{ key: "status", op: "is", value: "Todo" }], sort: [{ key: "due", dir: "asc" }] },
    ]);
    // Every view reads without throwing.
    for (const view of views) expect(() => applyView(notes, view, TASK)).not.toThrow();
  });

  it("never takes a name such as constructor for a property", () => {
    expect(passes(notes[4]!, { key: "constructor", op: "empty" }, undefined)).toBe(true);
    expect(passes(notes[4]!, { key: "toString", op: "not_empty" }, undefined)).toBe(false);
  });

  it("filters by the day a note was edited", () => {
    const edited = { ...notes[0]!, modified: new Date(2026, 8, 20, 23, 30).getTime() };
    expect(passes(edited, { key: "modified", op: "before", value: "2026-09-21" }, undefined)).toBe(true);
    expect(passes(edited, { key: "modified", op: "after", value: "2026-09-19" }, undefined)).toBe(true);
    expect(passes(edited, { key: "modified", op: "after", value: "2026-09-20" }, undefined)).toBe(false);
  });

  it("filters by value, emptiness and dates", () => {
    const def = (key: string) => TASK.properties.find((p) => p.key === key);
    const b = notes[1]!;
    expect(passes(b, { key: "status", op: "is", value: "todo" }, def("status"))).toBe(true);
    expect(passes(b, { key: "status", op: "is_not", value: "Todo" }, def("status"))).toBe(false);
    expect(passes(b, { key: "title", op: "contains", value: "FLIGHT" }, undefined)).toBe(true);
    expect(passes(b, { key: "due", op: "before", value: "2026-10-01" }, def("due"))).toBe(true);
    expect(passes(b, { key: "due", op: "after", value: "2026-10-01" }, def("due"))).toBe(false);
    expect(passes(notes[2]!, { key: "due", op: "empty" }, def("due"))).toBe(true);
    expect(passes(notes[0]!, { key: "urgent", op: "empty" }, def("urgent"))).toBe(true);
    expect(passes(b, { key: "urgent", op: "is", value: true }, def("urgent"))).toBe(true);
  });

  it("sorts by type with empty values last, and title breaking ties", () => {
    const tasks = notesWith(notes, "task");
    const order = (sort: { key: string; dir: "asc" | "desc" }[]) => applyView(tasks, { name: "x", type: "table", sort }, TASK).map((n) => n.path);
    expect(order([{ key: "status", dir: "asc" }])).toEqual(["b.md", "a.md", "c.md", "d.md", "e.md"]);
    expect(order([{ key: "points", dir: "desc" }])).toEqual(["b.md", "a.md", "c.md", "d.md", "e.md"]);
    // No due date: last, by title.
    expect(order([{ key: "due", dir: "asc" }])).toEqual(["b.md", "a.md", "d.md", "e.md", "c.md"]);
    expect(order([])).toEqual(["b.md", "d.md", "e.md", "c.md", "a.md"]);
    const filtered = applyView(tasks, { name: "x", type: "list", filter: [{ key: "status", op: "is_not", value: "Done" }] }, TASK);
    expect(filtered.map((n) => n.path)).not.toContain("c.md");
  });

  it("puts a board's notes in the columns of its select, odd values after", () => {
    const def = groupDef({ name: "Board", type: "kanban", group_by: "nope" }, TASK)!;
    expect(def.key).toBe("status");
    const columns = columnsOf(notesWith(notes, "task"), def);
    expect(columns.map((c) => [c.label, c.notes.map((n) => n.path)])).toEqual([
      ["No status", ["e.md"]],
      ["Todo", ["b.md"]],
      ["Doing", ["a.md"]],
      ["Done", ["c.md"]],
      ["Blocked", ["d.md"]],
    ]);
    expect(groupDef({ name: "B", type: "kanban" }, { ...TASK, properties: [] })).toBeNull();
  });

  it("puts a number written for an option in that option's column", () => {
    const priority = { key: "priority", type: "select", options: ["1", "2", "3"] };
    const ranked = [note("p.md", "Ranked", ["task"], { priority: 2 }), note("q.md", "Listed", ["task"], { priority: ["3"] })];
    expect(columnsOf(ranked, priority).map((c) => [c.label, c.notes.map((n) => n.path)])).toEqual([
      ["1", []],
      ["2", ["p.md"]],
      ["3", ["q.md"]],
    ]);
  });
});
