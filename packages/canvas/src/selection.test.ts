import { describe, expect, it } from "vitest";

import type { Item } from "./items.ts";
import { applySelection, cycle, marqueeHits } from "./selection.ts";
import type { MarqueeMode } from "./selection.ts";

const a: Item = { id: "a", x: 0, y: 0, w: 100, h: 50 };
const b: Item = { id: "b", x: 200, y: 0, w: 100, h: 50 };
const c: Item = { id: "c", x: 400, y: 0, w: 100, h: 50 };
// Turned a quarter, this fills x 150..250, y 50..250.
const tall: Item = { id: "tall", x: 100, y: 100, w: 200, h: 100, rotation: 90 };
const items = [a, b, c, tall];

describe("marqueeHits", () => {
  // -10..320 across, -10..70 down: a and b lie inside, tall reaches down to 250, c is out of reach.
  const rect = { x: -10, y: -10, w: 330, h: 80 };

  it.each<[MarqueeMode, string[]]>([
    ["contain", ["a", "b"]],
    ["touch", ["a", "b", "tall"]],
  ])("in %s mode picks %j", (mode, expected) => {
    expect(marqueeHits(items, rect, mode)).toEqual(expected);
  });

  it("contains by default", () => {
    expect(marqueeHits(items, rect)).toEqual(["a", "b"]);
  });

  it("picks everything when it is all inside", () => {
    expect(marqueeHits(items, { x: -10, y: -10, w: 600, h: 300 })).toEqual(["a", "b", "c", "tall"]);
  });

  it("picks nothing from empty canvas", () => {
    expect(marqueeHits(items, { x: 600, y: 600, w: 50, h: 50 }, "touch")).toEqual([]);
    expect(marqueeHits([], rect)).toEqual([]);
  });

  it("returns ids back to front, in array order", () => {
    expect(marqueeHits([c, a, b], { x: -10, y: -10, w: 600, h: 100 })).toEqual(["c", "a", "b"]);
  });

  it("weighs a turned item by its turned box, not its upright one", () => {
    const diamond: Item = { id: "d", x: 0, y: 0, w: 100, h: 100, rotation: 45 };
    // The square fits inside this rectangle, but the diamond's corners reach 20.7 past the square.
    const snug = { x: -5, y: -5, w: 110, h: 110 };
    expect(marqueeHits([diamond], snug, "contain")).toEqual([]);
    expect(marqueeHits([diamond], snug, "touch")).toEqual(["d"]);
    expect(marqueeHits([diamond], { x: -25, y: -25, w: 150, h: 150 }, "contain")).toEqual(["d"]);
  });

  it("does not count boxes that only share an edge as touching", () => {
    // The rectangle ends at x = 200, where b begins.
    expect(marqueeHits([b], { x: 100, y: 0, w: 100, h: 50 }, "touch")).toEqual([]);
    expect(marqueeHits([b], { x: 100, y: 0, w: 101, h: 50 }, "touch")).toEqual(["b"]);
  });

  it("takes an item whose edge lies exactly on the rectangle's when containing", () => {
    expect(marqueeHits([a], { x: 0, y: 0, w: 100, h: 50 }, "contain")).toEqual(["a"]);
  });

  it("handles thin lines in both modes", () => {
    const line: Item = { id: "line", x: 20, y: 25, w: 60, h: 0 };
    expect(marqueeHits([line], { x: 0, y: 0, w: 100, h: 50 }, "contain")).toEqual(["line"]);
    expect(marqueeHits([line], { x: 40, y: 0, w: 100, h: 50 }, "touch")).toEqual(["line"]);
    expect(marqueeHits([line], { x: 40, y: 0, w: 100, h: 50 }, "contain")).toEqual([]);
    expect(marqueeHits([line], { x: 0, y: 30, w: 100, h: 50 }, "touch")).toEqual([]);
  });

  it("leaves locked items out, unless asked", () => {
    const locked: Item = { ...a, id: "locked", locked: true };
    expect(marqueeHits([locked, b], rect)).toEqual(["b"]);
    expect(marqueeHits([locked, b], rect, "contain", { includeLocked: true })).toEqual(["locked", "b"]);
    expect(marqueeHits([locked, b], rect, "touch")).toEqual(["b"]);
  });
});

describe("applySelection", () => {
  it.each<[string, string[], string[], "replace" | "add" | "toggle", string[]]>([
    ["replace swaps the selection", ["a", "b"], ["c"], "replace", ["c"]],
    ["replace with nothing clears it", ["a", "b"], [], "replace", []],
    ["replace drops repeats", [], ["x", "x", "y"], "replace", ["x", "y"]],
    ["add appends", ["a", "b"], ["c", "d"], "add", ["a", "b", "c", "d"]],
    ["add keeps ones already there once", ["a", "b"], ["b", "c"], "add", ["a", "b", "c"]],
    ["add nothing changes nothing", ["a"], [], "add", ["a"]],
    ["toggle removes what is selected", ["a", "b"], ["b"], "toggle", ["a"]],
    ["toggle adds what is not", ["a", "b"], ["c"], "toggle", ["a", "b", "c"]],
    ["toggle mixes both", ["a", "b", "c"], ["b", "d"], "toggle", ["a", "c", "d"]],
    ["toggle all of them empties it", ["a", "b"], ["b", "a"], "toggle", []],
    ["toggle nothing changes nothing", ["a", "b"], [], "toggle", ["a", "b"]],
    ["toggle counts a repeated pick once", ["a"], ["b", "b"], "toggle", ["a", "b"]],
    ["toggle also tidies a repeat in the selection", ["a", "a", "b"], ["c"], "toggle", ["a", "b", "c"]],
    ["add also tidies a repeat in the selection", ["a", "a"], ["b"], "add", ["a", "b"]],
  ])("%s", (_name, current, picked, how, expected) => {
    expect(applySelection(current, picked, how)).toEqual(expected);
  });

  it("leaves both inputs alone", () => {
    const current = ["a", "b"];
    const picked = ["b", "c"];
    applySelection(current, picked, "toggle");
    applySelection(current, picked, "add");
    expect(current).toEqual(["a", "b"]);
    expect(picked).toEqual(["b", "c"]);
  });

  it("returns a new list even when nothing changes", () => {
    const current = ["a"];
    expect(applySelection(current, [], "add")).not.toBe(current);
  });
});

describe("cycle", () => {
  const order = ["a", "b", "c"];

  it.each<[string | null, boolean, string | null]>([
    ["a", false, "b"],
    ["b", false, "c"],
    ["c", false, "a"],
    ["a", true, "c"],
    ["b", true, "a"],
    ["c", true, "b"],
    [null, false, "a"],
    [null, true, "c"],
    ["gone", false, "a"],
    ["gone", true, "c"],
  ])("from %s (backwards: %s) goes to %s", (current, backwards, expected) => {
    expect(cycle(order, current, backwards)).toBe(expected);
  });

  it("goes nowhere when there is nothing to visit", () => {
    expect(cycle([], null)).toBeNull();
    expect(cycle([], "a", true)).toBeNull();
  });

  it("stays on the only item", () => {
    expect(cycle(["a"], "a")).toBe("a");
    expect(cycle(["a"], "a", true)).toBe("a");
  });
});
