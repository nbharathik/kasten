import { describe, expect, it } from "vitest";

import { freeSpot, spotAt } from "./spot.ts";

const SLIDE = { w: 960, h: 540 };
const TEXT = { w: 300, h: 56 };
const SHAPE = { w: 160, h: 120 };

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe("a box put at the pointer", () => {
  it("has its top left at the pointer, in whole units", () => {
    expect(spotAt({ x: 200.4, y: 120.6 }, TEXT, SLIDE, [], null)).toEqual({ x: 200, y: 121, ...TEXT });
  });

  it("is held inside the slide, whichever edge the pointer is near", () => {
    expect(spotAt({ x: 900, y: 100 }, TEXT, SLIDE, [], null)).toMatchObject({ x: 960 - 300, y: 100 });
    expect(spotAt({ x: 100, y: 530 }, TEXT, SLIDE, [], null)).toMatchObject({ x: 100, y: 540 - 56 });
    expect(spotAt({ x: 5, y: 3 }, SHAPE, SLIDE, [], null)).toMatchObject({ x: 5, y: 3 });
    // Only just on the slide: the pointer at its very corner.
    expect(spotAt({ x: 960, y: 540 }, SHAPE, SLIDE, [], null)).toMatchObject({ x: 800, y: 420 });
    // A box bigger than the slide starts at the corner rather than at a place that is not there.
    expect(spotAt({ x: 100, y: 100 }, { w: 2000, h: 800 }, SLIDE, [], null)).toMatchObject({ x: 0, y: 0 });
  });

  it("snaps to the edges and middles of the others and of the slide, within the threshold", () => {
    const other = { x: 500, y: 300, w: 120, h: 120 };
    expect(spotAt({ x: 497, y: 100 }, TEXT, SLIDE, [other], 6)).toMatchObject({ x: 500, y: 100 });
    expect(spotAt({ x: 497, y: 100 }, TEXT, SLIDE, [other], null)).toMatchObject({ x: 497, y: 100 });
    // Its top lands on the other's top; its left on the slide's.
    expect(spotAt({ x: 3, y: 296 }, TEXT, SLIDE, [other], 6)).toMatchObject({ x: 0, y: 300 });
    // Beyond the threshold it stays where the pointer is.
    expect(spotAt({ x: 480, y: 100 }, TEXT, SLIDE, [other], 6)).toMatchObject({ x: 480, y: 100 });
  });

  it("does not snap out of the slide", () => {
    const edge = { x: 900, y: 0, w: 60, h: 540 };
    const made = spotAt({ x: 880, y: 100 }, TEXT, SLIDE, [edge], 30);
    expect(made.x + made.w).toBeLessThanOrEqual(960);
    expect(made.x).toBeGreaterThanOrEqual(0);
  });
});

describe("a box put where there is room", () => {
  it("goes near the top left third of an empty slide", () => {
    const made = freeSpot(TEXT, [], SLIDE);
    expect(made).toEqual({ x: 96, y: 90, ...TEXT });
    expect(made.x + made.w).toBeLessThanOrEqual(SLIDE.w / 2);
    expect(made.y).toBeLessThan(SLIDE.h / 3);
  });

  it("keeps clear of what is there, at the nearest place that is free", () => {
    const title = { x: 48, y: 40, w: 864, h: 120 };
    const made = freeSpot(TEXT, [title], SLIDE);
    expect(overlaps(made, title)).toBe(false);
    // Under the title, and not far from where it would have gone.
    expect(made.y).toBeGreaterThanOrEqual(title.y + title.h);
    expect(made.y).toBeLessThan(260);
    expect(made.x).toBeLessThan(200);
  });

  it("finds room for a shape among several things", () => {
    const things = [
      { x: 48, y: 40, w: 864, h: 100 },
      { x: 48, y: 150, w: 400, h: 340 },
    ];
    const made = freeSpot(SHAPE, things, SLIDE);
    for (const thing of things) expect(overlaps(made, thing)).toBe(false);
    expect(made.x + made.w).toBeLessThanOrEqual(SLIDE.w);
    expect(made.y + made.h).toBeLessThanOrEqual(SLIDE.h);
  });

  it("stays inside the slide and is the same every time it is asked", () => {
    const things = [{ x: 0, y: 0, w: 960, h: 200 }];
    const first = freeSpot(TEXT, things, SLIDE);
    expect(freeSpot(TEXT, things, SLIDE)).toEqual(first);
    expect(first.x).toBeGreaterThanOrEqual(0);
    expect(first.y + first.h).toBeLessThanOrEqual(SLIDE.h);
  });

  it("goes over the others a little apart from each other when the slide is full", () => {
    const full = [{ x: 0, y: 0, w: 960, h: 540 }];
    const first = freeSpot(TEXT, full, SLIDE);
    expect(first.x + first.w).toBeLessThanOrEqual(SLIDE.w);
    expect(first.y + first.h).toBeLessThanOrEqual(SLIDE.h);
    // The second lands beside the first, not exactly on it.
    const second = freeSpot(TEXT, [...full, first], SLIDE);
    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeGreaterThanOrEqual(20);
  });
});
