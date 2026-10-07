import { describe, expect, it } from "vitest";

import { GAP_X, GAP_Y, OUTER_W, PAD, PITCH_X, columnsFor, geometryOf, lineAt, spotAt, tileAt } from "./layout.ts";

const size = { w: 960, h: 540 };
const four = geometryOf(size, 1400);

describe("columnsFor", () => {
  it("fits as many tiles across as there is room for, and at least one", () => {
    const need = (columns: number) => columns * PITCH_X - GAP_X + 2 * PAD;
    expect(need(4)).toBe(1176);
    expect(columnsFor(1176)).toBe(4);
    expect(columnsFor(1175)).toBe(3);
    expect(columnsFor(need(2))).toBe(2);
    expect(columnsFor(1440)).toBe(4);
    expect(columnsFor(320)).toBe(1);
    expect(columnsFor(0)).toBe(1);
  });
});

describe("geometryOf", () => {
  it("sizes a tile from the shape of the slides", () => {
    expect(four.columns).toBe(4);
    expect(four.frameHeight).toBe(148);
    expect(four.tileHeight).toBe(178);
    expect(four.pitchY).toBe(178 + GAP_Y);
    expect(four.width).toBe(4 * PITCH_X - GAP_X);
    expect(geometryOf({ w: 720, h: 540 }, 1400).frameHeight).toBe(197);
  });
});

describe("tileAt", () => {
  it("counts along the rows", () => {
    expect(tileAt(0, four)).toEqual({ left: 0, top: 0, row: 0, column: 0 });
    expect(tileAt(3, four)).toEqual({ left: 3 * PITCH_X, top: 0, row: 0, column: 3 });
    expect(tileAt(4, four)).toEqual({ left: 0, top: four.pitchY, row: 1, column: 0 });
    expect(tileAt(9, four)).toEqual({ left: PITCH_X, top: 2 * four.pitchY, row: 2, column: 1 });
  });
});

describe("spotAt", () => {
  const at = (x: number, y: number, count = 10) => spotAt(x, y, count, four);

  it("is the gap before a tile over its left half and after it over its right half", () => {
    expect(at(10, 10)).toEqual({ gap: 0, side: "start" });
    expect(at(OUTER_W / 2 - 1, 10)).toEqual({ gap: 0, side: "start" });
    expect(at(OUTER_W / 2 + 1, 10)).toEqual({ gap: 1, side: "end" });
    expect(at(PITCH_X + 10, 10)).toEqual({ gap: 1, side: "start" });
    expect(at(PITCH_X + 200, four.pitchY + 10)).toEqual({ gap: 6, side: "end" });
  });

  it("takes the nearer tile for a point between two", () => {
    // In the gap between the first tile and the second: the same gap from either side.
    expect(at(OUTER_W + 4, 10)).toEqual({ gap: 1, side: "end" });
    expect(at(OUTER_W + GAP_X - 4, 10)).toEqual({ gap: 1, side: "start" });
    // In the gap between two rows.
    expect(at(10, four.tileHeight + 4)).toEqual({ gap: 0, side: "start" });
    expect(at(10, four.tileHeight + GAP_Y - 2)).toEqual({ gap: 4, side: "start" });
  });

  it("is the end for a point past the last tile, and clamps a point outside the grid", () => {
    // The last row holds tiles 8 and 9; the third column of it is empty.
    expect(at(2 * PITCH_X + 10, 2 * four.pitchY + 10)).toEqual({ gap: 10, side: "end" });
    expect(at(9999, 9999)).toEqual({ gap: 10, side: "end" });
    expect(at(-50, -50)).toEqual({ gap: 0, side: "start" });
    expect(at(9999, 10)).toEqual({ gap: 4, side: "end" });
    expect(spotAt(10, 10, 1, four)).toEqual({ gap: 0, side: "start" });
  });
});

describe("lineAt", () => {
  it("draws the line in the gap before a tile, or after the one before it", () => {
    expect(lineAt({ gap: 1, side: "start" }, 10, four)).toEqual({ left: PITCH_X - GAP_X / 2 - 1.5, top: 0 });
    expect(lineAt({ gap: 1, side: "end" }, 10, four)).toEqual({ left: OUTER_W + GAP_X / 2 - 1.5, top: 0 });
    expect(lineAt({ gap: 0, side: "start" }, 10, four)).toEqual({ left: -GAP_X / 2 - 1.5, top: 0 });
  });

  it("puts the end of a row at the end of that row, and the end of the grid after the last tile", () => {
    // After tile 3, at the right of the first row, and not at the start of the second.
    expect(lineAt({ gap: 4, side: "end" }, 10, four)).toEqual({ left: 3 * PITCH_X + OUTER_W + GAP_X / 2 - 1.5, top: 0 });
    expect(lineAt({ gap: 4, side: "start" }, 10, four)).toEqual({ left: -GAP_X / 2 - 1.5, top: four.pitchY });
    expect(lineAt({ gap: 10, side: "end" }, 10, four)).toEqual({ left: PITCH_X + OUTER_W + GAP_X / 2 - 1.5, top: 2 * four.pitchY });
  });
});
