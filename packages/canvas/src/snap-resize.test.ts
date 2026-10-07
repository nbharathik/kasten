import { describe, expect, it } from "vitest";

import type { Rect } from "./geometry.ts";
import type { Guide } from "./guides.ts";
import { snapResize } from "./snap.ts";
import type { Frame } from "./snap.ts";
import type { Handle } from "./transform.ts";

const frame: Frame = { width: 960, height: 540 };
const withMargin: Frame = { width: 960, height: 540, margin: 48 };
// Its edges are at x 300 and 400, its middle at 350; and the same down the slide.
const target: Rect = { x: 300, y: 300, w: 100, h: 100 };
const none = { dx: 0, dy: 0, guides: [] };

describe("snapResize", () => {
  it("snaps the dragged right edge, and the guide runs to the neighbour", () => {
    const r = snapResize({ x: 100, y: 100, w: 197, h: 100 }, "e", [target], frame);
    expect(r).toEqual({ dx: 3, dy: 0, guides: [{ axis: "x", at: 300, from: 100, to: 400, kind: "edge" }] });
  });

  it("snaps the dragged left edge, moving it left", () => {
    const left = { x: 0, y: 300, w: 100, h: 100 };
    const r = snapResize({ x: 103, y: 100, w: 197, h: 100 }, "w", [left], frame);
    expect(r).toEqual({ dx: -3, dy: 0, guides: [{ axis: "x", at: 100, from: 100, to: 400, kind: "edge" }] });
  });

  it("snaps the top and bottom edges", () => {
    const wide = { x: 500, y: 0, w: 50, h: 100 };
    expect(snapResize({ x: 100, y: 103, w: 100, h: 97 }, "n", [wide], frame)).toEqual({
      dx: 0,
      dy: -3,
      guides: [{ axis: "y", at: 100, from: 100, to: 550, kind: "edge" }],
    });
    expect(snapResize({ x: 100, y: 100, w: 100, h: 97 }, "s", [{ x: 500, y: 200, w: 50, h: 50 }], frame).dy).toBe(3);
  });

  it("snaps only the edges being dragged", () => {
    const left = { x: 0, y: 300, w: 100, h: 100 };
    // The left edge (103) is 3 from a line, but the east handle drags the right edge (300).
    expect(snapResize({ x: 103, y: 100, w: 197, h: 100 }, "e", [left], frame)).toEqual(none);
    // The top edge (100) is on a line; the east handle does not drag it.
    expect(snapResize({ x: 100, y: 100, w: 197, h: 100 }, "e", [{ x: 500, y: 100, w: 10, h: 10 }], frame).dy).toBe(0);
  });

  it("snaps both edges a corner drags", () => {
    const beside = { x: 500, y: 200, w: 50, h: 50 };
    const r = snapResize({ x: 100, y: 100, w: 197, h: 98 }, "se", [target, beside], frame);
    expect(r.dx).toBe(3);
    expect(r.dy).toBe(2);
    expect(r.guides).toEqual([
      { axis: "x", at: 300, from: 100, to: 400, kind: "edge" },
      { axis: "y", at: 200, from: 100, to: 550, kind: "edge" },
    ]);
  });

  it("snaps to the slide and its margins", () => {
    expect(snapResize({ x: 800, y: 100, w: 157, h: 100 }, "e", [], frame)).toEqual({
      dx: 3,
      dy: 0,
      guides: [{ axis: "x", at: 960, from: 0, to: 540, kind: "edge" }],
    });
    expect(snapResize({ x: 800, y: 100, w: 109, h: 100 }, "e", [], withMargin).guides[0]?.kind).toBe("margin");
  });

  it("does nothing when switched off", () => {
    expect(snapResize({ x: 100, y: 100, w: 197, h: 100 }, "e", [target], frame, { enabled: false })).toEqual(none);
  });

  it("honours the threshold", () => {
    expect(snapResize({ x: 100, y: 100, w: 197, h: 100 }, "e", [target], frame, { threshold: 2 })).toEqual(none);
  });

  describe("at each corner", () => {
    // Four short neighbours, each with an edge on one of the lines the box ends on: x = 100 and 300, y = 100 and 200.
    const left = { x: 0, y: 120, w: 100, h: 40 };
    const right = { x: 300, y: 120, w: 100, h: 40 };
    const above = { x: 120, y: 0, w: 40, h: 100 };
    const below = { x: 120, y: 200, w: 40, h: 100 };
    const near = [left, right, above, below];

    // Each box is 3 short of its vertical line and 2 short of its horizontal one; landed, all fill (100, 100, 200, 100),
    // so the guides run exactly as far as that box does.
    it.each<[Handle, Rect, number, number, Guide[]]>([
      [
        "se",
        { x: 100, y: 100, w: 197, h: 98 },
        3,
        2,
        [
          { axis: "x", at: 300, from: 100, to: 200, kind: "edge" },
          { axis: "y", at: 200, from: 100, to: 300, kind: "edge" },
        ],
      ],
      [
        "nw",
        { x: 103, y: 102, w: 197, h: 98 },
        -3,
        -2,
        [
          { axis: "x", at: 100, from: 100, to: 200, kind: "edge" },
          { axis: "y", at: 100, from: 100, to: 300, kind: "edge" },
        ],
      ],
      [
        "ne",
        { x: 100, y: 102, w: 197, h: 98 },
        3,
        -2,
        [
          { axis: "x", at: 300, from: 100, to: 200, kind: "edge" },
          { axis: "y", at: 100, from: 100, to: 300, kind: "edge" },
        ],
      ],
      [
        "sw",
        { x: 103, y: 100, w: 197, h: 98 },
        -3,
        2,
        [
          { axis: "x", at: 100, from: 100, to: 200, kind: "edge" },
          { axis: "y", at: 200, from: 100, to: 300, kind: "edge" },
        ],
      ],
    ])("moves the edges the %s handle drags onto the lines", (handle, box, dx, dy, guides) => {
      expect(snapResize(box, handle, near, frame)).toEqual({ dx, dy, guides });
    });
  });

  describe("keeping the ratio", () => {
    const wide = { x: 0, y: 0, w: 196, h: 98 };
    const vertical = { x: 200, y: 400, w: 10, h: 10 };
    const horizontal = { x: 400, y: 101, w: 10, h: 10 };

    it("follows the nearer line with the other edge", () => {
      // Free, the right edge would move 4 and the bottom 3. Kept 2 : 1, the 3 wins and the right edge goes 6.
      expect(snapResize(wide, "se", [vertical, horizontal], frame)).toMatchObject({ dx: 4, dy: 3 });
      const r = snapResize(wide, "se", [vertical, horizontal], frame, { keepRatio: true });
      expect(r.dx).toBe(6);
      expect(r.dy).toBe(3);
      expect(r.guides).toEqual([{ axis: "y", at: 101, from: 0, to: 410, kind: "edge" }]);
    });

    it("works out the other edge from a line on one axis alone", () => {
      const r = snapResize(wide, "se", [vertical], frame, { keepRatio: true });
      expect(r.dx).toBe(4);
      expect(r.dy).toBe(2);
      expect(r.guides).toEqual([{ axis: "x", at: 200, from: 0, to: 410, kind: "edge" }]);
    });

    it("moves the other edge the right way for each corner", () => {
      // Dragging the north east corner up 3 makes the box 3 taller, so 6 wider.
      const r = snapResize({ x: 0, y: 100, w: 196, h: 98 }, "ne", [{ x: 400, y: 97, w: 10, h: 40 }], frame, { keepRatio: true });
      expect(r.dx).toBe(6);
      expect(r.dy).toBe(-3);
      // And the north west corner, both edges moving the same way, out to the slide's corner.
      const nw = snapResize({ x: 4, y: 2, w: 196, h: 98 }, "nw", [], frame, { keepRatio: true });
      expect(nw.dx).toBe(-4);
      expect(nw.dy).toBe(-2);
    });

    it("has no ratio to keep for a box with no width, and does not divide by it", () => {
      const r = snapResize({ x: 100, y: 100, w: 0, h: 50 }, "se", [{ x: 103, y: 300, w: 10, h: 10 }], frame, { keepRatio: true });
      expect(r.dx).toBe(3);
      expect(r.dy).toBe(0);
    });

    it("leaves an edge handle alone, as it has one edge to move", () => {
      expect(snapResize({ x: 100, y: 100, w: 197, h: 100 }, "e", [target], frame, { keepRatio: true })).toMatchObject({ dx: 3, dy: 0 });
    });
  });
});
