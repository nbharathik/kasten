// @vitest-environment node

import { describe, expect, it } from "vitest";

import { isPresetShape, presetShapeNames, roundingOf, shapePath, textRect } from "./index.ts";

type Pt = [number, number];

/** The points a path of absolute M, L, H, V, A and Z commands visits (an arc counts by its end point). */
function vertices(d: string): Pt[] {
  const points: Pt[] = [];
  let x = 0;
  let y = 0;
  for (const [, command, rest = ""] of d.matchAll(/([MLHVAZ])([^MLHVAZ]*)/g)) {
    const n = (rest.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (command === "M" || command === "L") [x = 0, y = 0] = n;
    else if (command === "H") x = n[0] ?? x;
    else if (command === "V") y = n[0] ?? y;
    else if (command === "A") [x = 0, y = 0] = n.slice(5);
    else continue;
    points.push([x, y]);
  }
  return points;
}

describe("shapePath", () => {
  it("draws a rect as the exact path around its box", () => {
    expect(shapePath("rect", 100, 50)).toBe("M0 0L100 0L100 50L0 50Z");
    expect(shapePath("flowChartProcess", 100, 50)).toBe("M0 0L100 0L100 50L0 50Z");
  });

  it("draws an ellipse with two half arcs", () => {
    expect(shapePath("ellipse", 100, 50)).toBe("M0 25A50 25 0 1 1 100 25A50 25 0 1 1 0 25Z");
    expect(shapePath("flowChartConnector", 60, 60)).toBe("M0 30A30 30 0 1 1 60 30A30 30 0 1 1 0 30Z");
  });

  it("rounds the corners of a roundRect by the radius it is given", () => {
    expect(shapePath("roundRect", 100, 50, 10)).toBe("M10 0H90A10 10 0 0 1 100 10V40A10 10 0 0 1 90 50H10A10 10 0 0 1 0 40V10A10 10 0 0 1 10 0Z");
    expect(shapePath("roundRect", 100, 50, { radius: 10 })).toBe(shapePath("roundRect", 100, 50, 10));
  });

  it("never lets the radius pass half the shorter side", () => {
    const half = shapePath("roundRect", 100, 50, 25);
    expect(shapePath("roundRect", 100, 50, 999)).toBe(half);
    expect(half).toContain("A25 25 0 0 1");
    expect(shapePath("roundRect", 40, 200, 999)).toContain("A20 20 0 0 1");
  });

  it("gives a roundRect a corner of a sixth of the shorter side when no radius is given", () => {
    expect(shapePath("roundRect", 120, 60)).toContain("A10 10 0 0 1");
    expect(shapePath("roundRect", 120, 60, { values: [0.25] })).toContain("A15 15 0 0 1");
  });

  it("draws a roundRect with no radius, or a negative one, as a rect", () => {
    expect(shapePath("roundRect", 100, 50, 0)).toBe(shapePath("rect", 100, 50));
    expect(shapePath("roundRect", 100, 50, -5)).toBe(shapePath("rect", 100, 50));
  });

  it("draws the polygons PowerPoint defines", () => {
    expect(shapePath("triangle", 100, 50)).toBe("M0 50L50 0L100 50Z");
    expect(shapePath("triangle", 100, 50, { values: [0.25] })).toBe("M0 50L25 0L100 50Z");
    expect(shapePath("rtTriangle", 100, 50)).toBe("M0 50L0 0L100 50Z");
    expect(shapePath("diamond", 100, 50)).toBe("M50 0L100 25L50 50L0 25Z");
    expect(shapePath("flowChartDecision", 100, 50)).toBe("M50 0L100 25L50 50L0 25Z");
    expect(shapePath("parallelogram", 100, 50)).toBe("M0 50L12.5 0L100 0L87.5 50Z");
    expect(shapePath("trapezoid", 100, 50)).toBe("M0 50L12.5 0L87.5 0L100 50Z");
    expect(shapePath("hexagon", 100, 50)).toBe("M0 25L12.5 0L87.5 0L100 25L87.5 50L12.5 50Z");
    expect(shapePath("octagon", 100, 50)).toBe("M0 14.64L14.64 0L85.36 0L100 14.64L100 35.36L85.36 50L14.64 50L0 35.36Z");
    expect(shapePath("plus", 100, 50)).toBe("M0 12.5L12.5 12.5L12.5 0L87.5 0L87.5 12.5L100 12.5L100 37.5L87.5 37.5L87.5 50L12.5 50L12.5 37.5L0 37.5Z");
    expect(shapePath("chevron", 100, 50)).toBe("M0 0L75 0L100 25L75 50L0 50L25 25Z");
    expect(shapePath("homePlate", 100, 50)).toBe("M0 0L75 0L100 25L75 50L0 50Z");
  });

  it("draws the block arrows with a shaft and a head", () => {
    expect(shapePath("rightArrow", 100, 50)).toBe("M0 12.5L75 12.5L75 0L100 25L75 50L75 37.5L0 37.5Z");
    expect(shapePath("leftArrow", 100, 50)).toBe("M0 25L25 0L25 12.5L100 12.5L100 37.5L25 37.5L25 50Z");
    expect(shapePath("upArrow", 50, 100)).toBe("M0 25L25 0L50 25L37.5 25L37.5 100L12.5 100L12.5 25Z");
    expect(shapePath("downArrow", 50, 100)).toBe("M0 75L12.5 75L12.5 0L37.5 0L37.5 75L50 75L25 100Z");
    expect(shapePath("leftRightArrow", 100, 50)).toBe("M0 25L25 0L25 12.5L75 12.5L75 0L100 25L75 50L75 37.5L25 37.5L25 50Z");
    expect(shapePath("rightArrow", 100, 50, { values: [0.2, 0.4] })).toBe("M0 20L80 20L80 0L100 25L80 50L80 30L0 30Z");
  });

  it("makes a regular pentagon and stars that touch the four sides of their box", () => {
    for (const name of ["pentagon", "star4", "star5", "star6", "star8"]) {
      const xs = vertices(shapePath(name, 200, 100)).map(([px]) => px);
      const ys = vertices(shapePath(name, 200, 100)).map(([, py]) => py);
      expect([name, Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([name, 0, 200, 0, 100]);
    }
    expect(vertices(shapePath("pentagon", 100, 100))).toHaveLength(5);
    expect(vertices(shapePath("star5", 100, 100))).toHaveLength(10);
    expect(vertices(shapePath("star4", 100, 100))).toHaveLength(8);
    expect(vertices(shapePath("star6", 100, 100))).toHaveLength(12);
    expect(vertices(shapePath("star8", 100, 100))).toHaveLength(16);
  });

  it("points a pentagon and a star straight up", () => {
    const top = vertices(shapePath("star5", 100, 100))[0];
    expect(top).toEqual([50, 0]);
    expect(vertices(shapePath("pentagon", 100, 100))[0]).toEqual([50, 0]);
  });

  it("draws a can as a body and the open front edge of its lid", () => {
    expect(shapePath("can", 100, 100)).toBe("M0 12.5A50 12.5 0 0 1 100 12.5V87.5A50 12.5 0 0 1 0 87.5ZM100 12.5A50 12.5 0 0 1 0 12.5");
  });

  it("draws a terminator with rounded ends", () => {
    const d = shapePath("flowChartTerminator", 216, 60);
    expect(d).toBe("M34.75 0H181.25A34.75 30 0 0 1 181.25 60H34.75A34.75 30 0 0 1 34.75 0Z");
  });

  it("draws a callout's tail from the side its tip is beyond", () => {
    // The tip is 62.5% of the height below the centre: the tail leaves the bottom, towards the left.
    expect(shapePath("wedgeRectCallout", 100, 50)).toBe("M0 0L100 0L100 50L41.67 50L29.17 56.25L16.67 50L0 50Z");
    // The tip is to the right of the box: the tail leaves the right side, at its upper part.
    expect(shapePath("wedgeRectCallout", 100, 50, { values: [0.8, 0] })).toBe("M0 0L100 0L100 8.33L130 25L100 20.83L100 50L0 50Z");
    // Above the box, towards the right.
    expect(shapePath("wedgeRectCallout", 100, 50, { values: [0.2, -1] })).toBe("M0 0L58.33 0L70 -25L83.33 0L100 0L100 50L0 50Z");
  });

  it("draws the rounded callout with arcs and a closed outline", () => {
    const d = shapePath("wedgeRoundRectCallout", 100, 50);
    expect(d.startsWith("M8.33 0")).toBe(true);
    expect(d).toContain("L29.17 56.25");
    expect(d.match(/A8\.33 8\.33 0 0 1/g)).toHaveLength(4);
    expect(d.endsWith("Z")).toBe(true);
    expect(shapePath("wedgeRoundRectCallout", 100, 50, 999).match(/A25 25 0 0 1/g)).toHaveLength(4);
  });

  it("draws the flowchart shapes", () => {
    expect(shapePath("flowChartInputOutput", 100, 50)).toBe("M20 0L100 0L80 50L0 50Z");
    expect(shapePath("flowChartManualOperation", 100, 50)).toBe("M0 0L100 0L80 50L20 50Z");
    expect(shapePath("flowChartPreparation", 100, 50)).toBe("M0 25L20 0L80 0L100 25L80 50L20 50Z");
    expect(shapePath("flowChartAlternateProcess", 100, 50, 10)).toBe(shapePath("roundRect", 100, 50, 10));
  });

  it("draws every preset in finite numbers and, except a callout's tail, inside its box", () => {
    for (const name of presetShapeNames()) {
      const d = shapePath(name, 160, 90);
      expect([name, d]).not.toContainEqual(expect.stringMatching(/NaN|Infinity|undefined/));
      expect(d.startsWith("M")).toBe(true);
      if (name.startsWith("wedge")) continue;
      for (const [px, py] of vertices(d)) {
        expect(px).toBeGreaterThanOrEqual(-0.01);
        expect(px).toBeLessThanOrEqual(160.01);
        expect(py).toBeGreaterThanOrEqual(-0.01);
        expect(py).toBeLessThanOrEqual(90.01);
      }
    }
  });

  it("copes with an empty, a thin and a non-finite box", () => {
    for (const name of presetShapeNames()) {
      for (const [w, h] of [
        [0, 0],
        [100, 0],
        [0, 100],
        [1, 1],
        [Number.NaN, 20],
      ] as const) {
        expect(shapePath(name, w, h)).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it("draws a name it does not know as a rect", () => {
    expect(isPresetShape("cloudCallout")).toBe(false);
    expect(shapePath("cloudCallout", 100, 50)).toBe(shapePath("rect", 100, 50));
    expect(isPresetShape("constructor")).toBe(false);
    expect(isPresetShape("toString")).toBe(false);
    expect(shapePath("toString", 100, 50)).toBe(shapePath("rect", 100, 50));
  });

  it("knows every preset the format names", () => {
    const wanted = [
      "rect", "roundRect", "ellipse", "triangle", "rtTriangle", "diamond", "parallelogram", "trapezoid", "pentagon", "hexagon", "octagon", "plus",
      "star5", "chevron", "homePlate", "rightArrow", "leftArrow", "upArrow", "downArrow", "leftRightArrow", "wedgeRectCallout",
      "wedgeRoundRectCallout", "can", "flowChartProcess", "flowChartDecision", "flowChartTerminator",
    ];
    expect(wanted.filter((name) => !isPresetShape(name))).toEqual([]);
  });
});

describe("textRect", () => {
  it("is the whole box for a preset that has no rectangle of its own", () => {
    expect(textRect("rect", 100, 50)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(textRect("hexagon", 100, 50)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(textRect("no-such-shape", 100, 50)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });

  it("keeps the text of an ellipse and a diamond inside the outline", () => {
    const ellipse = textRect("ellipse", 200, 100);
    expect(ellipse.x).toBeCloseTo(29.29, 1);
    expect(ellipse.y).toBeCloseTo(14.645, 2);
    expect(ellipse.w).toBeCloseTo(141.42, 1);
    expect(ellipse.h).toBeCloseTo(70.71, 1);
    expect(textRect("diamond", 200, 100)).toEqual({ x: 50, y: 25, w: 100, h: 50 });
    expect(textRect("flowChartDecision", 200, 100)).toEqual({ x: 50, y: 25, w: 100, h: 50 });
  });

  it("moves the text of a can below its lid, and of a triangle to its lower half", () => {
    expect(textRect("can", 100, 100)).toEqual({ x: 0, y: 25, w: 100, h: 62.5 });
    expect(textRect("triangle", 100, 100)).toEqual({ x: 25, y: 50, w: 50, h: 50 });
  });

  it("puts the text of a right triangle in the wide part near its right angle", () => {
    expect(textRect("rtTriangle", 120, 60)).toEqual({ x: 10, y: 35, w: 60, h: 20 });
  });

  it("keeps the text of an arrow in its shaft", () => {
    const right = textRect("rightArrow", 100, 50);
    expect(right.y).toBe(12.5);
    expect(right.h).toBe(25);
    expect(right.x).toBe(0);
    expect(right.w).toBeGreaterThan(70);
    expect(right.w).toBeLessThanOrEqual(100);
    const up = textRect("upArrow", 50, 100);
    expect(up.x).toBe(12.5);
    expect(up.w).toBe(25);
    expect(up.y + up.h).toBe(100);
  });

  it("insets a rounded rectangle by the corner it has", () => {
    expect(textRect("roundRect", 100, 50, 10).x).toBeCloseTo(2.93, 2);
    expect(textRect("roundRect", 100, 50, 999).x).toBeCloseTo(7.32, 2);
  });
});

describe("roundingOf", () => {
  it("follows the corners of a rounded rectangle, at the radius given or a sixth of the shorter side", () => {
    expect(roundingOf("roundRect", 120, 60, 12)).toBe("12px");
    expect(roundingOf("roundRect", 120, 60)).toBe("10px");
    expect(roundingOf("roundRect", 120, 60, 999)).toBe("30px");
    expect(roundingOf("flowChartAlternateProcess", 120, 60, 8)).toBe("8px");
  });

  it("is fully round for an ellipse", () => {
    expect(roundingOf("ellipse", 120, 60)).toBe("50%");
    expect(roundingOf("flowChartConnector", 60, 60)).toBe("50%");
  });

  it("is nothing for a preset with corners", () => {
    expect(roundingOf("rect", 120, 60)).toBeUndefined();
    expect(roundingOf("star5", 120, 60)).toBeUndefined();
    expect(roundingOf("unknown", 120, 60)).toBeUndefined();
  });
});
