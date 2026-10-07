import { describe, expect, it } from "vitest";

import {
  between,
  centre,
  clamp,
  contains,
  corners,
  directionOf,
  encloses,
  intersects,
  normaliseAngle,
  rotatePoint,
  snapTo,
  turnedBounds,
  union,
} from "./geometry.ts";

const box = { x: 10, y: 20, w: 100, h: 50 };

describe("boxes", () => {
  it("finds the centre", () => {
    expect(centre(box)).toEqual({ x: 60, y: 45 });
  });

  it("tells what a box holds", () => {
    expect(contains(box, { x: 10, y: 20 })).toBe(true);
    expect(contains(box, { x: 110, y: 70 })).toBe(true);
    expect(contains(box, { x: 111, y: 70 })).toBe(false);
    expect(encloses(box, { x: 20, y: 30, w: 10, h: 10 })).toBe(true);
    expect(encloses(box, { x: 5, y: 30, w: 10, h: 10 })).toBe(false);
  });

  it("intersects only when they share area", () => {
    expect(intersects(box, { x: 100, y: 60, w: 50, h: 50 })).toBe(true);
    expect(intersects(box, { x: 110, y: 20, w: 50, h: 50 })).toBe(false);
    expect(intersects(box, { x: 200, y: 200, w: 5, h: 5 })).toBe(false);
  });

  it("joins boxes, and none", () => {
    expect(union([])).toBeNull();
    expect(union([box, { x: 0, y: 100, w: 5, h: 5 }])).toEqual({ x: 0, y: 20, w: 110, h: 85 });
  });

  it("makes the box between two corners either way round", () => {
    expect(between({ x: 30, y: 40 }, { x: 10, y: 90 })).toEqual({ x: 10, y: 40, w: 20, h: 50 });
  });
});

describe("turning", () => {
  it("turns a point clockwise on a y-down canvas", () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
  });

  it("keeps the corners of an unturned box as they are", () => {
    expect(corners(box)).toEqual([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 70 },
      { x: 10, y: 70 },
    ]);
  });

  it("bounds a box turned a quarter as its swapped size around the same centre", () => {
    const b = turnedBounds(box, 90);
    expect(b.w).toBeCloseTo(50);
    expect(b.h).toBeCloseTo(100);
    expect(b.x + b.w / 2).toBeCloseTo(60);
    expect(b.y + b.h / 2).toBeCloseTo(45);
  });
});

describe("snapTo", () => {
  it("rounds to a step, and leaves alone when there is none", () => {
    expect(snapTo(52, 15)).toBe(45);
    expect(snapTo(53, 15)).toBe(60);
    expect(snapTo(52, 0)).toBe(52);
  });
});

describe("angles", () => {
  it.each([
    [0, 0],
    [90, 90],
    [360, 0],
    [370, 10],
    [-10, 350],
    [-370, 350],
    [720.5, 0.5],
    [-0, 0],
  ])("folds %d degrees into %d", (degrees, expected) => {
    expect(normaliseAngle(degrees)).toBe(expected);
  });

  it.each([
    [0, { x: 1, y: 0 }],
    [90, { x: 0, y: 1 }],
    [180, { x: -1, y: 0 }],
    [270, { x: 0, y: -1 }],
    [-90, { x: 0, y: -1 }],
    [450, { x: 0, y: 1 }],
  ])("points %d degrees exactly at a quarter turn", (degrees, expected) => {
    expect(directionOf(degrees)).toEqual(expected);
  });

  it("points 30 degrees clockwise, down and to the right on a y-down canvas", () => {
    const d = directionOf(30);
    expect(d.x).toBeCloseTo(Math.sqrt(3) / 2, 12);
    expect(d.y).toBeCloseTo(0.5, 12);
  });

  it("turns a point through a quarter without rounding fuzz", () => {
    expect(rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90)).toEqual({ x: 0, y: 10 });
    expect(rotatePoint({ x: 3, y: 4 }, { x: 1, y: 1 }, 180)).toEqual({ x: -1, y: -2 });
    expect(turnedBounds({ x: 100, y: 100, w: 200, h: 100 }, 90)).toEqual({ x: 150, y: 50, w: 100, h: 200 });
  });
});

describe("clamp", () => {
  it("holds a number between the limits", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
