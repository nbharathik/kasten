import { describe, expect, it } from "vitest";

import { numberFrom, readableDate, sameValue, urlLabel } from "./format";

describe("cell values as the table shows and sends them", () => {
  it("reads dates as a day, with the time when there is one", () => {
    const day = readableDate("2026-10-02");
    expect(day).toMatch(/2026/);
    expect(day).not.toMatch(/2026-10-02/);
    expect(readableDate("2026-10-02T09:30:00+02:00")).toMatch(/^.*2026.*\d{1,2}[:.]\d{2}/);
    expect(readableDate("next week")).toBe("next week");
    expect(readableDate(null)).toBe("");
  });

  it("shortens links to their host and path", () => {
    expect(urlLabel("https://github.com/me/repo/")).toBe("github.com/me/repo");
    expect(urlLabel("http://www.example.org")).toBe("example.org");
    expect(urlLabel("mailto:alex@example.org")).toBe("alex@example.org");
    expect(urlLabel("not a link")).toBe("not a link");
  });

  it("sends typed numbers as numbers, and anything else as typed for the core to judge", () => {
    expect(numberFrom(" 12.5 ")).toBe(12.5);
    expect(numberFrom("")).toBeNull();
    expect(numberFrom("lots")).toBe("lots");
  });

  it("compares values, taking every empty value as the same", () => {
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue("", [])).toBe(true);
    expect(sameValue(["a"], ["a"])).toBe(true);
    expect(sameValue(["a"], ["b"])).toBe(false);
    expect(sameValue(3, "3")).toBe(false);
    expect(sameValue(false, null)).toBe(false);
  });
});
