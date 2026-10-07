import { describe, expect, it } from "vitest";

import { boundsOf } from "./items.ts";
import type { Box } from "./items.ts";
import { HANDLES, handlePoints, mirrorHandle, resizeBox } from "./transform.ts";
import type { Handle, ResizeOptions } from "./transform.ts";

// 200 x 100 with its centre at (200, 150).
const start: Box = { x: 100, y: 100, w: 200, h: 100 };

type Case = [name: string, handle: Handle, pointer: { dx: number; dy: number }, opts: ResizeOptions, expected: Box, flips?: [boolean, boolean]];

function check([, handle, pointer, opts, expected, flips]: Case, from: Box = start) {
  const out = resizeBox(from, handle, pointer, opts);
  expect(out.box.x).toBeCloseTo(expected.x, 9);
  expect(out.box.y).toBeCloseTo(expected.y, 9);
  expect(out.box.w).toBeCloseTo(expected.w, 9);
  expect(out.box.h).toBeCloseTo(expected.h, 9);
  expect([out.flipH, out.flipV]).toEqual(flips ?? [false, false]);
}

describe("resizeBox on an upright box", () => {
  it.each<Case>([
    ["east grows to the right", "e", { dx: 50, dy: 0 }, {}, { x: 100, y: 100, w: 250, h: 100 }],
    ["east shrinks", "e", { dx: -50, dy: 0 }, {}, { x: 100, y: 100, w: 150, h: 100 }],
    ["west grows to the left", "w", { dx: -50, dy: 0 }, {}, { x: 50, y: 100, w: 250, h: 100 }],
    ["west shrinks", "w", { dx: 50, dy: 0 }, {}, { x: 150, y: 100, w: 150, h: 100 }],
    ["south grows down", "s", { dx: 0, dy: 30 }, {}, { x: 100, y: 100, w: 200, h: 130 }],
    ["north grows up", "n", { dx: 0, dy: -30 }, {}, { x: 100, y: 70, w: 200, h: 130 }],
    ["north shrinks", "n", { dx: 0, dy: 30 }, {}, { x: 100, y: 130, w: 200, h: 70 }],
    ["south east", "se", { dx: 50, dy: 30 }, {}, { x: 100, y: 100, w: 250, h: 130 }],
    ["north west", "nw", { dx: -20, dy: -10 }, {}, { x: 80, y: 90, w: 220, h: 110 }],
    ["north east", "ne", { dx: 20, dy: -10 }, {}, { x: 100, y: 90, w: 220, h: 110 }],
    ["south west", "sw", { dx: -20, dy: 10 }, {}, { x: 80, y: 100, w: 220, h: 110 }],
    ["an edge handle ignores the other axis (east)", "e", { dx: 50, dy: 999 }, {}, { x: 100, y: 100, w: 250, h: 100 }],
    ["an edge handle ignores the other axis (north)", "n", { dx: 999, dy: -30 }, {}, { x: 100, y: 70, w: 200, h: 130 }],
    ["no movement changes nothing", "se", { dx: 0, dy: 0 }, {}, start],
  ])("%s", (...c) => {
    check(c);
  });

  it("keeps the opposite edge where it was", () => {
    const { box } = resizeBox(start, "w", { dx: -50, dy: 0 });
    expect(box.x + box.w).toBe(300);
    const s = resizeBox(start, "n", { dx: 0, dy: -30 }).box;
    expect(s.y + s.h).toBe(200);
  });

  it("gives no rotation key to a box that had none, and keeps one that had", () => {
    expect("rotation" in resizeBox(start, "e", { dx: 1, dy: 0 }).box).toBe(false);
    expect(resizeBox({ ...start, rotation: 0 }, "e", { dx: 1, dy: 0 }).box.rotation).toBe(0);
    expect(resizeBox({ ...start, rotation: 30 }, "e", { dx: 1, dy: 0 }).box.rotation).toBe(30);
  });

  it("leaves the start box as it was", () => {
    const from = { ...start };
    resizeBox(from, "se", { dx: 10, dy: 10 }, { keepRatio: true });
    expect(from).toEqual(start);
  });
});

