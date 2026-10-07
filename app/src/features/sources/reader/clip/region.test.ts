import { describe, expect, it } from "vitest";

import { dragBox, HANDLES, type Handle, MIN_SIDE, moveBox, resizeBox } from "./region";

const PAGE = { width: 600, height: 800 };
const BOX = { left: 100, top: 200, width: 200, height: 100 };

describe("drawing a box", () => {
  it("runs from the press to the pointer, whichever way it is dragged", () => {
    expect(dragBox({ x: 100, y: 200 }, { x: 300, y: 260 }, PAGE)).toEqual({ left: 100, top: 200, width: 200, height: 60 });
    expect(dragBox({ x: 300, y: 260 }, { x: 100, y: 200 }, PAGE)).toEqual({ left: 100, top: 200, width: 200, height: 60 });
    expect(dragBox({ x: 300, y: 200 }, { x: 100, y: 260 }, PAGE)).toEqual({ left: 100, top: 200, width: 200, height: 60 });
  });

  it("stays on the page when the pointer leaves it", () => {
    expect(dragBox({ x: 500, y: 700 }, { x: 900, y: 1200 }, PAGE)).toEqual({ left: 500, top: 700, width: 100, height: 100 });
    expect(dragBox({ x: 50, y: 50 }, { x: -40, y: -10 }, PAGE)).toEqual({ left: 0, top: 0, width: 50, height: 50 });
  });
});

describe("moving a box", () => {
  it("keeps its size and follows the pointer", () => {
    expect(moveBox(BOX, 30, -20, PAGE)).toEqual({ left: 130, top: 180, width: 200, height: 100 });
  });

  it("stops at the edges of the page", () => {
    expect(moveBox(BOX, 900, 900, PAGE)).toEqual({ left: 400, top: 700, width: 200, height: 100 });
    expect(moveBox(BOX, -900, -900, PAGE)).toEqual({ left: 0, top: 0, width: 200, height: 100 });
  });
});

describe("resizing a box by a handle", () => {
  const sides: Record<Handle, [number, number, number, number]> = {
    // left, top, width, height after dragging the handle 20 right and 10 down
    nw: [120, 210, 180, 90],
    n: [100, 210, 200, 90],
    ne: [100, 210, 220, 90],
    e: [100, 200, 220, 100],
    se: [100, 200, 220, 110],
    s: [100, 200, 200, 110],
    sw: [120, 200, 180, 110],
    w: [120, 200, 180, 100],
  };

  it.each(HANDLES)("moves only the sides the %s handle sits on", (handle) => {
    const [left, top, width, height] = sides[handle];
    expect(resizeBox(BOX, handle, 20, 10, PAGE)).toEqual({ left, top, width, height });
  });

  it("names the eight handles", () => {
    expect([...HANDLES].sort()).toEqual(Object.keys(sides).sort());
  });

  it("does not turn inside out: a side stops short of the one across", () => {
    expect(resizeBox(BOX, "e", -900, 0, PAGE)).toEqual({ left: 100, top: 200, width: MIN_SIDE, height: 100 });
    expect(resizeBox(BOX, "w", 900, 0, PAGE)).toEqual({ left: 290, top: 200, width: MIN_SIDE, height: 100 });
    expect(resizeBox(BOX, "s", 0, -900, PAGE)).toEqual({ left: 100, top: 200, width: 200, height: MIN_SIDE });
    expect(resizeBox(BOX, "n", 0, 900, PAGE)).toEqual({ left: 100, top: 290, width: 200, height: MIN_SIDE });
  });

  it("stays on the page", () => {
    expect(resizeBox(BOX, "se", 900, 900, PAGE)).toEqual({ left: 100, top: 200, width: 500, height: 600 });
    expect(resizeBox(BOX, "nw", -900, -900, PAGE)).toEqual({ left: 0, top: 0, width: 300, height: 300 });
  });
});
