import { describe, expect, it } from "vitest";

import type { NoteMeta } from "../../lib/vault/types";
import { barsOver, fitBars, weekBars } from "./lanes";
import { rangeId, type DateRange } from "./ranges";

const note = (path: string): NoteMeta => ({
  path,
  id: null,
  title: path.replace(/\.md$/, ""),
  kind: "page",
  icon: null,
  cover: null,
  parent: null,
  project: null,
  tags: [],
  modified: 0,
  created: null,
  updated: null,
  excerpt: "",
  words: 0,
  props: {},
  locked: false,
});

const range = (path: string, start: string, end: string): DateRange => ({ path, note: note(path), startKey: "start", endKey: "end", start, end, tag: null });

// Monday 21 to Sunday 27 September 2026.
const WEEK = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"];

const D = range("d.md", "2026-09-21", "2026-09-27");
const A = range("a.md", "2026-09-21", "2026-09-23");
const B = range("b.md", "2026-09-22", "2026-09-25");
const C = range("c.md", "2026-09-24", "2026-09-27");

/** Each bar as `path lane from-to`, with ( or ) where it starts or ends this week. */
const shape = (ranges: DateRange[], first?: string) =>
  weekBars(ranges, WEEK, first).bars.map((b) => `${b.range.path} ${b.lane} ${b.starts ? "(" : ""}${b.from}-${b.to}${b.ends ? ")" : ""}`);

describe("bars in a week", () => {
  it("fills lanes greedily: earlier start first, longer first", () => {
    const week = weekBars([C, B, A, D], WEEK);
    expect(week.lanes).toBe(3);
    expect(shape([C, B, A, D])).toEqual(["d.md 0 (0-6)", "a.md 1 (0-2)", "b.md 2 (1-4)", "c.md 1 (3-6)"]);
  });

  it("clips a range to the week and leaves its ends open where it runs on", () => {
    const through = range("through.md", "2026-09-18", "2026-09-30");
    const from = range("from.md", "2026-09-26", "2026-10-02");
    const into = range("into.md", "2026-09-15", "2026-09-22");
    const away = range("away.md", "2026-09-28", "2026-10-01");
    expect(shape([through, from, into, away])).toEqual(["into.md 0 0-1)", "through.md 1 0-6", "from.md 0 (5-6"]);
  });

  it("keeps one range on top when asked, as while it moves by keyboard", () => {
    // The others fill in around it, wherever they fit.
    expect(shape([A, B, C, D], rangeId(C))).toEqual(["c.md 0 (3-6)", "d.md 1 (0-6)", "a.md 0 (0-2)", "b.md 2 (1-4)"]);
  });

  it("lists the ranges over a day, top lane first", () => {
    const week = weekBars([A, B, C, D], WEEK);
    expect(barsOver(week, 2).map((b) => b.range.path)).toEqual(["d.md", "a.md", "b.md"]);
    expect(barsOver(week, 6).map((b) => b.range.path)).toEqual(["d.md", "c.md"]);
    expect(barsOver(weekBars([], WEEK), 0)).toEqual([]);
  });
});

describe("fitting bars into a month's cells", () => {
  const none = [0, 0, 0, 0, 0, 0, 0];

  it("gives each day's lanes the lines they need", () => {
    const fit = fitBars(weekBars([A, B, C, D], WEEK), 3, none);
    expect(fit.shown).toBe(3);
    expect(fit.days.map((d) => d.lanes)).toEqual([2, 3, 3, 3, 3, 2, 2]);
    expect(fit.days.map((d) => d.hidden)).toEqual(none);
    // An empty lane between a day's bars still takes its line: lanes line
    // up across the week (Thursday: D, a gap where A ended, then X).
    const gap = fitBars(weekBars([D, A, range("x.md", "2026-09-22", "2026-09-24")], WEEK), 3, none);
    expect(gap.days.map((d) => d.lanes)).toEqual([2, 3, 3, 3, 1, 1, 1]);
  });

  it("hides the lowest lane when a full day needs a line for “+N more”", () => {
    // Tuesday's three lanes fill its three lines, and it has a note of its own.
    const fit = fitBars(weekBars([A, B, C, D], WEEK), 3, [0, 1, 0, 0, 0, 0, 0]);
    expect(fit.shown).toBe(2);
    expect(fit.days.map((d) => d.lanes)).toEqual([2, 2, 2, 2, 2, 2, 2]);
    // B, in the hidden lane, counts on each of its days.
    expect(fit.days.map((d) => d.hidden)).toEqual([0, 1, 1, 1, 1, 0, 0]);
  });

  it("counts the bars that do not fit on the days they cover", () => {
    const monday = ["m1", "m2", "m3", "m4"].map((p) => range(`${p}.md`, "2026-09-21", "2026-09-21"));
    const fit = fitBars(weekBars(monday, WEEK), 3, none);
    expect(fit.shown).toBe(2);
    expect(fit.days[0]).toEqual({ lanes: 2, hidden: 2 });
    expect(fit.days[1]).toEqual({ lanes: 0, hidden: 0 });
    // A tall cell shows them all.
    expect(fitBars(weekBars(monday, WEEK), 8, none).days[0]).toEqual({ lanes: 4, hidden: 0 });
  });

  it("shows every lane that fits with nothing else on the day", () => {
    const three = ["m1", "m2", "m3"].map((p) => range(`${p}.md`, "2026-09-21", "2026-09-22"));
    const fit = fitBars(weekBars(three, WEEK), 3, [0, 0, 2, 0, 0, 0, 0]);
    expect(fit.shown).toBe(3);
    expect(fit.days[0]).toEqual({ lanes: 3, hidden: 0 });
    expect(fit.days[2]).toEqual({ lanes: 0, hidden: 0 });
  });
});
