import { describe, expect, it } from "vitest";

import { tidy } from "./tidy.ts";

describe("tidy", () => {
  it.each([
    [157.60000000000002, 157.6],
    [290.59999999999997, 290.6],
    [390.00000000000006, 390],
    [29.999999999999993, 30],
    [89.99999999999999, 90],
    [-12.300000000000001, -12.3],
    [0.30000000000000004, 0.3],
  ])("takes the dust off %d", (dusty, clean) => {
    expect(tidy(dusty)).toBe(clean);
  });

  it.each([0, 1, -1, 100.37, 250.9, 959.999, 0.000001, 123456.789, -0.5])("leaves %d as it is", (n) => {
    expect(tidy(n)).toBe(n);
  });

  it("keeps a billionth and drops anything smaller", () => {
    expect(tidy(0.000000001)).toBe(0.000000001);
    expect(tidy(0.0000000004)).toBe(0);
    expect(tidy(0.0000000006)).toBe(0.000000001);
  });

  it("turns -0 and tiny negatives into a plain 0", () => {
    expect(Object.is(tidy(-0), 0)).toBe(true);
    expect(Object.is(tidy(-1e-12), 0)).toBe(true);
  });

  it("leaves numbers too large for the rounding alone", () => {
    expect(tidy(1e6)).toBe(1e6);
    expect(tidy(12345678.123456789)).toBe(12345678.123456789);
    expect(tidy(-9e15)).toBe(-9e15);
    // Two steps of the finest fraction a double has at this size: rounding to a billionth would lose it.
    expect(tidy(2000000.0000000005)).toBe(2000000.0000000005);
    expect(tidy(-2000000.0000000005)).toBe(-2000000.0000000005);
  });

  it("leaves what is not a number alone", () => {
    expect(tidy(Number.NaN)).toBeNaN();
    expect(tidy(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });
});
