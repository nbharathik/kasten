import { describe, expect, it } from "vitest";

import type { Item } from "./items.ts";
import { mirrorWithin, nudge, scaleWithin } from "./transform.ts";

describe("scaleWithin", () => {
  const from = { x: 100, y: 100, w: 200, h: 100 };
  const item: Item = { id: "a", x: 150, y: 120, w: 50, h: 20 };

  it.each<[string, { x: number; y: number; w: number; h: number }, { x: number; y: number; w: number; h: number }]>([
    ["stays as it was when the box does not change", from, { x: 150, y: 120, w: 50, h: 20 }],
    ["moves with the box", { x: 130, y: 90, w: 200, h: 100 }, { x: 180, y: 110, w: 50, h: 20 }],
    ["doubles about the box's corner", { x: 100, y: 100, w: 400, h: 200 }, { x: 200, y: 140, w: 100, h: 40 }],
    ["halves into a smaller box", { x: 0, y: 0, w: 100, h: 50 }, { x: 25, y: 10, w: 25, h: 10 }],
    ["stretches one way only", { x: 0, y: 0, w: 400, h: 300 }, { x: 100, y: 60, w: 100, h: 60 }],
    ["goes with a small box moved to the far corner", { x: 250, y: 150, w: 100, h: 50 }, { x: 275, y: 160, w: 25, h: 10 }],
  ])("%s", (_name, to, expected) => {
    const [out] = scaleWithin([item], from, to);
    expect(out).toEqual({ id: "a", ...expected });
  });

  it("maps every item and keeps their order", () => {
    const b: Item = { id: "b", x: 250, y: 150, w: 50, h: 50 };
    const out = scaleWithin([item, b], from, { x: 0, y: 0, w: 400, h: 200 });
    expect(out.map((o) => o.id)).toEqual(["a", "b"]);
    expect(out[1]).toEqual({ id: "b", x: 300, y: 100, w: 100, h: 100 });
  });

  it("keeps a group's outer edges on the target box", () => {
    const b: Item = { id: "b", x: 250, y: 150, w: 50, h: 50 };
    const [first, second] = scaleWithin([{ id: "a", x: 100, y: 100, w: 50, h: 20 }, b], from, { x: 10, y: 20, w: 300, h: 50 });
    expect(first?.x).toBeCloseTo(10, 9);
    expect(first?.y).toBeCloseTo(20, 9);
    expect((second?.x ?? 0) + (second?.w ?? 0)).toBeCloseTo(310, 9);
    expect((second?.y ?? 0) + (second?.h ?? 0)).toBeCloseTo(70, 9);
  });

  it("keeps rotation and other fields, and leaves its input alone", () => {
    const tagged = { id: "t", x: 150, y: 120, w: 50, h: 20, rotation: 30, locked: true, label: "kept" };
    const copy = { ...tagged };
    const [out] = scaleWithin([tagged], from, { x: 100, y: 100, w: 400, h: 200 });
    expect(out?.rotation).toBe(30);
    expect(out?.locked).toBe(true);
    expect(out?.label).toBe("kept");
    expect(tagged).toEqual(copy);
  });

  it("scales a turned item uniformly to the same share of the box", () => {
    const [out] = scaleWithin([{ ...item, rotation: 30 }], from, { x: 100, y: 100, w: 400, h: 200 });
    expect(out?.w).toBeCloseTo(100, 9);
    expect(out?.h).toBeCloseTo(40, 9);
    expect((out?.x ?? 0) + (out?.w ?? 0) / 2).toBeCloseTo(100 + (175 - 100) * 2, 9);
    expect((out?.y ?? 0) + (out?.h ?? 0) / 2).toBeCloseTo(100 + (130 - 100) * 2, 9);
  });

  it("stretches a quarter-turned item along the axes it appears on", () => {
    // Stretching x by 2 and y by 3: a box turned 90 degrees has its width running down the slide.
    const [out] = scaleWithin([{ ...item, rotation: 90 }], { x: 100, y: 100, w: 200, h: 100 }, { x: 100, y: 100, w: 400, h: 300 });
    expect(out?.w).toBeCloseTo(50 * 3, 9);
    expect(out?.h).toBeCloseTo(20 * 2, 9);
    // Centre at (100 + 75 * 2, 100 + 30 * 3).
    expect((out?.x ?? 0) + (out?.w ?? 0) / 2).toBeCloseTo(250, 9);
    expect((out?.y ?? 0) + (out?.h ?? 0) / 2).toBeCloseTo(190, 9);
    expect(out?.rotation).toBe(90);
  });

  it("only moves a group with no width, as it has none to stretch", () => {
    const line: Item = { id: "l", x: 10, y: 20, w: 0, h: 50 };
    const [out] = scaleWithin([line], { x: 10, y: 0, w: 0, h: 100 }, { x: 30, y: 0, w: 0, h: 200 });
    expect(out).toEqual({ id: "l", x: 30, y: 40, w: 0, h: 100 });
  });

  it("only moves a group with no height, as it has none to stretch", () => {
    const rule: Item = { id: "r", x: 20, y: 10, w: 50, h: 0 };
    const [out] = scaleWithin([rule], { x: 0, y: 10, w: 100, h: 0 }, { x: 0, y: 30, w: 200, h: 0 });
    expect(out).toEqual({ id: "r", x: 40, y: 30, w: 100, h: 0 });
  });

  it("returns nothing for nothing", () => {
    expect(scaleWithin([], from, from)).toEqual([]);
  });
});

