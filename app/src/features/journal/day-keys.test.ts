// Stepping through the journal by keys, and weeks that start on the day
// the person chose.

import { beforeEach, describe, expect, it } from "vitest";

import { addDays, isoDay } from "../../lib/dates";
import { periodDays, periodTitle } from "../calendar/layout";
import { DEFAULT_KEYS } from "../shortcuts/keymap";
import { COMMANDS } from "../workspace/overlays/commands";
import { usePrefs } from "../workspace/prefs";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { journalPath } from "./feed";

const run = (id: string) => COMMANDS.find((c) => c.id === id)!.run();

beforeEach(async () => {
  localStorage.clear();
  await useWorkspace.getState().connect({ client: new MemoryVault({}) });
});

describe("the journal by keys", () => {
  it("steps a day back and forward from the day shown, or from today", () => {
    const today = isoDay(new Date());
    useWorkspace.getState().go({ view: "home" });
    run("prev-day");
    expect(useWorkspace.getState().place).toEqual({ view: "journal", path: journalPath(addDays(today, -1)) });
    run("prev-day");
    expect(useWorkspace.getState().place.path).toBe(journalPath(addDays(today, -2)));
    run("next-day");
    expect(useWorkspace.getState().place.path).toBe(journalPath(addDays(today, -1)));
    expect(DEFAULT_KEYS["prev-day"]).toEqual(["Mod+Alt+ArrowUp"]);
    expect(DEFAULT_KEYS["next-day"]).toEqual(["Mod+Alt+ArrowDown"]);
  });

  it("starts weeks on the day chosen", () => {
    // 28 September 2026 is a Monday.
    expect(periodDays("2026-09-30", "week")[0]![0]).toBe("2026-09-28");
    expect(periodDays("2026-09-30", "week", 0)[0]![0]).toBe("2026-09-27");
    expect(periodDays("2026-09-30", "week", 6)[0]![0]).toBe("2026-09-26");
    expect(periodDays("2026-09-30", "month", 0)[0]![0]).toBe("2026-08-30");
    expect(periodTitle("2026-09-30", "week", 0)).toContain("27");
    usePrefs.getState().set({ weekStart: 0 });
    expect(JSON.parse(localStorage.getItem("kasten.prefs")!).weekStart).toBe(0);
  });
});
