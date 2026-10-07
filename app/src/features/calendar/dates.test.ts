import { describe, expect, it } from "vitest";

import type { NoteMeta, TagSchema } from "../../lib/vault/types";
import { activityByDay, addDays, asDay, buildDates, byDay, dateItems, dateRanges, monthGrid, weekOf, type DateItem } from "./dates";
import { rangeId, type DateRange } from "./ranges";

const note = (path: string, extra: Partial<NoteMeta> = {}): NoteMeta => ({
  path,
  id: null,
  title: path.replace(/^.*\/|\.md$/g, ""),
  kind: "page",
  icon: null,
  cover: null,
  parent: null,
  project: null,
  tags: [],
  modified: new Date(2026, 8, 24, 10).getTime(),
  created: null,
  updated: null,
  excerpt: "",
  words: 0,
  props: {},
  locked: false,
  ...extra,
});

const TASK: TagSchema = { name: "task", color: "green", path: "tags/task.yaml", views: [], properties: [{ key: "due", type: "date", options: [] }, { key: "status", type: "select", options: ["Todo"] }] };
const TRAVEL: TagSchema = { name: "travel", color: "teal", path: "tags/travel.yaml", views: [], properties: [{ key: "start", type: "date", options: [] }, { key: "back", type: "date", options: [] }] };

