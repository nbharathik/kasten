// @vitest-environment node

import { describe, expect, it } from "vitest";

import { jsonEqual } from "./equal.ts";

describe("jsonEqual", () => {
  it("holds two values with the same content equal, however deep", () => {
    const a = { type: "text", id: "e", text: { paragraphs: [{ runs: [{ t: "x", b: true }] }] }, style: { opacity: 0.5 }, list: [1, [2, { z: null }]] };
    expect(jsonEqual(a, structuredClone(a))).toBe(true);
  });

  it("does not care in what order keys were written", () => {
    expect(jsonEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("tells values that differ anywhere apart", () => {
    const a = { runs: [{ t: "x" }, { t: "y" }] };
    expect(jsonEqual(a, { runs: [{ t: "x" }, { t: "z" }] })).toBe(false);
    expect(jsonEqual(a, { runs: [{ t: "x" }] })).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jsonEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    expect(jsonEqual({ a: undefined }, { b: undefined })).toBe(false);
  });

  it("tells kinds of value apart", () => {
    expect(jsonEqual([], {})).toBe(false);
    expect(jsonEqual({}, [])).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
    expect(jsonEqual({}, null)).toBe(false);
    expect(jsonEqual(1, "1")).toBe(false);
    expect(jsonEqual(null, null)).toBe(true);
    expect(jsonEqual("a", "a")).toBe(true);
    expect(jsonEqual(0, -0)).toBe(true);
  });
});
