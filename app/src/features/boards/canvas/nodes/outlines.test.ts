import { describe, expect, it } from "vitest";

import { MAX_POINTS, outlinePath, parsePoints, SHAPES, strokeBox, strokeHit, strokePath, toStroke } from "./outlines";

describe("shape outlines and strokes", () => {
  it("draws every shape inside its box", () => {
    for (const { kind } of SHAPES) {
      const d = outlinePath(kind, 180, 96, 1.5);
      expect(d.startsWith("M"), kind).toBe(true);
      const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      expect(Math.min(...numbers), kind).toBeGreaterThanOrEqual(0);
      expect(Math.max(...numbers), kind).toBeLessThanOrEqual(180);
    }
    expect(outlinePath("diamond", 100, 60)).toBe("M50 1L99 30L50 59L1 30Z");
  });

  it("thins a very long stroke to what the core keeps, ends and all", () => {
    const drawn = Array.from({ length: 12_000 }, (_, i) => ({ x: i * 2, y: Math.sin(i / 50) * 40 }));
    const stroke = toStroke(drawn, 4)!;
    const points = parsePoints(stroke.points);
    expect(points.length).toBeLessThanOrEqual(MAX_POINTS);
    expect(points.length).toBeGreaterThan(MAX_POINTS / 2);
    expect(points[0]![0] + stroke.x).toBe(0);
    expect(points[points.length - 1]![0] + stroke.x).toBe(23_998);
  });

  it("measures a drawing once, the box its points were drawn in", () => {
    const draw = { points: "4,4 24,14 44,5", size: 4 };
    const box = strokeBox(draw);
    expect(box).toEqual({ points: [[4, 4], [24, 14], [44, 5]], width: 48, height: 18 });
    expect(strokeBox(draw)).toBe(box);
  });

  it("keeps a stroke in whole numbers relative to a padded box", () => {
    const stroke = toStroke(
      [
        { x: 100.4, y: 50.2 },
        { x: 100.6, y: 50.4 },
        { x: 120, y: 60 },
        { x: 140.2, y: 51 },
      ],
      4,
    )!;
    expect(stroke).toEqual({ x: 96, y: 46, width: 49, height: 18, points: "4,4 24,14 44,5" });
    expect(parsePoints(stroke.points)).toEqual([
      [4, 4],
      [24, 14],
      [44, 5],
    ]);
    expect(toStroke([], 3)).toBeNull();
  });

  it("smooths a line through the midpoints of its points", () => {
    expect(strokePath([[0, 0], [10, 10], [20, 0]])).toBe("M0 0Q10 10 15 5L20 0");
    expect(strokePath([[5, 5]])).toBe("M5 5l0.01 0");
    expect(strokePath([])).toBe("");
  });
});

describe("the eraser's aim", () => {
  const drawing = { x: 100, y: 100, width: 106, height: 106, draw: { points: "3,3 103,103", size: 2 } };

  it("hits the line itself, not the empty corner of its box", () => {
    expect(strokeHit(drawing, { x: 153, y: 153 }, 4)).toBe(true);
    expect(strokeHit(drawing, { x: 200, y: 105 }, 4)).toBe(false);
    expect(strokeHit(drawing, { x: 500, y: 500 }, 4)).toBe(false);
    expect(strokeHit({ ...drawing, draw: undefined }, { x: 153, y: 153 }, 4)).toBe(false);
  });

  it("follows a drawing that was resized", () => {
    const wide = { ...drawing, width: 212 };
    expect(strokeHit(wide, { x: 206, y: 153 }, 4)).toBe(true);
    expect(strokeHit(wide, { x: 153, y: 153 }, 4)).toBe(false);
  });
});
