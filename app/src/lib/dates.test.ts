import { describe, expect, it } from "vitest";

import { longDay, relativeTime, stampDay } from "./dates";

describe("longDay", () => {
  it("writes a day as the locale does", () => {
    const expected = new Date(2026, 8, 24).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    expect(longDay("2026-09-24")).toBe(expected);
  });

  it("leaves text that is not a day alone", () => {
    expect(longDay("someday")).toBe("someday");
  });

  it("formats thousands of days quickly", () => {
    const start = performance.now();
    for (let i = 0; i < 5000; i++) longDay(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`);
    // Formatting with a new formatter per call took about 20 ms per 1,000.
    expect(performance.now() - start).toBeLessThan(250);
  });
});

describe("relativeTime", () => {
  it("writes an older time as a short date", () => {
    const then = new Date(2026, 0, 5).getTime();
    const expected = new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    expect(relativeTime(then, new Date(2026, 8, 24).getTime())).toBe(expected);
  });

  it("says just now and yesterday", () => {
    const now = new Date(2026, 8, 24, 12).getTime();
    expect(relativeTime(now - 10_000, now)).toBe("just now");
    expect(relativeTime(now - 26 * 3_600_000, now)).toBe("yesterday");
  });
});

describe("stampDay", () => {
  it("reads the day as written, in any time zone", () => {
    const expected = new Date(2026, 8, 24).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    expect(stampDay("2026-09-24")).toBe(expected);
    expect(stampDay("2026-09-24T00:30:00+14:00")).toBe(expected);
    expect(stampDay("2026-09-24T23:30:00-11:00")).toBe(expected);
    expect(stampDay("someday")).toBe("");
  });
});
