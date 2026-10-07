import type { Element } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { agree, describe as describeSelection, json, only, same, shared, turnOf, unionOf } from "./values.ts";

const el = (type: Element["type"]): Element => ({ type, id: type }) as Element;

describe("what a selection agrees on", () => {
  it("has the one value they share, the empty value for none, and mixed for several", () => {
    expect(agree([3, 3, 3], 0)).toBe(3);
    expect(agree([], 7)).toBe(7);
    expect(agree([1, 2], 0)).toBe("mixed");
    expect(agree([null, null], "x")).toBeNull();
    expect(agree([{ a: 1 }, { a: 1 }], null)).toEqual({ a: 1 });
    expect(agree([{ a: 1 }, { a: 2 }], null)).toBe("mixed");
  });

  it("tells mixed apart from a value that is the word mixed, for text", () => {
    expect(shared(["mixed", "mixed"], "")).toEqual({ value: "mixed", mixed: false });
    expect(shared(["a", "b"], "")).toEqual({ value: "", mixed: true });
    expect(shared([], "none")).toEqual({ value: "none", mixed: false });
  });

  it("compares by what things hold", () => {
    expect(same({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(same({ a: 1 }, { a: 2 })).toBe(false);
    expect(same(undefined, undefined)).toBe(true);
  });
});

describe("boxes and angles", () => {
  it("finds the box around boxes", () => {
    expect(unionOf([])).toBeNull();
    expect(unionOf([{ x: 10, y: 10, w: 20, h: 20 }])).toEqual({ x: 10, y: 10, w: 20, h: 20 });
    expect(unionOf([{ x: 10, y: 50, w: 20, h: 20 }, { x: 100, y: 0, w: 5, h: 5 }])).toEqual({ x: 10, y: 0, w: 95, h: 70 });
  });

  it("keeps an angle from 0 up to 360", () => {
    expect([0, 90, 360, 450, -90, -720, 12.345].map(turnOf)).toEqual([0, 90, 0, 90, 270, 0, 12.35]);
    // Rounding up to a whole turn is no turn.
    expect(turnOf(359.999)).toBe(0);
  });
});

describe("naming a selection", () => {
  it("names one element by its kind, and many by how many", () => {
    expect(describeSelection([el("text")])).toBe("Text box");
    expect(describeSelection([el("shape")])).toBe("Shape");
    expect(describeSelection([el("shape"), el("shape")])).toBe("2 shapes");
    expect(describeSelection([el("line"), el("image"), el("table")])).toBe("3 elements");
    expect(describeSelection([])).toBe("");
  });
});

describe("helpers for patches", () => {
  it("picks out the elements of one kind", () => {
    expect(only([el("shape"), el("image"), el("shape")], "shape")).toHaveLength(2);
  });

  it("makes plain JSON, dropping what is absent", () => {
    expect(json({ a: 1, b: undefined, c: [1, undefined] })).toEqual({ a: 1, c: [1, null] });
    expect(json(undefined)).toBeNull();
  });
});
