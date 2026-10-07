import { describe, expect, it } from "vitest";

import { longDay } from "../../lib/dates";
import type { TaskRow } from "../../lib/vault/types";
import { lineIcon } from "../../ui/glyph";
import { ALL_TASKS, filterTasks, groupTasks, placesOf, whereOf } from "./filters";

const TODAY = "2026-09-25";
const row = (path: string, text: string, due: string | null = null, done = false): TaskRow => ({ path, title: path.split("/").pop()!.replace(".md", ""), icon: null, line: 0, done, text, due });
const ROWS = [
  row("projects/trip/pages/plan.md", "Book flights", "2026-09-20"),
  row("projects/trip/pages/plan.md", "Pack", TODAY),
  row("projects/study/_project.md", "Draft intro", "2026-09-30"),
  row("journal/2026/2026-09-24.md", "Call the venue", null),
  row("library/misc.md", "Old thing", "2026-09-01", true),
  row("library/misc.md", "Someday", "2026-12-01"),
];
const titles = (rows: TaskRow[]) => rows.map((r) => r.text);
const title = (folder: string) => ({ trip: "Seaside trip", study: "Note-taking study" })[folder] ?? folder;

describe("task filters", () => {
  it("knows where a to-do lives", () => {
    expect(whereOf("projects/trip/pages/plan.md")).toBe("project:trip");
    expect(whereOf("journal/2026/2026-09-24.md")).toBe("journal");
    expect(whereOf("library/misc.md")).toBe("other");
  });

  it("filters by status, day, place and words", () => {
    expect(titles(filterTasks(ROWS, ALL_TASKS, TODAY))).toEqual(["Book flights", "Pack", "Draft intro", "Call the venue", "Someday"]);
    expect(titles(filterTasks(ROWS, { ...ALL_TASKS, status: "done" }, TODAY))).toEqual(["Old thing"]);
    expect(titles(filterTasks(ROWS, { ...ALL_TASKS, due: "overdue" }, TODAY))).toEqual(["Book flights"]);
    expect(titles(filterTasks(ROWS, { ...ALL_TASKS, due: "today" }, TODAY))).toEqual(["Pack"]);
    expect(titles(filterTasks(ROWS, { ...ALL_TASKS, due: "week" }, TODAY))).toEqual(["Pack", "Draft intro"]);
    expect(titles(filterTasks(ROWS, { ...ALL_TASKS, due: "none" }, TODAY))).toEqual(["Call the venue"]);
    expect(titles(filterTasks(ROWS, { ...ALL_TASKS, where: "project:trip" }, TODAY))).toEqual(["Book flights", "Pack"]);
    expect(titles(filterTasks(ROWS, { ...ALL_TASKS, status: "all", text: "misc" }, TODAY))).toEqual(["Old thing", "Someday"]);
  });

  it("names a journal day's group by its date in words, as the journal does", () => {
    const [day] = groupTasks([row("journal/2026/2026-09-24.md", "Call the venue")], "page", TODAY, title);
    expect(day).toMatchObject({ label: longDay("2026-09-24"), icon: lineIcon("journal") });
  });

  it("groups by project, then the journal and other pages, and by day", () => {
    const open = filterTasks(ROWS, ALL_TASKS, TODAY);
    expect(groupTasks(open, "project", TODAY, title).map((g) => [g.icon, g.label, g.rows.length])).toEqual([
      ["icon:folder", "Note-taking study", 1],
      ["icon:folder", "Seaside trip", 2],
      ["icon:journal", "Journal", 1],
      ["icon:page", "Other pages", 1],
    ]);
    expect(groupTasks(open, "day", TODAY, title).map((g) => g.label)).toEqual(["Overdue", "Today", "Wednesday, 30 September 2026", "Tuesday, 1 December 2026", "No day"].map((l, i) => (i === 2 || i === 3 ? expect.any(String) : l)));
    expect(placesOf([{ folder: "study", title: "Note-taking study" }, { folder: "trip", title: "Seaside trip" }]).map((p) => p.label)).toEqual(["Everywhere", "Note-taking study", "Seaside trip", "Journal", "Other pages"]);
  });
});
