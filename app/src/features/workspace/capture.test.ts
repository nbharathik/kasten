import { describe, expect, it } from "vitest";

import { byDay, caughtAt } from "./capture";

const card = (title: string, created: string | null, modified = 0) => ({ title, created, modified });
const NOW = new Date("2026-09-25T15:00:00");

describe("the Inbox's days", () => {
  it("groups captures by the day they were caught, newest first", () => {
    const groups = byDay(
      [
        card("Old", "2026-08-02T10:00:00"),
        card("This morning", "2026-09-25T08:00:00"),
        card("Last night", "2026-09-24T22:00:00"),
        card("Just now", "2026-09-25T14:59:00"),
        card("Monday", "2026-09-21T09:00:00"),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.label, g.cards.map((c) => c.title)])).toEqual([
      ["Today", ["Just now", "This morning"]],
      ["Yesterday", ["Last night"]],
      [new Date("2026-09-21T12:00:00").toLocaleDateString(undefined, { weekday: "long" }), ["Monday"]],
      [new Date("2026-08-02T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "long" }), ["Old"]],
    ]);
  });

  it("falls back to the file's time without a created stamp", () => {
    const at = new Date("2026-09-25T09:30:00").getTime();
    expect(caughtAt(card("No stamp", null, at))).toBe(at);
  });
});
