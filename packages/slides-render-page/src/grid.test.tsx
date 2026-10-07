import { describe, expect, it } from "vitest";

import { GRID_WIDTH, autoColumns, gridLayout } from "./grid.tsx";

describe("the grid of slides", () => {
  it("chooses columns from how many slides there are", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 12, 13, 40].map(autoColumns)).toEqual([1, 2, 3, 2, 3, 3, 4, 4, 5, 5]);
  });

  it("fits the thumbnails into the width asked for", () => {
    const layout = gridLayout(12, { w: 960, h: 540 }, null, null);
    expect(layout.columns).toBe(4);
    expect(layout.width).toBe(GRID_WIDTH);
    expect(layout.thumb.w * 4 + 3 * 18 + 2 * 20).toBeLessThanOrEqual(GRID_WIDTH);
    expect(layout.thumb.h).toBe(Math.round((layout.thumb.w * 540) / 960));
    expect(layout.scale).toBeCloseTo(layout.thumb.w / 960, 5);
    // Three rows of a thumbnail and its caption.
    expect(layout.height).toBeGreaterThan(3 * layout.thumb.h);
  });

  it("keeps to what can be shown", () => {
    expect(gridLayout(3, { w: 960, h: 540 }, 10, null).columns).toBe(3);
    expect(gridLayout(3, { w: 960, h: 540 }, 0, null).columns).toBe(1);
    expect(gridLayout(3, { w: 960, h: 540 }, 2.7, 800).width).toBe(800);
    expect(gridLayout(1000, { w: 960, h: 540 }, 1, null).height).toBeLessThanOrEqual(12_000);
    // A four by three deck has taller thumbnails.
    expect(gridLayout(4, { w: 720, h: 540 }, 2, null).thumb.h / gridLayout(4, { w: 960, h: 540 }, 2, null).thumb.w).toBeGreaterThan(0.6);
  });
});
