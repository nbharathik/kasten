import { describe, expect, it } from "vitest";

import type { Point, Size } from "./geometry.ts";
import { ZOOM_LIMITS, fitView, panBy, toScreen, toSlide, wheelZoomFactor, zoomAt } from "./view.ts";
import type { View } from "./view.ts";

const slide: Size = { w: 960, h: 540 };

describe("fitView", () => {
  it.each<[string, Size, number | undefined, View]>([
    ["a container that is the slide plus the padding", { w: 1008, h: 588 }, undefined, { zoom: 1, panX: 24, panY: 24 }],
    ["a container half that size", { w: 528, h: 318 }, undefined, { zoom: 0.5, panX: 24, panY: 24 }],
    ["a container too narrow, so the width sets the zoom", { w: 528, h: 1000 }, undefined, { zoom: 0.5, panX: 24, panY: 365 }],
    ["a container too short, so the height sets the zoom", { w: 1200, h: 318 }, undefined, { zoom: 0.5, panX: 360, panY: 24 }],
    ["no padding", { w: 960, h: 540 }, 0, { zoom: 1, panX: 0, panY: 0 }],
    ["a padding of 100", { w: 1160, h: 740 }, 100, { zoom: 1, panX: 100, panY: 100 }],
    ["a container that gives the slide twice its size", { w: 1968, h: 1128 }, undefined, { zoom: 2, panX: 24, panY: 24 }],
  ])("fits %s", (_name, container, padding, expected) => {
    expect(fitView(container, slide, padding)).toEqual(expected);
  });

  it("pads 24 by default", () => {
    expect(fitView({ w: 1008, h: 588 }, slide)).toEqual(fitView({ w: 1008, h: 588 }, slide, 24));
  });

  it("leaves equal room either side of the content", () => {
    const container = { w: 1000, h: 600 };
    const view = fitView(container, slide);
    const topLeft = toScreen(view, { x: 0, y: 0 });
    const bottomRight = toScreen(view, { x: slide.w, y: slide.h });
    expect(topLeft.x).toBeCloseTo(container.w - bottomRight.x, 9);
    expect(topLeft.y).toBeCloseTo(container.h - bottomRight.y, 9);
    // The slide fits: the tighter side keeps its padding.
    expect(Math.min(topLeft.x, topLeft.y)).toBeCloseTo(24, 9);
    expect(topLeft.x).toBeGreaterThanOrEqual(24 - 1e-9);
    expect(topLeft.y).toBeGreaterThanOrEqual(24 - 1e-9);
  });

  it("stays within the zoom limits", () => {
    expect(fitView({ w: 100000, h: 100000 }, slide).zoom).toBe(8);
    expect(fitView({ w: 60, h: 60 }, slide).zoom).toBe(0.1);
  });

  it("copes with a container smaller than its padding, and with content that has no size", () => {
    // Its room counts as 1 unit, which would need a zoom below the least there is: it gets the least.
    const small = fitView({ w: 40, h: 40 }, slide);
    expect(small.zoom).toBe(0.1);
    expect(Number.isFinite(small.panX) && Number.isFinite(small.panY)).toBe(true);
    expect(fitView({ w: 800, h: 600 }, { w: 0, h: 0 })).toEqual({ zoom: 1, panX: 400, panY: 300 });
  });
});

