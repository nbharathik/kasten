import { describe, expect, it } from "vitest";

import { addDays, daysBetween } from "../../lib/dates";
import type { NoteMeta, TagSchema } from "../../lib/vault/types";
import { byStart, dayOfRange, eachDay, findRanges, MAX_DAYS, rangeDays, rangeId, rangesBetween, type DateRange } from "./ranges";

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
  modified: 0,
  created: null,
  updated: null,
  excerpt: "",
  words: 0,
  props: {},
  locked: false,
  ...extra,
});

const schema = (name: string, dates: string[], other: string[] = []): TagSchema => ({
  name,
  color: "teal",
  path: `tags/${name}.yaml`,
  views: [],
  properties: [...other.map((key) => ({ key, type: "text", options: [] })), ...dates.map((key) => ({ key, type: "date", options: [] }))],
});

/** The ranges a note's props form, as `startKey-endKey start end`. */
function ranges(props: Record<string, string>, schemas: TagSchema[] = [], tags: string[] = []): string[] {
  const days = new Map(Object.entries(props).filter(([, v]) => /^\d{4}-\d{2}-\d{2}$/.test(v)));
  const found = findRanges(note("a.md", { tags, props }), days, schemas, () => null);
  return found.map((r) => `${r.startKey}-${r.endKey} ${r.start} ${r.end}`);
}

const range = (path: string, start: string, end: string, extra: Partial<DateRange> = {}): DateRange => ({ path, note: note(path), startKey: "start", endKey: "end", start, end, tag: null, ...extra });

