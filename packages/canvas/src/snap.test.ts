import { describe, expect, it } from "vitest";

import type { Rect } from "./geometry.ts";
import { mergeGuides, nearest } from "./guides.ts";
import type { Guide } from "./guides.ts";
import { snapMove } from "./snap.ts";
import type { Frame } from "./snap.ts";

const frame: Frame = { width: 960, height: 540 };
const withMargin: Frame = { width: 960, height: 540, margin: 48 };
// Its edges are at x 300 and 400, its middle at 350; and the same down the slide.
const target: Rect = { x: 300, y: 300, w: 100, h: 100 };
const none = { dx: 0, dy: 0, guides: [] };

const box = (x: number, y: number, w = 50, h = 50): Rect => ({ x, y, w, h });

describe("snapMove onto a neighbour", () => {
  it.each<[string, Rect, number, number, Guide]>([
    ["left edge onto its right edge", box(403, 100), -3, 0, { axis: "x", at: 400, from: 100, to: 400, kind: "edge" }],
    ["centre onto its centre", box(328, 100), -3, 0, { axis: "x", at: 350, from: 100, to: 400, kind: "centre" }],
    ["right edge onto its left edge", box(247, 100), 3, 0, { axis: "x", at: 300, from: 100, to: 400, kind: "edge" }],
    ["top edge onto its bottom edge", box(600, 397), 0, 3, { axis: "y", at: 400, from: 300, to: 650, kind: "edge" }],
    ["middle onto its middle", box(600, 328), 0, -3, { axis: "y", at: 350, from: 300, to: 650, kind: "centre" }],
    ["bottom edge onto its top edge", box(600, 277, 50, 20), 0, 3, { axis: "y", at: 300, from: 300, to: 650, kind: "edge" }],
  ])("lines up the %s", (_name, moving, dx, dy, guide) => {
    expect(snapMove(moving, [target], frame)).toEqual({ dx, dy, guides: [guide] });
  });

  it("lines up a centre with an edge as well", () => {
    // The moving box's centre (478) is 3 short of the target's left edge at 481.
    const r = snapMove(box(453, 100), [{ x: 481, y: 300, w: 10, h: 10 }], { width: 2000, height: 2000 });
    expect(r.dx).toBe(3);
    expect(r.guides).toEqual([{ axis: "x", at: 481, from: 100, to: 310, kind: "centre" }]);
  });

  it("snaps both axes at once and draws a guide for each", () => {
    const r = snapMove(box(403, 397), [target], frame);
    expect(r.dx).toBe(-3);
    expect(r.dy).toBe(3);
    // Drawn for the box where it lands, (400, 400) to (450, 450).
    expect(r.guides).toEqual([
      { axis: "x", at: 400, from: 300, to: 450, kind: "edge" },
      { axis: "y", at: 400, from: 300, to: 450, kind: "edge" },
    ]);
  });

  it("takes the smallest move when several lines are near", () => {
    // Left edges at 104 (4 away, +4) and 98 (2 away, -2); the second is nearer.
    const near = { x: 104, y: 200, w: 200, h: 30 };
    const nearer = { x: 98, y: 400, w: 200, h: 30 };
    const r = snapMove(box(100, 100, 20, 10), [near, nearer], frame);
    expect(r.dx).toBe(-2);
    expect(r.guides).toEqual([{ axis: "x", at: 98, from: 100, to: 430, kind: "edge" }]);
  });

  it("shows only the line it lands on when another is a hair further off", () => {
    // Left edges 3 and 3.3 away: it moves 3, and 3.3 is not a line it is on.
    const near = { x: 103, y: 200, w: 200, h: 30 };
    const further = { x: 103.3, y: 400, w: 200, h: 30 };
    const r = snapMove(box(100, 100, 20, 10), [near, further], frame);
    expect(r.dx).toBe(3);
    expect(r.guides).toEqual([{ axis: "x", at: 103, from: 100, to: 230, kind: "edge" }]);
  });

  it("shows every line it lands on, joined into one where they coincide", () => {
    const a = { x: 103, y: 200, w: 50, h: 50 };
    const b = { x: 103, y: 400, w: 50, h: 50 };
    const r = snapMove(box(100, 100), [a, b], frame);
    expect(r.dx).toBe(3);
    expect(r.guides).toEqual([
      { axis: "x", at: 103, from: 100, to: 450, kind: "edge" },
      { axis: "x", at: 128, from: 100, to: 450, kind: "centre" },
      { axis: "x", at: 153, from: 100, to: 450, kind: "edge" },
    ]);
  });

  it("reports a line it is already on, without moving", () => {
    const r = snapMove(box(400, 100), [target], frame);
    expect(r.dx).toBe(0);
    expect(r.guides).toEqual([{ axis: "x", at: 400, from: 100, to: 400, kind: "edge" }]);
  });

  it("finds nothing to line up with when there are no neighbours and the slide is far", () => {
    expect(snapMove(box(403, 100), [], frame)).toEqual(none);
  });

  it("changes neither of its inputs", () => {
    const moving = box(403, 397);
    const targets = [{ ...target }];
    snapMove(moving, targets, frame);
    expect(moving).toEqual(box(403, 397));
    expect(targets).toEqual([target]);
  });
});

