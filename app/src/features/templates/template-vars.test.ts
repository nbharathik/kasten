// The preview fills templates as the core does (template_vars.rs).

import { describe, expect, it } from "vitest";

import { calendarOf, dayAndTime, fillTemplate, localStamp } from "./template-vars";

const TEMPLATE = "{{weekday}} {{date}} at {{time}}, {{week}}, {{month}} {{year}}: {{title}}";

describe("template variables", () => {
  it("fill the weekday, week, month, year and time", () => {
    expect(fillTemplate(TEMPLATE, "Plan {{date}}", "2026-09-28T14:05", "")).toBe("Monday 2026-09-28 at 14:05, 2026-W40, September 2026: Plan {{date}}");
    expect(fillTemplate("{{time}}", "", "2026-09-24", "", new Date("2026-09-24T08:00:00Z"))).toBe("08:00 UTC");
  });

  it("count ISO weeks across the new year, as the core does", () => {
    expect(calendarOf("2027-01-01")).toMatchObject({ weekday: "Friday", week: "2026-W53" });
    expect(calendarOf("2026-01-01")).toMatchObject({ weekday: "Thursday", week: "2026-W01" });
    expect(calendarOf("2024-12-30")).toMatchObject({ weekday: "Monday", week: "2025-W01" });
    expect(calendarOf("2024-02-29")).toMatchObject({ weekday: "Thursday", week: "2024-W09" });
  });

  it("read only a day, or a day with the local time", () => {
    expect(dayAndTime("2026-09-28T14:05")).toEqual({ day: "2026-09-28", time: "14:05" });
    expect(dayAndTime("2026-09-28")).toEqual({ day: "2026-09-28", time: null });
    for (const bad of ["2026-09-28T25:00", "2026-09-28T1405", "2026-09-28 14:05", "2026-09-28T14:05:00"]) expect(dayAndTime(bad)).toBeNull();
    expect(localStamp(new Date(2026, 8, 28, 7, 4))).toBe("2026-09-28T07:04");
  });
});
