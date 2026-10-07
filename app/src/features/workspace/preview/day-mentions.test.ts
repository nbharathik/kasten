// The same cases as the core's (tests/core/index.rs), so the preview's
// calendar shows what the app's does.

import { describe, expect, it } from "vitest";

import { MemoryVault } from "./memory-vault";

describe("the calendar's mentions in the preview", () => {
  it("finds the notes that link each day, outside to-dos and the day's own page", async () => {
    const vault = new MemoryVault({
      "library/plan.md": "---\ntitle: Plan\n---\nKickoff on [[2026-10-01]].\n- [ ] Book the room [[2026-10-02]]\n",
      "library/notes.md": "---\ntitle: Notes\n---\nSee [[2026-10-01]] and [[2026-10-20|the review]], not [[2026-11-01]].\n",
      "journal/2026/2026-10-01.md": '---\ntitle: "2026-10-01"\ntype: journal\n---\nToday is [[2026-10-01]]. Follow up on [[2026-10-09]].\n',
    });
    const all = await vault.dayMentions("2026-10-01", "2026-10-31");
    // Each says what kind of note it is, for its icon and name.
    expect(all.find((m) => m.day === "2026-10-09")).toMatchObject({ kind: "journal", path: "journal/2026/2026-10-01.md" });
    expect(all.filter((m) => m.day !== "2026-10-09").every((m) => m.kind === "page")).toBe(true);
    const found = all.filter((m) => m.day !== "2026-10-09").map((m) => [m.day, m.path]);
    expect([...found].sort()).toEqual([
      ["2026-10-01", "library/notes.md"],
      ["2026-10-01", "library/plan.md"],
      ["2026-10-20", "library/notes.md"],
    ]);
    expect(found.map(([day]) => day)).toEqual([...found.map(([day]) => day)].sort());
  });
});
