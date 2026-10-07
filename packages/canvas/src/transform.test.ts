import { describe, expect, it } from "vitest";

import type { Point } from "./geometry.ts";
import { HANDLES, handleDirection, handlePoints, mirrorHandle, rotationFor } from "./transform.ts";
import type { Handle } from "./transform.ts";

describe("handlePoints", () => {
  const upright = { x: 100, y: 100, w: 200, h: 100 };

  it("places the eight handles on the edges and corners, and the rotate handle above", () => {
    expect(handlePoints(upright)).toEqual({
      nw: { x: 100, y: 100 },
      n: { x: 200, y: 100 },
      ne: { x: 300, y: 100 },
      e: { x: 300, y: 150 },
      se: { x: 300, y: 200 },
      s: { x: 200, y: 200 },
      sw: { x: 100, y: 200 },
      w: { x: 100, y: 150 },
      rotate: { x: 200, y: 76 },
    });
  });

  it.each([
    [1, 76],
    [2, 88],
    [0.5, 52],
    [4, 94],
  ])("floats the rotate handle 24 / zoom units up at zoom %d", (zoom, y) => {
    expect(handlePoints(upright, zoom).rotate).toEqual({ x: 200, y });
  });

  it("does not move the resize handles with the zoom", () => {
    const zoomed = handlePoints(upright, 3);
    const plain = handlePoints(upright);
    for (const h of HANDLES) expect(zoomed[h]).toEqual(plain[h]);
  });

  it("falls back to zoom 1 for a zoom that makes no sense", () => {
    expect(handlePoints(upright, 0).rotate).toEqual({ x: 200, y: 76 });
    expect(handlePoints(upright, -2).rotate).toEqual({ x: 200, y: 76 });
  });

  it("turns every handle with a box turned a quarter", () => {
    // The top now faces right, so the north handle is on the right of the centre (200, 150).
    expect(handlePoints({ ...upright, rotation: 90 })).toEqual({
      nw: { x: 250, y: 50 },
      n: { x: 250, y: 150 },
      ne: { x: 250, y: 250 },
      e: { x: 200, y: 250 },
      se: { x: 150, y: 250 },
      s: { x: 150, y: 150 },
      sw: { x: 150, y: 50 },
      w: { x: 200, y: 50 },
      rotate: { x: 274, y: 150 },
    });
  });

  it("turns them upside down at 180 degrees", () => {
    const p = handlePoints({ ...upright, rotation: 180 });
    expect(p.n).toEqual({ x: 200, y: 200 });
    expect(p.nw).toEqual({ x: 300, y: 200 });
    expect(p.e).toEqual({ x: 100, y: 150 });
    expect(p.rotate).toEqual({ x: 200, y: 224 });
  });

  it("turns them 30 degrees clockwise about the centre", () => {
    const p = handlePoints({ ...upright, rotation: 30 });
    const cos = Math.sqrt(3) / 2;
    expect(p.e.x).toBeCloseTo(200 + 100 * cos, 9);
    expect(p.e.y).toBeCloseTo(150 + 100 * 0.5, 9);
    expect(p.nw.x).toBeCloseTo(200 - 100 * cos + 50 * 0.5, 9);
    expect(p.nw.y).toBeCloseTo(150 - 100 * 0.5 - 50 * cos, 9);
    expect(p.rotate.x).toBeCloseTo(200 + 74 * 0.5, 9);
    expect(p.rotate.y).toBeCloseTo(150 - 74 * cos, 9);
  });

  it("keeps every handle the same distance from the centre as the box unturned", () => {
    const flat = handlePoints(upright);
    for (const rotation of [17, 45, 133, 300]) {
      const turned = handlePoints({ ...upright, rotation });
      for (const h of [...HANDLES, "rotate" as const]) {
        expect(Math.hypot(turned[h].x - 200, turned[h].y - 150)).toBeCloseTo(Math.hypot(flat[h].x - 200, flat[h].y - 150), 9);
      }
    }
  });
});

describe("handles", () => {
  it("lists eight, clockwise from the top left", () => {
    expect(HANDLES).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
  });

  it.each<[Handle, number, number]>([
    ["nw", -1, -1],
    ["n", 0, -1],
    ["ne", 1, -1],
    ["e", 1, 0],
    ["se", 1, 1],
    ["s", 0, 1],
    ["sw", -1, 1],
    ["w", -1, 0],
  ])("%s drags x %d and y %d", (handle, x, y) => {
    expect(handleDirection(handle)).toEqual({ x, y });
  });

  it.each<[Handle, { h?: boolean; v?: boolean }, Handle]>([
    ["e", {}, "e"],
    ["e", { h: true }, "w"],
    ["e", { v: true }, "e"],
    ["n", { v: true }, "s"],
    ["n", { h: true }, "n"],
    ["se", { h: true }, "sw"],
    ["se", { v: true }, "ne"],
    ["se", { h: true, v: true }, "nw"],
    ["nw", { h: true, v: true }, "se"],
    ["w", { h: false, v: false }, "w"],
  ])("mirrors %s with %o to %s", (handle, flip, expected) => {
    expect(mirrorHandle(handle, flip)).toBe(expected);
  });
});