describe("day arithmetic", () => {
  it("counts the days between two days, across months, years and clock changes", () => {
    expect(daysBetween("2026-09-24", "2026-09-24")).toBe(0);
    expect(daysBetween("2026-09-24", "2026-10-02")).toBe(8);
    expect(daysBetween("2026-10-02", "2026-09-24")).toBe(-8);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    // Europe's clocks go back on 25 October 2026 and forward on 29 March.
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("date ranges", () => {
  it("pairs start and end, from and to, begin and end, and start and back", () => {
    expect(ranges({ start: "2026-10-01", end: "2026-10-05" })).toEqual(["start-end 2026-10-01 2026-10-05"]);
    expect(ranges({ from: "2026-10-01", to: "2026-10-03" })).toEqual(["from-to 2026-10-01 2026-10-03"]);
    expect(ranges({ begin: "2026-10-01", end: "2026-10-02" })).toEqual(["begin-end 2026-10-01 2026-10-02"]);
    expect(ranges({ start: "2026-10-01", back: "2026-10-09" })).toEqual(["start-back 2026-10-01 2026-10-09"]);
    // One day alone is no range.
    expect(ranges({ start: "2026-10-01" })).toEqual([]);
    expect(ranges({ start: "2026-10-01", due: "2026-10-03" })).toEqual([]);
  });

  it("pairs a tag schema's only two dates, in the schema's order", () => {
    const leave = schema("leave", ["away", "home"], ["where"]);
    expect(ranges({ home: "2026-10-06", away: "2026-10-02" }, [leave], ["Leave"])).toEqual(["away-home 2026-10-02 2026-10-06"]);
    // Without the tag, or with a third date in the schema, the keys pair by name only.
    expect(ranges({ home: "2026-10-06", away: "2026-10-02" }, [leave])).toEqual([]);
    const three = schema("event", ["away", "home", "rsvp"]);
    expect(ranges({ away: "2026-10-02", home: "2026-10-06", rsvp: "2026-09-30" }, [three], ["event"])).toEqual([]);
  });

  it("names the tag whose schema makes the pair dates", () => {
    const days = new Map([
      ["start", "2026-10-01"],
      ["end", "2026-10-04"],
    ]);
    const found = findRanges(note("a.md", { tags: ["plain", "event"] }), days, [], (key) => (key === "end" ? "event" : null));
    expect(found.map((r) => r.tag)).toEqual(["event"]);
    // As the note spells it, like a single day's tag.
    const travel = schema("travel", ["start", "end"]);
    expect(findRanges(note("a.md", { tags: ["Travel"] }), days, [travel], () => null).map((r) => r.tag)).toEqual(["Travel"]);
  });

  it("ignores a pair whose end is before its start, or which spans more than 366 days", () => {
    expect(ranges({ start: "2026-10-05", end: "2026-10-01" })).toEqual([]);
    expect(ranges({ start: "2026-10-05", end: "2026-10-05" })).toEqual(["start-end 2026-10-05 2026-10-05"]);
    expect(MAX_DAYS).toBe(366);
    expect(ranges({ start: "2026-01-01", end: "2027-01-01" })).toEqual(["start-end 2026-01-01 2027-01-01"]);
    expect(ranges({ start: "2026-01-01", end: "2027-01-02" })).toEqual([]);
    // A leap year's 366 days fit.
    expect(ranges({ start: "2028-01-01", end: "2028-12-31" })).toEqual(["start-end 2028-01-01 2028-12-31"]);
  });

  it("uses each key once, preferring a schema's pair, then start and end", () => {
    expect(ranges({ start: "2026-10-01", end: "2026-10-03", back: "2026-10-09" })).toEqual(["start-end 2026-10-01 2026-10-03"]);
    expect(ranges({ begin: "2026-10-01", start: "2026-10-02", end: "2026-10-03" })).toEqual(["start-end 2026-10-02 2026-10-03"]);
    // A bad pair frees its keys for the next one.
    expect(ranges({ start: "2026-10-05", end: "2026-10-01", back: "2026-10-09" })).toEqual(["start-back 2026-10-05 2026-10-09"]);
    expect(ranges({ start: "2026-10-01", end: "2026-10-03", from: "2026-11-01", to: "2026-11-02" })).toEqual(["start-end 2026-10-01 2026-10-03", "from-to 2026-11-01 2026-11-02"]);
    const trip = schema("trip", ["start", "back"]);
    expect(ranges({ start: "2026-10-01", end: "2026-10-03", back: "2026-10-09" }, [trip], ["trip"])).toEqual(["start-back 2026-10-01 2026-10-09"]);
  });

  it("says how long a range is and which of its days a day is", () => {
    const trip = range("trip.md", "2026-09-28", "2026-10-02");
    expect(rangeDays(trip)).toBe(5);
    expect(dayOfRange(trip, "2026-09-28")).toEqual({ day: 1, of: 5 });
    expect(dayOfRange(trip, "2026-09-29")).toEqual({ day: 2, of: 5 });
    expect(dayOfRange(trip, "2026-10-02")).toEqual({ day: 5, of: 5 });
    expect(eachDay(trip)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(eachDay(trip)).toBe(eachDay(trip));
    // The last days there are end.
    expect(eachDay(range("forever.md", "9999-12-30", "9999-12-31"))).toEqual(["9999-12-30", "9999-12-31"]);
    expect(rangeId(trip)).toBe("trip.md#start..end");
    expect(rangeId(trip)).not.toBe(rangeId({ ...trip, endKey: "back" }));
  });

  it("orders by start, longer first, then by title and path", () => {
    const list = [range("b.md", "2026-10-02", "2026-10-03"), range("a.md", "2026-10-02", "2026-10-06"), range("c.md", "2026-10-01", "2026-10-01"), range("d.md", "2026-10-02", "2026-10-03")];
    expect(list.sort(byStart).map((r) => r.path)).toEqual(["c.md", "a.md", "b.md", "d.md"]);
  });

  it("finds the ranges that touch a stretch of days", () => {
    const list = [
      range("long.md", "2026-01-10", "2026-12-20"),
      range("before.md", "2026-09-01", "2026-09-27"),
      range("edge.md", "2026-09-20", "2026-09-28"),
      range("inside.md", "2026-10-02", "2026-10-04"),
      range("last.md", "2026-11-08", "2026-11-09"),
      range("after.md", "2026-11-09", "2026-11-12"),
    ].sort(byStart);
    expect(rangesBetween(list, "2026-09-28", "2026-11-08").map((r) => r.path)).toEqual(["long.md", "edge.md", "inside.md", "last.md"]);
    expect(rangesBetween(list, "2026-10-03", "2026-10-03").map((r) => r.path)).toEqual(["long.md", "inside.md"]);
    expect(rangesBetween([], "2026-10-03", "2026-10-03")).toEqual([]);
  });

  it("finds a day's ranges among thousands quickly", () => {
    const list: DateRange[] = [];
    for (let i = 0; i < 4000; i++) list.push(range(`n${i}.md`, addDays("2026-01-01", i % 365), addDays("2026-01-01", (i % 365) + (i % 7))));
    list.sort(byStart);
    const t = performance.now();
    let found = 0;
    for (let d = 0; d < 42; d++) found += rangesBetween(list, addDays("2026-09-01", d), addDays("2026-09-01", d)).length;
    expect(found).toBeGreaterThan(0);
    // A few milliseconds for six weeks of days; generous for slow machines.
    expect(performance.now() - t).toBeLessThan(60);
  });
});