describe("snapMove onto the slide", () => {
  it.each<[string, Rect, Frame, number, Guide]>([
    ["left edge", box(4, 100), frame, -4, { axis: "x", at: 0, from: 0, to: 540, kind: "edge" }],
    ["right edge", box(905, 100), frame, 5, { axis: "x", at: 960, from: 0, to: 540, kind: "edge" }],
    ["horizontal centre", box(453, 100), frame, 2, { axis: "x", at: 480, from: 0, to: 540, kind: "centre" }],
    ["left margin", box(51, 100), withMargin, -3, { axis: "x", at: 48, from: 0, to: 540, kind: "margin" }],
    ["right margin", box(858, 100), withMargin, 4, { axis: "x", at: 912, from: 0, to: 540, kind: "margin" }],
  ])("lines up the %s", (_name, moving, f, dx, guide) => {
    expect(snapMove(moving, [], f)).toEqual({ dx, dy: 0, guides: [guide] });
  });

  it.each<[string, Rect, Frame, number, Guide]>([
    ["top edge", box(100, 4), frame, -4, { axis: "y", at: 0, from: 0, to: 960, kind: "edge" }],
    ["bottom edge", box(100, 485), frame, 5, { axis: "y", at: 540, from: 0, to: 960, kind: "edge" }],
    ["vertical centre", box(100, 243), frame, 2, { axis: "y", at: 270, from: 0, to: 960, kind: "centre" }],
    ["top margin", box(100, 45), withMargin, 3, { axis: "y", at: 48, from: 0, to: 960, kind: "margin" }],
    ["bottom margin", box(100, 440), withMargin, 2, { axis: "y", at: 492, from: 0, to: 960, kind: "margin" }],
  ])("lines up the %s", (_name, moving, f, dy, guide) => {
    expect(snapMove(moving, [], f)).toEqual({ dx: 0, dy, guides: [guide] });
  });

  it("has no margin guides unless the frame gives a margin", () => {
    expect(snapMove(box(51, 100), [], frame)).toEqual(none);
    expect(snapMove(box(51, 100), [], { ...frame, margin: 0 })).toEqual(none);
  });

  it("calls a line-up with a centre line a centre guide, whichever of the two is the centre", () => {
    // The moving box's left edge, at 477, is 3 short of the slide's middle, 480.
    expect(snapMove(box(477, 100), [], frame).guides).toEqual([{ axis: "x", at: 480, from: 0, to: 540, kind: "centre" }]);
    // Its left edge, at 347, is 3 short of the target's middle, 350.
    expect(snapMove(box(347, 100, 20, 20), [target], frame).guides).toEqual([{ axis: "x", at: 350, from: 100, to: 400, kind: "centre" }]);
  });

  it("prefers the nearer of the slide's line and a neighbour's", () => {
    // The slide's left margin is 3 away; a neighbour's left edge at 55 is 4 away the other way.
    const r = snapMove(box(51, 100), [{ x: 55, y: 300, w: 30, h: 30 }], withMargin);
    expect(r.dx).toBe(-3);
    expect(r.guides.map((g) => g.kind)).toEqual(["margin"]);
  });
});