describe("rotationFor", () => {
  const origin: Point = { x: 0, y: 0 };
  const up: Point = { x: 0, y: -100 };
  const right: Point = { x: 100, y: 0 };
  const down: Point = { x: 0, y: 100 };
  const left: Point = { x: -100, y: 0 };
  const polar = (degrees: number, r = 100): Point => ({
    x: r * Math.cos((degrees * Math.PI) / 180),
    y: r * Math.sin((degrees * Math.PI) / 180),
  });

  it.each<[string, Point, Point, number, number]>([
    ["stays put when the pointer does", up, up, 10, 10],
    ["turns a quarter clockwise", up, right, 0, 90],
    ["adds that to the start rotation", up, right, 10, 100],
    ["turns a half", up, down, 0, 180],
    ["turns three quarters", up, left, 0, 270],
    ["turns anticlockwise", right, up, 0, 270],
    ["turns anticlockwise from 45", right, up, 45, 315],
    ["turns anticlockwise below zero", right, up, 30, 300],
    ["wraps past 360", up, right, 350, 80],
    ["starts from a rotation outside 0 to 360", up, right, 400, 130],
    ["starts from a negative rotation", up, up, -30, 330],
    ["does not care how far the pointer is", up, { x: 500, y: 0 }, 0, 90],
    ["follows the change in angle, not the angle, when grabbed away from the handle", { x: 100, y: 100 }, down, 0, 45],
  ])("%s", (_name, grabbed, pointer, startRotation, expected) => {
    expect(rotationFor(origin, pointer, grabbed, startRotation)).toBeCloseTo(expected, 9);
  });

  it("turns about a centre that is not the origin", () => {
    const centre = { x: 200, y: 150 };
    expect(rotationFor(centre, { x: 300, y: 150 }, { x: 200, y: 50 }, 0)).toBeCloseTo(90, 9);
    expect(rotationFor(centre, { x: 200, y: 250 }, { x: 200, y: 50 }, 15)).toBeCloseTo(195, 9);
  });

  it("always lands in [0, 360)", () => {
    for (let start = -720; start <= 720; start += 45) {
      for (const pointer of [up, right, down, left, polar(33), polar(291)]) {
        const r = rotationFor(origin, pointer, up, start);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(360);
      }
    }
  });

  describe("with a step", () => {
    // Pointer angles are measured from the grab at 0 degrees (straight right).
    it.each<[number, number, number, number]>([
      [52, 0, 15, 45],
      [53, 0, 15, 60],
      [52.4, 0, 15, 45],
      [7, 0, 15, 0],
      [8, 0, 15, 15],
      [52, 10, 15, 60],
      [-4, 0, 15, 0],
      [-8, 0, 15, 345],
      [90, 0, 15, 90],
      [44, 0, 45, 45],
      [100, 20, 30, 120],
    ])("moves the pointer %d degrees from a rotation of %d, in steps of %d, to %d", (moved, startRotation, step, expected) => {
      expect(rotationFor(origin, polar(moved), right, startRotation, { step })).toBe(expected);
    });

    it("snaps the whole rotation, not just the change", () => {
      // 10 + 2 = 12 is nearer to 15 than to 0, though the change alone (2) is nearer to 0.
      expect(rotationFor(origin, polar(2), right, 10, { step: 15 })).toBe(15);
      expect(rotationFor(origin, polar(2), right, 3, { step: 15 })).toBe(0);
    });

    it("wraps 360 round to 0", () => {
      expect(rotationFor(origin, polar(-3), right, 0, { step: 15 })).toBe(0);
      expect(rotationFor(origin, polar(-3), right, 355, { step: 15 })).toBe(345);
    });

    it("does nothing for a step of 0", () => {
      expect(rotationFor(origin, polar(52), right, 0, { step: 0 })).toBeCloseTo(52, 9);
    });
  });

  it("keeps the start rotation when the pointer or the grab is on the centre", () => {
    expect(rotationFor(origin, origin, up, 40)).toBe(40);
    expect(rotationFor(origin, right, origin, 40)).toBe(40);
    expect(rotationFor(origin, origin, origin, 400)).toBe(40);
  });
});