describe("mirrorWithin", () => {
  const box = { x: 0, y: 0, w: 100, h: 50 };
  const item: Item = { id: "a", x: 10, y: 5, w: 20, h: 10 };

  it.each<[string, { h?: boolean; v?: boolean }, { x: number; y: number }]>([
    ["left to right", { h: true }, { x: 70, y: 5 }],
    ["top to bottom", { v: true }, { x: 10, y: 35 }],
    ["both ways", { h: true, v: true }, { x: 70, y: 35 }],
    ["neither way", {}, { x: 10, y: 5 }],
  ])("reflects %s across the middle of the box", (_name, flip, expected) => {
    expect(mirrorWithin([item], box, flip)).toEqual([{ id: "a", w: 20, h: 10, ...expected }]);
  });

  it("turns rotation the other way for one reflection and back for two", () => {
    const leaning = { ...item, rotation: 30 };
    expect(mirrorWithin([leaning], box, { h: true })[0]?.rotation).toBe(330);
    expect(mirrorWithin([leaning], box, { v: true })[0]?.rotation).toBe(330);
    expect(mirrorWithin([leaning], box, { h: true, v: true })[0]?.rotation).toBe(30);
  });

  it("gives no rotation to an item that had none", () => {
    expect("rotation" in (mirrorWithin([item], box, { h: true })[0] ?? {})).toBe(false);
  });

  it("puts a reflected group back into the box it was in", () => {
    const out = mirrorWithin([item, { id: "b", x: 60, y: 30, w: 40, h: 20 }], box, { h: true });
    expect(out[1]).toEqual({ id: "b", x: 0, y: 30, w: 40, h: 20 });
  });
});

describe("nudge", () => {
  const items: Item[] = [
    { id: "a", x: 10, y: 20, w: 30, h: 40 },
    { id: "b", x: 0, y: 0, w: 5, h: 5, rotation: 45, locked: true },
  ];

  it.each([
    [1, 0],
    [-10, 0],
    [0, 10],
    [5, -3],
    [0, 0],
  ])("moves everything by (%d, %d)", (dx, dy) => {
    const out = nudge(items, dx, dy);
    expect(out.map((o) => [o.x, o.y])).toEqual(items.map((i) => [i.x + dx, i.y + dy]));
    expect(out.map((o) => [o.w, o.h, o.rotation, o.locked, o.id])).toEqual(items.map((i) => [i.w, i.h, i.rotation, i.locked, i.id]));
  });

  it("returns new objects and leaves the originals", () => {
    const out = nudge(items, 4, 4);
    expect(out[0]).not.toBe(items[0]);
    expect(items[0]).toEqual({ id: "a", x: 10, y: 20, w: 30, h: 40 });
  });

  it("keeps whatever else an item carries", () => {
    const out = nudge([{ id: "z", x: 0, y: 0, w: 1, h: 1, fill: "red" }], 1, 1);
    expect(out[0]?.fill).toBe("red");
  });

  it("returns nothing for nothing", () => {
    expect(nudge([], 1, 1)).toEqual([]);
  });
});