describe("zoomAt", () => {
  const view: View = { zoom: 1, panX: 24, panY: 24 };

  it.each<[string, View, Point, number, View]>([
    ["doubles about a point", view, { x: 524, y: 294 }, 2, { zoom: 2, panX: -476, panY: -246 }],
    ["halves about a point", view, { x: 524, y: 294 }, 0.5, { zoom: 0.5, panX: 274, panY: 159 }],
    ["leaves the pan when the point is the pan's own", view, { x: 24, y: 24 }, 2, { zoom: 2, panX: 24, panY: 24 }],
    ["zooms about the corner", { zoom: 1, panX: 0, panY: 0 }, { x: 0, y: 0 }, 4, { zoom: 4, panX: 0, panY: 0 }],
    ["zooms a view that is already zoomed", { zoom: 2, panX: 100, panY: 50 }, { x: 300, y: 250 }, 1.5, { zoom: 3, panX: 0, panY: -50 }],
  ])("%s", (_name, from, at, factor, expected) => {
    expect(zoomAt(from, at, factor)).toEqual(expected);
  });

  it("keeps the slide point under the pointer where it was", () => {
    const views: View[] = [view, { zoom: 0.37, panX: -120.5, panY: 88 }, { zoom: 5.2, panX: 900, panY: -430 }];
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 524, y: 294 },
      { x: -50, y: 700 },
      { x: 333.3, y: 12.5 },
    ];
    for (const v of views) {
      for (const at of points) {
        for (const factor of [0.5, 0.9, 1.1, 1.5, 3]) {
          const before = toSlide(v, at);
          const after = toScreen(zoomAt(v, at, factor), before);
          expect(after.x).toBeCloseTo(at.x, 9);
          expect(after.y).toBeCloseTo(at.y, 9);
        }
      }
    }
  });

  it("multiplies the zoom by the factor", () => {
    expect(zoomAt({ zoom: 1.5, panX: 0, panY: 0 }, { x: 10, y: 10 }, 2).zoom).toBe(3);
  });

  it("holds the zoom within the limits, and still keeps the point where it was", () => {
    expect(ZOOM_LIMITS).toEqual([0.1, 8]);
    const from: View = { zoom: 4, panX: 10, panY: 20 };
    const at = { x: 200, y: 100 };
    const out = zoomAt(from, at, 10);
    expect(out.zoom).toBe(8);
    // Clamped to 8, so the effective factor is 2: the point still stays put.
    expect(out).toEqual({ zoom: 8, panX: 200 - (200 - 10) * 2, panY: 100 - (100 - 20) * 2 });
    expect(zoomAt({ zoom: 0.5, panX: 0, panY: 0 }, at, 0.001).zoom).toBe(0.1);
  });

  it("does not move the view once at a limit", () => {
    const top: View = { zoom: 8, panX: 10, panY: 20 };
    expect(zoomAt(top, { x: 50, y: 60 }, 2)).toEqual(top);
    const bottom: View = { zoom: 0.1, panX: 10, panY: 20 };
    expect(zoomAt(bottom, { x: 50, y: 60 }, 0.5)).toEqual(bottom);
  });

  it("takes the limits it is given", () => {
    expect(zoomAt({ zoom: 1.5, panX: 0, panY: 0 }, { x: 0, y: 0 }, 2, [1, 2]).zoom).toBe(2);
    expect(zoomAt({ zoom: 1.5, panX: 0, panY: 0 }, { x: 0, y: 0 }, 0.1, [1, 2]).zoom).toBe(1);
  });

  it("ignores a factor that is not a positive number", () => {
    for (const factor of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(zoomAt(view, { x: 100, y: 100 }, factor)).toEqual(view);
    }
  });

  it("returns to where it began when zoomed in and out about one point", () => {
    const at = { x: 400, y: 260 };
    const back = zoomAt(zoomAt(view, at, 2.5), at, 1 / 2.5);
    expect(back.zoom).toBeCloseTo(1, 12);
    expect(back.panX).toBeCloseTo(24, 9);
    expect(back.panY).toBeCloseTo(24, 9);
  });

  it("leaves the view it was given alone", () => {
    const copy = { ...view };
    zoomAt(view, { x: 1, y: 2 }, 3);
    expect(view).toEqual(copy);
  });
});

describe("panBy", () => {
  it("slides the view by screen pixels and keeps the zoom", () => {
    expect(panBy({ zoom: 2, panX: 10, panY: 20 }, 5, -7)).toEqual({ zoom: 2, panX: 15, panY: 13 });
  });

  it("moves what is drawn the same way", () => {
    const view: View = { zoom: 2, panX: 10, panY: 20 };
    const moved = panBy(view, 30, -40);
    const p = toScreen(view, { x: 5, y: 5 });
    expect(toScreen(moved, { x: 5, y: 5 })).toEqual({ x: p.x + 30, y: p.y - 40 });
  });

  it("does not change the view it was given", () => {
    const view: View = { zoom: 2, panX: 10, panY: 20 };
    panBy(view, 1, 1);
    expect(view).toEqual({ zoom: 2, panX: 10, panY: 20 });
  });
});