describe("resizeBox from the centre", () => {
  it.each<Case>([
    ["east moves both sides", "e", { dx: 50, dy: 0 }, { fromCentre: true }, { x: 50, y: 100, w: 300, h: 100 }],
    ["west moves both sides", "w", { dx: -50, dy: 0 }, { fromCentre: true }, { x: 50, y: 100, w: 300, h: 100 }],
    ["north moves both sides", "n", { dx: 0, dy: -20 }, { fromCentre: true }, { x: 100, y: 80, w: 200, h: 140 }],
    ["a corner moves all four", "se", { dx: 50, dy: 30 }, { fromCentre: true }, { x: 50, y: 70, w: 300, h: 160 }],
    ["shrinking works the same way", "e", { dx: -40, dy: 0 }, { fromCentre: true }, { x: 140, y: 100, w: 120, h: 100 }],
  ])("%s", (...c) => {
    check(c);
  });
});

describe("resizeBox keeping the ratio", () => {
  // The start box is 2 : 1.
  it.each<Case>([
    ["a corner follows a drag along the width", "se", { dx: 50, dy: 0 }, { keepRatio: true }, { x: 100, y: 100, w: 250, h: 125 }],
    ["a corner follows a drag along the height", "se", { dx: 0, dy: 60 }, { keepRatio: true }, { x: 100, y: 100, w: 320, h: 160 }],
    ["the larger stretch wins on a diagonal drag", "se", { dx: 20, dy: 40 }, { keepRatio: true }, { x: 100, y: 100, w: 280, h: 140 }],
    ["the opposite corner stays put from the north west", "nw", { dx: -40, dy: 0 }, { keepRatio: true }, { x: 60, y: 80, w: 240, h: 120 }],
    ["and from the north east", "ne", { dx: 0, dy: -50 }, { keepRatio: true }, { x: 100, y: 50, w: 300, h: 150 }],
    ["and from the south west", "sw", { dx: -60, dy: 0 }, { keepRatio: true }, { x: 40, y: 100, w: 260, h: 130 }],
    ["shrinking along both", "se", { dx: -100, dy: -50 }, { keepRatio: true }, { x: 100, y: 100, w: 100, h: 50 }],
    ["an east edge scales the height about the middle line", "e", { dx: 50, dy: 0 }, { keepRatio: true }, { x: 100, y: 87.5, w: 250, h: 125 }],
    ["a north edge scales the width about the middle line", "n", { dx: 0, dy: -40 }, { keepRatio: true }, { x: 60, y: 60, w: 280, h: 140 }],
    ["a north edge shrinks with the ratio kept", "n", { dx: 0, dy: 30 }, { keepRatio: true }, { x: 130, y: 130, w: 140, h: 70 }],
    ["an east edge shrinks with the ratio kept", "e", { dx: -50, dy: 0 }, { keepRatio: true }, { x: 100, y: 112.5, w: 150, h: 75 }],
    ["an edge without the flag leaves the other side alone", "e", { dx: 50, dy: 0 }, {}, { x: 100, y: 100, w: 250, h: 100 }],
    ["from the centre too", "se", { dx: 50, dy: 30 }, { keepRatio: true, fromCentre: true }, { x: 40, y: 70, w: 320, h: 160 }],
  ])("%s", (...c) => {
    check(c);
  });

  it.each<[Handle, { dx: number; dy: number }]>([
    ["se", { dx: 37, dy: 11 }],
    ["nw", { dx: -13, dy: -80 }],
    ["ne", { dx: 5, dy: -33 }],
    ["sw", { dx: -71, dy: 2 }],
    ["e", { dx: 41, dy: 0 }],
    ["s", { dx: 0, dy: -17 }],
  ])("holds the 2 : 1 ratio dragging %s by %o", (handle, pointer) => {
    const { box } = resizeBox(start, handle, pointer, { keepRatio: true });
    expect(box.w / box.h).toBeCloseTo(2, 9);
  });

  it("ignores the flag when the box has no width or height to keep", () => {
    const line: Box = { x: 0, y: 0, w: 100, h: 0 };
    const { box } = resizeBox(line, "se", { dx: 10, dy: 20 }, { keepRatio: true });
    expect(box).toEqual({ x: 0, y: 0, w: 110, h: 20 });
  });
});