describe("notes on days", () => {
  it("reads days from values", () => {
    expect(asDay("2026-10-01")).toBe("2026-10-01");
    expect(asDay("2026-10-01T09:00:00Z")).toBe("2026-10-01");
    expect(asDay("2026-02-30")).toBeNull();
    expect(asDay("")).toBeNull();
    expect(asDay(20261001)).toBeNull();
  });

  it("finds every date property, by schema or by a well-known key", () => {
    const notes = [
      note("a.md", { tags: ["task"], props: { due: "2026-10-02", status: "Todo" } }),
      note("b.md", { tags: ["travel"], props: { start: "2026-10-01", back: "2026-10-05" } }),
      note("c.md", { props: { deadline: "2026-10-03", note: "2026-10-04" } }),
      note("d.md", { tags: ["travel"], props: { start: "2026-10-06", back: "2026-10-04" } }),
      note("templates/t.md", { kind: "template", props: { due: "2026-10-01", start: "2026-10-01", end: "2026-10-02" } }),
    ];
    const schemas = [TASK, TRAVEL];
    const items = dateItems(notes, schemas);
    // A trip's start and back make one range, not two days; one that comes
    // back before it leaves stays two days.
    expect(items.map((i) => [i.path, i.key, i.day, i.tag])).toEqual([
      ["a.md", "due", "2026-10-02", "task"],
      ["c.md", "deadline", "2026-10-03", null],
      ["d.md", "back", "2026-10-04", "travel"],
      ["d.md", "start", "2026-10-06", "travel"],
    ]);
    expect(dateItems(notes, schemas)).toBe(items);
    expect([...byDay(items).keys()]).toEqual(["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-06"]);
    const ranges = dateRanges(notes, schemas);
    expect(ranges.map((r) => [r.path, r.startKey, r.endKey, r.start, r.end, r.tag])).toEqual([["b.md", "start", "back", "2026-10-01", "2026-10-05", "travel"]]);
    expect(dateRanges(notes, schemas)).toBe(ranges);
  });

  it("pairs well-known keys without a schema, and leaves the rest as days", () => {
    const notes = [
      note("trip.md", { props: { from: "2026-10-01", to: "2026-10-03", due: "2026-09-30" } }),
      note("far.md", { props: { start: "2026-01-01", end: "2027-06-01" } }),
    ];
    expect(dateRanges(notes, []).map((r) => `${r.path} ${r.startKey}..${r.endKey}`)).toEqual(["trip.md from..to"]);
    // Over a year apart: two days, as before ranges.
    expect(dateItems(notes, []).map((i) => `${i.path} ${i.key}`)).toEqual(["far.md start", "trip.md due", "far.md end"]);
  });

  it("orders a day's notes by title, then path, the same patched or rebuilt", () => {
    // Random vaults and random edits: patching the last lists must give
    // exactly what building them again gives, for days and for ranges.
    let seed = 11;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    const day = () => `2026-10-${String((next() % 5) + 1).padStart(2, "0")}`;
    const titles = ["Alpha", "alpha", "Beta", "Émile", "Zed"];
    const extra = () => [{}, { start: day() }, { start: day(), end: day() }, { from: day(), to: day() }][next() % 4];
    const make = (i: number) => note(`n/${String(i).padStart(3, "0")}.md`, { title: titles[next() % titles.length], tags: next() % 2 ? ["task"] : [], props: next() % 4 ? { due: day(), ...extra() } : {} });
    // One schemas list throughout, as the views keep theirs, so each edit is patched.
    const schemas = [TASK];
    const days = (items: DateItem[]) => items.map((i) => `${i.day} ${i.note.title} ${i.path} ${i.key}`);
    const spans = (ranges: DateRange[]) => ranges.map((r) => `${r.start} ${r.end} ${r.note.title} ${rangeId(r)}`);
    for (let round = 0; round < 40; round++) {
      let notes = Array.from({ length: 60 }, (_, i) => make(i));
      dateItems(notes, schemas);
      for (let edit = 0; edit < 6; edit++) {
        const copy = [...notes];
        const at = next() % copy.length;
        const change = next() % 3;
        if (change === 0) copy[at] = make(at);
        else if (change === 1) copy.splice(at, 1);
        else copy.splice(at, 0, make(1000 + round * 10 + edit));
        notes = copy;
        // Ranges asked for first half the time, days first the other half.
        const patched = edit % 2 ? { ranges: spans(dateRanges(notes, schemas)), days: days(dateItems(notes, schemas)) } : { days: days(dateItems(notes, schemas)), ranges: spans(dateRanges(notes, schemas)) };
        const rebuilt = buildDates(notes, schemas);
        expect(patched).toEqual({ days: days(rebuilt.items), ranges: spans(rebuilt.ranges) });
      }
    }
  });

  it("does not parse a note again unless it changed", () => {
    const notes = Array.from({ length: 3000 }, (_, i) => note(`n/${i}.md`, { props: { due: `2026-10-${String((i % 28) + 1).padStart(2, "0")}` } }));
    const schemas = [TASK];
    const first = dateItems(notes, schemas);
    const changed = [...notes];
    changed[7] = { ...notes[7]!, props: { due: "2026-12-24" } };
    const second = dateItems(changed, schemas);
    expect(second.length).toBe(first.length);
    expect(second.at(-1)!.path).toBe("n/7.md");
    // Untouched notes keep their very items.
    const other = (list: typeof first) => list.find((i) => i.path === "n/8.md");
    expect(other(second)).toBe(other(first));
  });

  it("patches ranges after a save as it patches days", () => {
    const notes = Array.from({ length: 3000 }, (_, i) => note(`n/${i}.md`, { props: { start: `2026-10-${String((i % 20) + 1).padStart(2, "0")}`, end: "2026-10-25" } }));
    const schemas: TagSchema[] = [];
    const first = dateRanges(notes, schemas);
    const changed = [...notes];
    changed[7] = { ...notes[7]!, props: { start: "2026-12-24", end: "2026-12-27" } };
    const second = dateRanges(changed, schemas);
    expect(second.length).toBe(first.length);
    expect(rangeId(second.at(-1)!)).toBe("n/7.md#start..end");
    const other = (list: typeof first) => list.find((r) => r.path === "n/8.md");
    expect(other(second)).toBe(other(first));
    // A pair is a range and nothing else.
    expect(dateItems(changed, schemas).length).toBe(0);
  });

  it("keeps both lists as they were when a save touches an undated note", () => {
    const notes = [note("a.md", { props: { due: "2026-10-02" } }), note("b.md", { props: { start: "2026-10-01", end: "2026-10-04" } }), note("c.md")];
    const schemas = [TASK];
    const items = dateItems(notes, schemas);
    const ranges = dateRanges(notes, schemas);
    const typed = [notes[0]!, notes[1]!, { ...notes[2]!, excerpt: "Typing" }];
    expect(dateItems(typed, schemas)).toBe(items);
    expect(dateRanges(typed, schemas)).toBe(ranges);
    // A dated one changes only its own list.
    const moved = [notes[0]!, { ...notes[1]!, props: { start: "2026-10-02", end: "2026-10-04" } }, typed[2]!];
    expect(dateItems(moved, schemas)).toBe(items);
    expect(dateRanges(moved, schemas).map((r) => r.start)).toEqual(["2026-10-02"]);
  });

  it("gathers what was made and edited each day", () => {
    const notes = [
      note("new.md", { created: "2026-09-24T08:00:00Z" }),
      note("old.md", { created: "2026-01-02T08:00:00Z" }),
      note("journal/2026/2026-09-24.md", { kind: "journal" }),
    ];
    const day = activityByDay(notes).get("2026-09-24")!;
    expect(day.created.map((n) => n.path)).toEqual(["new.md"]);
    expect(day.edited.map((n) => n.path)).toEqual(["old.md"]);
    expect(activityByDay(notes).get("2026-01-02")!.created.map((n) => n.path)).toEqual(["old.md"]);
  });

  it("draws months and weeks from Monday", () => {
    const grid = monthGrid(2026, 8);
    expect(grid).toHaveLength(6);
    // September 2026 starts on a Tuesday.
    expect(grid[0]![0]).toBe("2026-08-31");
    expect(grid[0]![1]).toBe("2026-09-01");
    expect(weekOf("2026-09-24")).toEqual(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
    expect(weekOf("2026-09-24", 0)[0]).toBe("2026-09-20");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });
});
