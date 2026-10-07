// @vitest-environment node

import { describe, expect, it } from "vitest";

import { headShape, headSize, headTransform } from "./heads.ts";
import { endDirection, pathData, routePath, startDirection, trimEnd, trimStart } from "./route.ts";

describe("routePath", () => {
  it("runs a straight line from the top left to the bottom right", () => {
    expect(pathData(routePath("straight", 100, 40))).toBe("M0 0L100 40");
    expect(pathData(routePath(undefined, 100, 40))).toBe("M0 0L100 40");
    expect(pathData(routePath(null, 100, 40))).toBe("M0 0L100 40");
  });

  it("runs an elbow across to the middle, down, and across", () => {
    expect(pathData(routePath("elbow", 100, 40))).toBe("M0 0L50 0L50 40L100 40");
  });

  it("makes an elbow with no height, or no width, a straight line", () => {
    expect(pathData(routePath("elbow", 100, 0))).toBe("M0 0L50 0L100 0");
    expect(pathData(routePath("elbow", 0, 80))).toBe("M0 0L0 80");
  });

  it("runs a curve as an S between the same ends", () => {
    expect(pathData(routePath("curved", 100, 40))).toBe("M0 0C50 0 50 40 100 40");
  });

  it("gives a line with no size a path that is only a point", () => {
    expect(pathData(routePath("straight", 0, 0))).toBe("M0 0");
    expect(pathData(routePath("elbow", 0, 0))).toBe("M0 0");
    expect(endDirection(routePath("straight", 0, 0))).toEqual([1, 0]);
    expect(startDirection(routePath("straight", 0, 0))).toEqual([1, 0]);
  });
});

describe("directions", () => {
  it("point along a straight line at both ends", () => {
    const path = routePath("straight", 30, 40);
    expect(endDirection(path)).toEqual([0.6, 0.8]);
    expect(startDirection(path)).toEqual([0.6, 0.8]);
  });

  it("run horizontally at both ends of an elbow and of a curve", () => {
    expect(endDirection(routePath("elbow", 100, 40))).toEqual([1, 0]);
    expect(startDirection(routePath("elbow", 100, 40))).toEqual([1, 0]);
    expect(endDirection(routePath("curved", 100, 40))).toEqual([1, 0]);
    expect(startDirection(routePath("curved", 100, 40))).toEqual([1, 0]);
  });

  it("run down a vertical elbow or curve", () => {
    expect(endDirection(routePath("elbow", 0, 80))).toEqual([0, 1]);
    expect(endDirection(routePath("curved", 0, 80))).toEqual([0, 1]);
    expect(startDirection(routePath("curved", 0, 80))).toEqual([0, 1]);
  });
});

describe("trimming", () => {
  it("cuts a straight line short at its end", () => {
    expect(pathData(trimEnd(routePath("straight", 100, 0), 10))).toBe("M0 0L90 0");
  });

  it("cuts an elbow's last stretch, and never more than there is", () => {
    expect(pathData(trimEnd(routePath("elbow", 100, 40), 10))).toBe("M0 0L50 0L50 40L90 40");
    expect(pathData(trimEnd(routePath("elbow", 100, 40), 500))).toBe("M0 0L50 0L50 40L50 40");
  });

  it("moves the end of a curve and its last control point together", () => {
    expect(pathData(trimEnd(routePath("curved", 100, 40), 10))).toBe("M0 0C50 0 40 40 90 40");
  });

  it("cuts a line at its start", () => {
    expect(pathData(trimStart(routePath("straight", 100, 0), 10))).toBe("M10 0L100 0");
    expect(pathData(trimStart(routePath("curved", 100, 40), 10))).toBe("M10 0C60 0 50 40 100 40");
  });

  it("leaves a path with no segments, or a distance of nothing, as it was", () => {
    const point = routePath("straight", 0, 0);
    expect(trimEnd(point, 10)).toBe(point);
    expect(trimStart(point, 10)).toBe(point);
    const line = routePath("straight", 10, 0);
    expect(trimEnd(line, 0)).toBe(line);
  });
});

describe("arrowheads", () => {
  it("is 3 line widths long and across, never under 8 units", () => {
    expect(headSize(1)).toBe(8);
    expect(headSize(2)).toBe(8);
    expect(headSize(4)).toBe(12);
  });

  it("draws each kind with its tip at the origin", () => {
    expect(headShape("triangle", 10)).toEqual({ d: "M0 0L-10 -5L-10 5Z", filled: true, setback: 10 });
    expect(headShape("stealth", 10)).toEqual({ d: "M0 0L-10 -5L-7 0L-10 5Z", filled: true, setback: 7 });
    expect(headShape("open", 10)).toEqual({ d: "M-10 -5L0 0L-10 5", filled: false, setback: 0 });
    expect(headShape("diamond", 10)).toEqual({ d: "M0 0L-5 -5L-10 0L-5 5Z", filled: true, setback: 5 });
    expect(headShape("oval", 10)).toEqual({ d: "M0 0A5 5 0 1 1 -10 0A5 5 0 1 1 0 0Z", filled: true, setback: 5 });
  });

  it("draws nothing for none, or a kind it does not know", () => {
    expect(headShape("none", 10)).toBeNull();
    expect(headShape(undefined, 10)).toBeNull();
    expect(headShape(null, 10)).toBeNull();
    expect(headShape("fancy" as never, 10)).toBeNull();
  });

  it("puts a head at a point, turned to face along the line", () => {
    expect(headTransform([100, 40], [1, 0])).toBe("translate(100 40) rotate(0)");
    expect(headTransform([10, 20], [0, 1])).toBe("translate(10 20) rotate(90)");
    expect(headTransform([0, 0], [-1, 0])).toBe("translate(0 0) rotate(180)");
    expect(headTransform([0, 0], [-1, -0])).toBe("translate(0 0) rotate(180)");
    expect(headTransform([0, 0], [0, -1])).toBe("translate(0 0) rotate(-90)");
    expect(headTransform([0, 0], [0.6, 0.8])).toBe("translate(0 0) rotate(53.13)");
  });
});