describe("resizeBox past the opposite edge", () => {
  it.each<Case>([
    ["east dragged left past the west edge", "e", { dx: -250, dy: 0 }, {}, { x: 50, y: 100, w: 50, h: 100 }, [true, false]],
    ["west dragged right past the east edge", "w", { dx: 250, dy: 0 }, {}, { x: 300, y: 100, w: 50, h: 100 }, [true, false]],
    ["south dragged up past the north edge", "s", { dx: 0, dy: -160 }, {}, { x: 100, y: 40, w: 200, h: 60 }, [false, true]],
    ["north dragged down past the south edge", "n", { dx: 0, dy: 160 }, {}, { x: 100, y: 200, w: 200, h: 60 }, [false, true]],
    ["a corner past both", "se", { dx: -250, dy: -160 }, {}, { x: 50, y: 40, w: 50, h: 60 }, [true, true]],
    ["a corner past one edge", "se", { dx: -250, dy: 20 }, {}, { x: 50, y: 100, w: 50, h: 120 }, [true, false]],
    ["the north west corner past the south east one", "nw", { dx: 250, dy: 160 }, {}, { x: 300, y: 200, w: 50, h: 60 }, [true, true]],
    ["exactly on the opposite edge is not a flip", "e", { dx: -200, dy: 0 }, {}, { x: 100, y: 100, w: 1, h: 100 }],
    ["from the centre, past the middle", "e", { dx: -120, dy: 0 }, { fromCentre: true }, { x: 180, y: 100, w: 40, h: 100 }, [true, false]],
    ["with the ratio kept, past both", "se", { dx: -250, dy: -150 }, { keepRatio: true }, { x: 0, y: 50, w: 100, h: 50 }, [true, true]],
    ["with the ratio kept, past one edge only", "se", { dx: -250, dy: 20 }, { keepRatio: true }, { x: -140, y: 100, w: 240, h: 120 }, [true, false]],
    ["an edge with the ratio kept flips one way only", "e", { dx: -250, dy: 0 }, { keepRatio: true }, { x: 50, y: 137.5, w: 50, h: 25 }, [true, false]],
  ])("%s", (...c) => {
    check(c);
  });

  it("has the flipped box straddle the fixed edge, not the start box", () => {
    const { box, flipH } = resizeBox(start, "e", { dx: -230, dy: 0 });
    // The west edge is at x = 100 and stays the anchor: the box now lies to its left.
    expect(flipH).toBe(true);
    expect(box.x + box.w).toBe(100);
    expect(box.w).toBe(30);
  });

  it("never returns a negative size", () => {
    for (const handle of HANDLES) {
      for (const dx of [-500, -1, 0, 1, 500]) {
        for (const dy of [-500, -1, 0, 1, 500]) {
          for (const opts of [{}, { keepRatio: true }, { fromCentre: true }, { keepRatio: true, fromCentre: true }]) {
            const { box } = resizeBox(start, handle, { dx, dy }, opts);
            expect(box.w).toBeGreaterThan(0);
            expect(box.h).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe("resizeBox minimum size", () => {
  it.each<Case>([
    ["is 1 by default", "e", { dx: -199.5, dy: 0 }, {}, { x: 100, y: 100, w: 1, h: 100 }],
    ["can be set", "e", { dx: -195, dy: 0 }, { minSize: 10 }, { x: 100, y: 100, w: 10, h: 100 }],
    ["applies to a flipped side too", "e", { dx: -205, dy: 0 }, { minSize: 10 }, { x: 90, y: 100, w: 10, h: 100 }, [true, false]],
    ["reaches both sides with the ratio kept", "se", { dx: -199, dy: -99 }, { keepRatio: true }, { x: 100, y: 100, w: 2, h: 1 }],
    ["keeps the shorter side at the minimum", "se", { dx: -199, dy: -99 }, { keepRatio: true, minSize: 5 }, { x: 100, y: 100, w: 10, h: 5 }],
  ])("%s", (...c) => {
    check(c);
  });

  it("does not stretch a side the handle leaves alone, so a line stays a line", () => {
    const line: Box = { x: 0, y: 50, w: 100, h: 0 };
    expect(resizeBox(line, "e", { dx: 10, dy: 0 }).box).toEqual({ x: 0, y: 50, w: 110, h: 0 });
    expect(resizeBox(line, "w", { dx: -10, dy: 0 }).box).toEqual({ x: -10, y: 50, w: 110, h: 0 });
  });
});

describe("resizeBox on a box turned 30 degrees", () => {
  const turned: Box = { ...start, rotation: 30 };
  const cos = Math.sqrt(3) / 2;
  const own = (along: number, across = 0) => ({
    // The pointer's move in slide space that is `along` the box's width and `across` its height.
    dx: along * cos - across * 0.5,
    dy: along * 0.5 + across * cos,
  });

  it("resizes along its own width when the east handle is dragged along it", () => {
    const { box } = resizeBox(turned, "e", own(40));
    expect(box.w).toBeCloseTo(240, 9);
    expect(box.h).toBeCloseTo(100, 9);
    expect(box.x).toBeCloseTo(200 + 20 * cos - 120, 9);
    expect(box.y).toBeCloseTo(150 + 10 - 50, 9);
    expect(box.rotation).toBe(30);
  });

  it("ignores movement across the width when it drags the east handle", () => {
    const { box } = resizeBox(turned, "e", own(0, 40));
    expect(box.w).toBeCloseTo(200, 9);
    expect(box.h).toBeCloseTo(100, 9);
    expect(box.x).toBeCloseTo(100, 9);
    expect(box.y).toBeCloseTo(100, 9);
  });

  it("takes only the part of a slide-space drag that lies along the width", () => {
    const { box } = resizeBox(turned, "e", { dx: 40, dy: 0 });
    // 40 across the slide is 40 cos(30) along the width.
    expect(box.w).toBeCloseTo(200 + 40 * cos, 9);
  });

  it("resizes along its own height from the south handle", () => {
    const { box } = resizeBox(turned, "s", own(0, 20));
    expect(box.w).toBeCloseTo(200, 9);
    expect(box.h).toBeCloseTo(120, 9);
    expect(box.x).toBeCloseTo(200 - 0.5 * 10 - 100, 9);
    expect(box.y).toBeCloseTo(150 + cos * 10 - 60, 9);
  });

  it("resizes from the centre without moving it", () => {
    const { box } = resizeBox(turned, "e", own(40), { fromCentre: true });
    expect(box.w).toBeCloseTo(280, 9);
    expect(box.x + box.w / 2).toBeCloseTo(200, 9);
    expect(box.y + box.h / 2).toBeCloseTo(150, 9);
  });

  it("flips past the opposite edge along its own axis", () => {
    const out = resizeBox(turned, "e", own(-230));
    expect(out.flipH).toBe(true);
    expect(out.flipV).toBe(false);
    expect(out.box.w).toBeCloseTo(30, 9);
  });

  // The edge or corner opposite the dragged handle must stay put in slide space, whatever the turn.
  describe.each([0, 30, 90, 137, 180, 250, 270, 359])("at %d degrees", (rotation) => {
    const box: Box = { x: 100, y: 100, w: 200, h: 100, rotation };
    const pointer = { dx: 13.7, dy: -9.3 };
    const opposite: Record<Handle, Handle> = { nw: "se", n: "s", ne: "sw", e: "w", se: "nw", s: "n", sw: "ne", w: "e" };

    it.each(HANDLES)("keeps the point opposite %s fixed", (handle) => {
      const out = resizeBox(box, handle, pointer);
      expect(out.flipH || out.flipV).toBe(false);
      const before = handlePoints(box)[opposite[handle]];
      const after = handlePoints(out.box)[opposite[handle]];
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    });

    it.each(HANDLES)("keeps the centre fixed when %s is dragged from the centre", (handle) => {
      const out = resizeBox(box, handle, pointer, { fromCentre: true });
      expect(out.box.x + out.box.w / 2).toBeCloseTo(200, 9);
      expect(out.box.y + out.box.h / 2).toBeCloseTo(150, 9);
    });

    it.each(HANDLES)("keeps the point opposite %s fixed while a flip happens", (handle) => {
      const out = resizeBox(box, handle, { dx: 900, dy: 700 });
      // A far drag flips the sides the handle is on the far side of; the anchor is still the same point.
      const anchor = handlePoints(box)[opposite[handle]];
      const dragged = mirrorHandle(handle, { h: out.flipH, v: out.flipV });
      const after = handlePoints(out.box)[opposite[dragged]];
      expect(after.x).toBeCloseTo(anchor.x, 9);
      expect(after.y).toBeCloseTo(anchor.y, 9);
    });
  });
});

describe("resizeBox on a box turned a quarter", () => {
  const turned: Box = { ...start, rotation: 90 };

  it("has the east handle change the height it appears to have", () => {
    // Turned 90 degrees the east handle points down the slide. Dragging it down 30 makes the box 230 long.
    const out = resizeBox(turned, "e", { dx: 0, dy: 30 });
    expect(out.box).toEqual({ x: 85, y: 115, w: 230, h: 100, rotation: 90 });
    expect(out.flipH).toBe(false);
    // Seen upright: it was 100 wide and 200 tall, and is now 100 wide and 230 tall, its top still at 50.
    expect(boundsOf(turned)).toEqual({ x: 150, y: 50, w: 100, h: 200 });
    expect(boundsOf(out.box)).toEqual({ x: 150, y: 50, w: 100, h: 230 });
  });

  it("does not respond to sideways movement of the east handle", () => {
    expect(resizeBox(turned, "e", { dx: 30, dy: 0 }).box).toEqual({ ...turned });
  });

  it.each<[string, Handle, { dx: number; dy: number }, Box]>([
    ["east dragged up shrinks", "e", { dx: 0, dy: -30 }, { x: 115, y: 85, w: 170, h: 100, rotation: 90 }],
    ["west dragged up grows (it faces up)", "w", { dx: 0, dy: -30 }, { x: 85, y: 85, w: 230, h: 100, rotation: 90 }],
    ["south dragged right shrinks (it faces left)", "s", { dx: 30, dy: 0 }, { x: 115, y: 115, w: 200, h: 70, rotation: 90 }],
    ["north dragged right grows (it faces right)", "n", { dx: 30, dy: 0 }, { x: 115, y: 85, w: 200, h: 130, rotation: 90 }],
  ])("%s", (_name, handle, pointer, expected) => {
    expect(resizeBox(turned, handle, pointer).box).toEqual(expected);
  });

  it("turns the axes the other way at 270 degrees", () => {
    // At 270 the north handle faces left: dragging it left by 30 makes the box 130 tall.
    const out = resizeBox({ ...start, rotation: 270 }, "n", { dx: -30, dy: 0 });
    expect(out.box).toEqual({ x: 85, y: 85, w: 200, h: 130, rotation: 270 });
  });

  it("faces the east handle left at 180 degrees", () => {
    const out = resizeBox({ ...start, rotation: 180 }, "e", { dx: 30, dy: 0 });
    expect(out.box).toEqual({ x: 130, y: 100, w: 170, h: 100, rotation: 180 });
  });
});
