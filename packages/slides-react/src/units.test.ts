import { describe, expect, it } from "vitest";

import { EMU_PER_UNIT, SLIDE_HEIGHT, SLIDE_WIDTH, emuToUnits, pointsToUnits, unitsToEmu, unitsToPoints } from "./units.ts";

describe("units", () => {
  it("makes a 16:9 slide 10 x 5.625 inches", () => {
    expect(unitsToEmu(SLIDE_WIDTH)).toBe(9_144_000);
    expect(unitsToEmu(SLIDE_HEIGHT)).toBe(5_143_500);
  });

  it("converts points to units and back", () => {
    expect(pointsToUnits(18)).toBe(24);
    expect(unitsToPoints(pointsToUnits(11))).toBeCloseTo(11);
  });

  it("converts EMU exactly at whole units", () => {
    expect(emuToUnits(EMU_PER_UNIT * 37)).toBe(37);
    expect(unitsToEmu(0.5)).toBe(4763);
  });
});
