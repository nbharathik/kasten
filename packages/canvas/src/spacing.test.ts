import { describe, expect, it } from "vitest";

import type { Rect } from "./geometry.ts";
import { snapMove } from "./snap.ts";
import type { Frame, Guide } from "./snap.ts";

const frame: Frame = { width: 960, height: 540 };
const none = { dx: 0, dy: 0, guides: [] };

const box = (x: number, y: number, w = 100, h = 50): Rect => ({ x, y, w, h });
const gap = (at: number, from: number, to: number, axis: "x" | "y" = "y"): Guide => ({ axis, at, from, to, kind: "spacing" });

// The row this file drops boxes into: two boxes 100 wide with 50 between them.
const a = box(0, 100);
const b = box(150, 100);

describe("equal spacing along a row", () => {
  it("continues the rhythm to the right of two boxes", () => {
    // The gap from a to b is 50, so the moving box wants to start at 250 + 50 = 300; it is at 305.
    const r = snapMove(box(305, 110), [a, b], frame);
    expect(r).toEqual({ dx: -5, dy: 0, guides: [gap(125, 100, 150), gap(130, 250, 300)] });
  });

  it("continues the rhythm to the left of two boxes", () => {
    const c = box(500, 100);
    const d = box(650, 100);
    // Its right edge wants to end at 500 - 50 = 450; it ends at 445.
    const r = snapMove(box(345, 110), [c, d], frame);
    expect(r).toEqual({ dx: 5, dy: 0, guides: [gap(130, 450, 500), gap(125, 600, 650)] });
  });

  it("centres the box between a neighbour on each side", () => {
    const left = box(100, 100);
    const right = box(500, 100);
    // 300 wide of room, 100 of it the box: 100 either side, so it starts at 300; it is at 297.
    const r = snapMove(box(297, 110), [left, right], frame);
    expect(r).toEqual({ dx: 3, dy: 0, guides: [gap(130, 200, 300), gap(130, 400, 500)] });
  });

  it("works down a column too, marking the gaps across it", () => {
    const top = box(100, 0);
    const middle = box(100, 100);
    // Gaps of 50: the box wants to start at 150 + 50 = 200; it is at 205.
    const r = snapMove(box(110, 205), [top, middle], frame);
    expect(r).toEqual({ dx: 0, dy: -5, guides: [gap(150, 50, 100, "x"), gap(155, 150, 200, "x")] });
  });

  it("does not reach further than the threshold", () => {
    expect(snapMove(box(310, 110), [a, b], frame)).toEqual(none);
    expect(snapMove(box(306, 110), [a, b], frame).dx).toBe(-6);
    expect(snapMove(box(307, 110), [a, b], frame)).toEqual(none);
    expect(snapMove(box(307, 110), [a, b], frame, { threshold: 8 }).dx).toBe(-7);
  });

  it("needs the boxes to be level with the moving one", () => {
    // Below the row, sharing no height with it.
    expect(snapMove(box(305, 300), [a, b], frame)).toEqual(none);
    // Just touching the row's height is not level; overlapping it by a unit is. Only x is asked, so
    // the moving box's top edge meeting the row's bottom edge does not also snap.
    expect(snapMove(box(305, 150), [a, b], frame, { axis: "x" })).toEqual(none);
    expect(snapMove(box(305, 149), [a, b], frame, { axis: "x" }).dx).toBe(-5);
  });

  it("needs two boxes to compare, or a box on each side", () => {
    expect(snapMove(box(305, 110), [b], frame)).toEqual(none);
    expect(snapMove(box(305, 110), [], frame)).toEqual(none);
  });

  it("copies the gap of the two boxes nearest to it, whatever else is in the row", () => {
    const z = box(-400, 100);
    expect(snapMove(box(305, 110), [z, a, b], frame).dx).toBe(-5);
    expect(snapMove(box(305, 110), [b, z, a], frame).dx).toBe(-5);
  });

  it("ignores a gap that is not open, as when the boxes touch", () => {
    // a and c touch (a gap of 0), so nothing is to be copied; the box just lines up against c's edge.
    const c = box(100, 100);
    const r = snapMove(box(203, 110, 50), [a, c], frame);
    expect(r.dx).toBe(-3);
    expect(r.guides).toEqual([{ axis: "x", at: 200, from: 100, to: 160, kind: "edge" }]);
  });

  it("gives way to a nearer line-up on the same axis", () => {
    // The spacing move is -5, but a target's left edge at 302 is 3 away.
    const near = box(302, 300, 20);
    const r = snapMove(box(305, 110), [a, b, near], frame);
    expect(r.dx).toBe(-3);
    expect(r.guides.every((g) => g.kind !== "spacing")).toBe(true);
  });

  it("shows both when an edge and an equal gap ask for the same move", () => {
    // A box below the row with its left edge at 300 asks for the same -5 as the spacing does.
    const wall = box(300, 300, 30);
    const r = snapMove(box(305, 110), [a, b, wall], frame);
    expect(r.dx).toBe(-5);
    expect(r.guides.map((g) => g.kind).sort()).toEqual(["edge", "spacing", "spacing"]);
  });

  describe("neighbours close to the moving box", () => {
    it("copies a small gap on the left, from a neighbour only 5 away", () => {
      // l and the box before it have a gap of 4, so the box wants to start at 204; it starts at 205, 5 off l's edge.
      const before = box(-4, 100);
      const l = box(100, 100);
      const r = snapMove(box(205, 110), [before, l], frame, { axis: "x" });
      expect(r).toEqual({ dx: -1, dy: 0, guides: [gap(125, 96, 100), gap(130, 200, 204)] });
    });

    it("copies a small gap on the right, from a neighbour only 5 away", () => {
      const next = box(197, 100);
      const after = box(301, 100);
      const r = snapMove(box(92, 110), [next, after], frame, { axis: "x" });
      expect(r).toEqual({ dx: 1, dy: 0, guides: [gap(130, 193, 197), gap(125, 297, 301)] });
    });

    it("goes by the neighbour it overlaps a little, not by the ones behind it", () => {
      // The box, 248..348, overlaps the 48 wide box at 205..253 by 5. The pair behind (0..50 and 100..200, a gap of 50)
      // would have it start at 250 and lie on top of that box; the gap to the box it overlaps is 5, so it lands at 253.
      const row = [box(0, 100, 50), box(100, 100), box(205, 100, 48)];
      const r = snapMove(box(248, 110), row, frame, { axis: "x" });
      expect(r.dx).toBe(5);
      expect(r.guides.map((g) => g.kind)).toEqual(["edge"]);
    });

    it("counts a thin rule as a neighbour", () => {
      // A rule has no width, so the gap from the box before it is 100 and the box wants to start 100 past the rule.
      const rule = { x: 200, y: 100, w: 0, h: 50 };
      const r = snapMove(box(305, 110), [box(0, 100), rule], frame, { axis: "x" });
      expect(r).toEqual({ dx: -5, dy: 0, guides: [gap(125, 100, 200), gap(130, 200, 300)] });
    });

    it("does not centre a box between neighbours that leave it no room", () => {
      // 50 between them and the box is 56 wide: centring it would overlap both, so only its edge lines up.
      const r = snapMove(box(198, 110, 56), [box(100, 100), box(250, 100)], frame, { axis: "x" });
      expect(r.dx).toBe(2);
      expect(r.guides.map((g) => g.kind)).toEqual(["edge"]);
    });
  });

  it("is switched off with the rest", () => {
    expect(snapMove(box(305, 110), [a, b], frame, { enabled: false })).toEqual(none);
  });

  it("marks a gap between boxes that do not face each other at the mean of their middles", () => {
    // low and high are level with the moving box but one is above the other, sharing no height.
    const low = box(0, 100, 100, 20);
    const high = box(150, 130, 100, 20);
    const r = snapMove(box(305, 115, 100, 20), [low, high], frame, { axis: "x" });
    expect(r).toEqual({ dx: -5, dy: 0, guides: [gap(125, 100, 150), gap(132.5, 250, 300)] });
  });
});