describe("toScreen and toSlide", () => {
  const view: View = { zoom: 2, panX: 100, panY: 50 };

  it("map with screen = slide * zoom + pan", () => {
    expect(toScreen(view, { x: 10, y: 20 })).toEqual({ x: 120, y: 90 });
    expect(toSlide(view, { x: 120, y: 90 })).toEqual({ x: 10, y: 20 });
    expect(toScreen(view, { x: 0, y: 0 })).toEqual({ x: 100, y: 50 });
    expect(toSlide(view, { x: 100, y: 50 })).toEqual({ x: 0, y: 0 });
  });

  it("go back and forth without loss", () => {
    const views: View[] = [view, { zoom: 1, panX: 0, panY: 0 }, { zoom: 0.37, panX: -120.5, panY: 88 }, { zoom: 7.9, panX: 900, panY: -430 }];
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 960, y: 540 },
      { x: -13.7, y: 4000 },
      { x: 480.25, y: 270.125 },
    ];
    for (const v of views) {
      for (const p of points) {
        const there = toSlide(v, toScreen(v, p));
        expect(there.x).toBeCloseTo(p.x, 9);
        expect(there.y).toBeCloseTo(p.y, 9);
        const back = toScreen(v, toSlide(v, p));
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.y).toBeCloseTo(p.y, 9);
      }
    }
  });

  it("scale distances by the zoom", () => {
    const a = toScreen(view, { x: 0, y: 0 });
    const b = toScreen(view, { x: 30, y: 40 });
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBe(100);
  });
});

describe("wheelZoomFactor", () => {
  it.each<[number, boolean, number]>([
    [0, false, 1],
    [0, true, 1],
    [-100, false, Math.exp(0.2)],
    [100, false, Math.exp(-0.2)],
    [-50, false, Math.exp(0.1)],
    [-10, true, Math.exp(0.1)],
    [10, true, Math.exp(-0.1)],
    [-2, true, Math.exp(0.02)],
  ])("turns a wheel of %d (ctrl %s) into %d", (deltaY, ctrl, expected) => {
    expect(wheelZoomFactor(deltaY, ctrl)).toBeCloseTo(expected, 12);
  });

  it("zooms in for a wheel turned away and out for one turned towards", () => {
    expect(wheelZoomFactor(-30, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(30, false)).toBeLessThan(1);
    expect(wheelZoomFactor(-3, true)).toBeGreaterThan(1);
    expect(wheelZoomFactor(3, true)).toBeLessThan(1);
  });

  it("undoes itself for the opposite turn", () => {
    for (const ctrl of [false, true]) {
      for (const d of [1, 7, 20, 60, 100, 400]) {
        expect(wheelZoomFactor(d, ctrl) * wheelZoomFactor(-d, ctrl)).toBeCloseTo(1, 12);
      }
    }
  });

  it("caps one event at about 22 per cent, whatever the delta", () => {
    expect(wheelZoomFactor(-100000, false)).toBeCloseTo(Math.exp(0.2), 12);
    expect(wheelZoomFactor(-100000, true)).toBeCloseTo(Math.exp(0.2), 12);
    expect(wheelZoomFactor(100000, false)).toBeCloseTo(Math.exp(-0.2), 12);
    expect(wheelZoomFactor(-100, true)).toBeCloseTo(Math.exp(0.2), 12);
  });

  it("makes a pinch much finer than a wheel notch for the same small delta", () => {
    // The same delta of 5 pixels: a mouse wheel barely moves; a pinch zooms 5%.
    expect(Math.log(wheelZoomFactor(-5, true))).toBeCloseTo(0.05, 12);
    expect(Math.log(wheelZoomFactor(-5, false))).toBeCloseTo(0.01, 12);
  });

  it("is 1 for a delta that is not a number", () => {
    expect(wheelZoomFactor(Number.NaN, false)).toBe(1);
    expect(wheelZoomFactor(Number.POSITIVE_INFINITY, true)).toBe(1);
  });

  it("works with zoomAt to keep the point under the pointer", () => {
    const view: View = { zoom: 1, panX: 24, panY: 24 };
    const at = { x: 300, y: 200 };
    const zoomed = zoomAt(view, at, wheelZoomFactor(-100, false));
    expect(zoomed.zoom).toBeCloseTo(Math.exp(0.2), 12);
    const under = toSlide(zoomed, at);
    expect(under.x).toBeCloseTo(276, 9);
    expect(under.y).toBeCloseTo(176, 9);
  });
});
