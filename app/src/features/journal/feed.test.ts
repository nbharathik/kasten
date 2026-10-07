import { describe, expect, it } from "vitest";

import type { NoteMeta } from "../../lib/vault/types";
import { dayMarks, daysBack, relativeDay } from "./feed";

const note = (path: string, extra: Partial<NoteMeta> = {}): NoteMeta => ({
  path,
  id: null,
  title: path.replace(/^.*\/|\.md$/g, ""),
  kind: path.startsWith("journal/") ? "journal" : "page",
  icon: null,
  cover: null,
  parent: null,
  project: null,
  tags: [],
  modified: new Date(2026, 8, 23, 12).getTime(),
  created: null,
  updated: null,
  excerpt: "",
  words: 0,
  props: {},
  locked: false,
  ...extra,
});

describe("journal marks", () => {
  const notes = [
    note("journal/2026/2026-09-20.md"),
    note("journal/2026/2026-09-22.md"),
    note("journal/2026/2026-09-30.md"),
    note("library/idea.md", { created: "2026-09-22T09:00:00Z" }),
  ];

  it("marks days with pages, activity, things due and things under way", () => {
    const trip = { path: "library/trip.md", note: notes[3]!, startKey: "start", endKey: "end", start: "2026-09-25", end: "2026-09-27", tag: "travel" };
    const marks = dayMarks(notes, [{ path: "library/idea.md", note: notes[3]!, key: "due", day: "2026-09-25", tag: "task" }], [trip]);
    expect(marks.get("2026-09-20")).toEqual({ journal: true, activity: 0, due: 0, ongoing: 0 });
    expect(marks.get("2026-09-22")).toEqual({ journal: true, activity: 1, due: 0, ongoing: 0 });
    expect(marks.get("2026-09-23")).toEqual({ journal: false, activity: 1, due: 0, ongoing: 0 });
    expect(marks.get("2026-09-25")).toEqual({ journal: false, activity: 0, due: 1, ongoing: 1 });
    expect(marks.get("2026-09-26")).toEqual({ journal: false, activity: 0, due: 0, ongoing: 1 });
    expect(marks.get("2026-09-27")).toEqual({ journal: false, activity: 0, due: 0, ongoing: 1 });
    expect(marks.get("2026-09-28")).toBeUndefined();
  });

  it("names nearby days", () => {
    expect(relativeDay("2026-09-24", "2026-09-24", "2026-09-23", "2026-09-25")).toBe("Today");
    expect(relativeDay("2026-09-23", "2026-09-24", "2026-09-23", "2026-09-25")).toBe("Yesterday");
    expect(relativeDay("2026-09-01", "2026-09-24", "2026-09-23", "2026-09-25")).toBeNull();
  });
});

describe("journal days list", () => {
  it("goes back from today to the first page, and at least three weeks", async () => {
    const { daysBack, dayOfPath, journalPath } = await import("./feed");
    const days = daysBack([note("journal/2026/2026-08-20.md")], "2026-09-24");
    expect(days[0]).toBe("2026-09-24");
    expect(days.at(-1)).toBe("2026-08-20");
    expect(days).toHaveLength(36);
    expect(daysBack([], "2026-09-24")).toHaveLength(21);
    expect(daysBack([], "2026-03-02", 3)).toEqual(["2026-03-02", "2026-03-01", "2026-02-28"]);
    expect(journalPath("2026-09-24")).toBe("journal/2026/2026-09-24.md");
    expect(dayOfPath("journal/2026/2026-09-24.md", "2026-09-25")).toBe("2026-09-24");
    expect(dayOfPath(undefined, "2026-09-25")).toBe("2026-09-25");
  });
});

describe("journal days named otherwise", () => {
  it("reads a day from the file's name, and never walks past ten years", () => {
    // A folder opened as it is: days named 05-09-2026, and a note titled in words.
    const odd = [note("journal/05-09-2026.md"), note("journal/2024/first.md", { title: "1 January 2024" }), note("journal/0999/0999-01-01.md")];
    const days = daysBack(odd, "2026-09-24");
    expect(days[0]).toBe("2026-09-24");
    expect(days).toHaveLength(3660);
    expect(days.at(-1)).toBe("2016-09-17");
    expect(daysBack([note("journal/2026/x.md", { title: "12-05-2026" })], "2026-09-24")).toHaveLength(21);
  });
});