describe("snapMove threshold", () => {
  it.each<[string, Rect, number | undefined, number]>([
    ["reaches 6 by default", box(244, 100), undefined, 6],
    ["stops just past 6", box(243.5, 100), undefined, 0],
    ["is set smaller", box(247, 100), 2, 0],
    ["is set smaller and still snaps within it", box(247, 100), 3, 3],
    ["is set larger", box(242, 100), 10, 8],
    ["is set to nothing", box(247, 100), 0, 0],
  ])("%s", (_name, moving, threshold, dx) => {
    const r = snapMove(moving, [target], frame, threshold === undefined ? {} : { threshold });
    expect(r.dx).toBe(dx);
    expect(r.guides.length).toBe(dx === 0 ? 0 : 1);
  });

  it("finds nothing far from everything", () => {
    expect(snapMove(box(600, 100), [target], frame)).toEqual(none);
  });
});

describe("snapMove switched off", () => {
  it("does nothing, even on a line", () => {
    expect(snapMove(box(403, 397), [target], frame, { enabled: false })).toEqual(none);
    expect(snapMove(box(400, 100), [target], frame, { enabled: false })).toEqual(none);
  });

  it("is on when enabled is true or left out", () => {
    expect(snapMove(box(403, 100), [target], frame, { enabled: true }).dx).toBe(-3);
    expect(snapMove(box(403, 100), [target], frame, {}).dx).toBe(-3);
  });
});

describe("snapMove along one axis", () => {
  // Both axes would snap: 3 left onto the target's right edge, 3 down onto its bottom edge.
  const moving = box(403, 397);

  it("snaps x alone, drawing the guide for where the box then is", () => {
    expect(snapMove(moving, [target], frame, { axis: "x" })).toEqual({
      dx: -3,
      dy: 0,
      guides: [{ axis: "x", at: 400, from: 300, to: 447, kind: "edge" }],
    });
  });

  it("snaps y alone", () => {
    expect(snapMove(moving, [target], frame, { axis: "y" })).toEqual({
      dx: 0,
      dy: 3,
      guides: [{ axis: "y", at: 400, from: 300, to: 453, kind: "edge" }],
    });
  });
});

describe("guides helpers", () => {
  it("keeps the first of equal moves and everything tied with it", () => {
    const draw = () => [];
    const solved = nearest([
      { offset: 3, draw },
      { offset: -3, draw },
      { offset: 3, draw },
      { offset: 5, draw },
    ]);
    expect(solved.offset).toBe(3);
    expect(solved.picked).toHaveLength(2);
    expect(nearest([]).offset).toBe(0);
  });

  it("keeps the whole run when a shorter guide joins a longer one", () => {
    const merged = mergeGuides([
      { axis: "x", at: 10, from: 5, to: 40, kind: "edge" },
      { axis: "x", at: 10, from: 15, to: 20, kind: "edge" },
    ]);
    expect(merged).toEqual([{ axis: "x", at: 10, from: 5, to: 40, kind: "edge" }]);
  });

  it("joins guides on one line and leaves gaps apart", () => {
    const merged = mergeGuides([
      { axis: "x", at: 10, from: 5, to: 20, kind: "edge" },
      { axis: "x", at: 10, from: 15, to: 40, kind: "edge" },
      { axis: "x", at: 10, from: 0, to: 4, kind: "centre" },
      { axis: "y", at: 10, from: 0, to: 4, kind: "edge" },
      { axis: "y", at: 5, from: 0, to: 10, kind: "spacing" },
      { axis: "y", at: 5, from: 20, to: 30, kind: "spacing" },
      { axis: "y", at: 5, from: 20, to: 30, kind: "spacing" },
    ]);
    expect(merged).toEqual([
      { axis: "x", at: 10, from: 5, to: 40, kind: "edge" },
      { axis: "x", at: 10, from: 0, to: 4, kind: "centre" },
      { axis: "y", at: 10, from: 0, to: 4, kind: "edge" },
      { axis: "y", at: 5, from: 0, to: 10, kind: "spacing" },
      { axis: "y", at: 5, from: 20, to: 30, kind: "spacing" },
    ]);
  });
});
