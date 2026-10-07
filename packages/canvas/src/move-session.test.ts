import { describe, expect, it } from "vitest";

import type { Item } from "./items.ts";
import { MoveSession } from "./session.ts";
import type { Frame } from "./snap.ts";

const frame: Frame = { width: 960, height: 540 };
// Lines: a at x 100 / 150 / 200, y 100 / 125 / 150; b at x 400 / 450 / 500, y 300 / 350 / 400;
// c at x 700 / 750 / 800, y 450 / 475 / 500; the slide at x 0 / 480 / 960, y 0 / 270 / 540.
const a: Item = { id: "a", x: 100, y: 100, w: 100, h: 50 };
const b: Item = { id: "b", x: 400, y: 300, w: 100, h: 100 };
const c: Item = { id: "c", x: 700, y: 450, w: 100, h: 50 };
const all = [a, b, c];
const grabbed = { x: 150, y: 125 };

const begin = (extra: Partial<Parameters<typeof MoveSession.start>[0]> = {}) => MoveSession.start({ items: [a], all, frame, grabbed, ...extra });

describe("MoveSession as a click", () => {
  it("does not move anything for a press that hardly travels", () => {
    const s = begin();
    const p = s.update({ x: 151, y: 126 });
    expect(p.moves).toEqual(new Map([["a", { x: 100, y: 100 }]]));
    expect(p.guides).toEqual([]);
    expect(s.moved).toBe(false);
    expect(s.end()).toEqual({ moves: new Map(), moved: false });
  });

  it("is a drag once the pointer has travelled 3 units, in any direction", () => {
    expect(begin().update({ x: 152.9, y: 125 }).moves.get("a")).toEqual({ x: 100, y: 100 });
    for (const to of [
      { x: 153, y: 125 },
      { x: 147, y: 125 },
      { x: 150, y: 128 },
      { x: 150, y: 122 },
    ]) {
      const s = begin();
      s.update(to);
      expect(s.moved).toBe(true);
    }
    // 3 units of travel counted as the distance, not per axis.
    const diagonal = begin();
    diagonal.update({ x: 152, y: 127 });
    expect(diagonal.moved).toBe(false);
    diagonal.update({ x: 152.2, y: 127.2 });
    expect(diagonal.moved).toBe(true);
  });

  it("takes its threshold from the option", () => {
    // A move of 6 and 7 is 9.2 units: a click with a threshold of 10, a drag by default.
    const far = { x: 156, y: 132 };
    const patient = begin({ threshold: 10 });
    patient.update(far);
    expect(patient.moved).toBe(false);
    const eager = begin();
    eager.update(far);
    expect(eager.moved).toBe(true);
    const past = begin({ threshold: 10 });
    past.update({ x: 156, y: 133 });
    expect(past.moved).toBe(true);
  });

  it("stays a drag once it is one, even back at the start", () => {
    const s = begin();
    s.update({ x: 170, y: 165 });
    const back = s.update({ x: 150, y: 125 });
    expect(s.moved).toBe(true);
    expect(back.moves.get("a")).toEqual({ x: 100, y: 100 });
    expect(s.end().moved).toBe(true);
    expect(s.end().moves.get("a")).toEqual({ x: 100, y: 100 });
  });
});

describe("MoveSession as a drag", () => {
  it("moves an item by the pointer's travel", () => {
    const s = begin();
    const p = s.update({ x: 170, y: 165 });
    expect(p.moves).toEqual(new Map([["a", { x: 120, y: 140 }]]));
    expect(p.guides).toEqual([]);
    expect(s.moved).toBe(true);
  });

  it("gives the final positions from end, with or without a last position", () => {
    const s = begin();
    s.update({ x: 170, y: 165 });
    expect(s.end()).toEqual({ moves: new Map([["a", { x: 120, y: 140 }]]), moved: true });
    const t = begin();
    expect(t.end({ x: 170, y: 165 })).toEqual({ moves: new Map([["a", { x: 120, y: 140 }]]), moved: true });
  });

  it("leaves no floating-point dust on a snapped position", () => {
    // 10.1 + 93.3 + 144.5 is not quite 247.9, and the snap adds 3 more on top; the result is 157.6, not 157.60000000000002.
    const wide: Item = { id: "wide", x: 10.1, y: 100, w: 93.3, h: 50 };
    const neighbour: Item = { id: "n", x: 250.9, y: 300, w: 100, h: 100 };
    const s = MoveSession.start({ items: [wide], all: [wide, neighbour], frame, grabbed: { x: 0, y: 0 } });
    expect(s.update({ x: 144.5, y: 0 }).moves.get("wide")).toEqual({ x: 157.6, y: 100 });
  });

  it("gives a fresh preview each time", () => {
    const s = begin();
    const first = s.update({ x: 170, y: 165 });
    s.update({ x: 190, y: 185 });
    expect(first.moves.get("a")).toEqual({ x: 120, y: 140 });
  });

  it("moves several items together, keeping how they lie", () => {
    const a2: Item = { id: "a2", x: 100, y: 200, w: 60, h: 40 };
    const s = MoveSession.start({ items: [a, a2], all: [a, a2, b, c], frame, grabbed });
    const p = s.update({ x: 170, y: 165 });
    expect(p.moves).toEqual(
      new Map([
        ["a", { x: 120, y: 140 }],
        ["a2", { x: 120, y: 240 }],
      ]),
    );
  });

  it("does nothing with nothing to move", () => {
    const s = MoveSession.start({ items: [], all, frame, grabbed });
    expect(s.update({ x: 500, y: 500 }).moves.size).toBe(0);
    expect(s.end().moves.size).toBe(0);
  });
});

describe("MoveSession with Shift", () => {
  it("keeps to the vertical when the pointer has gone further down than across", () => {
    const p = begin().update({ x: 170, y: 165 }, { shift: true });
    expect(p.moves.get("a")).toEqual({ x: 100, y: 140 });
  });

  it("keeps to the horizontal when the pointer has gone further across", () => {
    const p = begin().update({ x: 190, y: 135 }, { shift: true });
    expect(p.moves.get("a")).toEqual({ x: 140, y: 100 });
  });

  it("goes across when the two are equal", () => {
    expect(begin().update({ x: 180, y: 155 }, { shift: true }).moves.get("a")).toEqual({ x: 130, y: 100 });
  });

  it("does not let snapping pull it off its line", () => {
    // d's top edge is 3 below a's. Free, the drag slides down onto it as well as across onto b.
    const d: Item = { id: "d", x: 600, y: 103, w: 30, h: 400 };
    const s = begin({ all: [a, b, c, d] });
    const across = { x: 347, y: 125 };
    expect(s.update(across).moves.get("a")).toEqual({ x: 300, y: 103 });
    const locked = s.update(across, { shift: true });
    expect(locked.moves.get("a")).toEqual({ x: 300, y: 100 });
    expect(locked.guides.length).toBeGreaterThan(0);
    expect(locked.guides.every((g) => g.axis === "x")).toBe(true);
  });

  it("can be let go of mid-drag", () => {
    const s = begin();
    s.update({ x: 190, y: 135 }, { shift: true });
    expect(s.update({ x: 190, y: 135 }, {}).moves.get("a")).toEqual({ x: 140, y: 110 });
  });
});

describe("MoveSession snapping", () => {
  // 197 across puts a's right edge at 397, 3 short of b's left edge.
  const near = { x: 347, y: 125 };

  it("moves the last few units onto a neighbour's edge and reports the guide", () => {
    const p = begin().update(near);
    expect(p.moves.get("a")).toEqual({ x: 300, y: 100 });
    // Drawn for a where it lands, (300, 100) to (400, 150), and reaching down to b's bottom at 400.
    expect(p.guides).toEqual([{ axis: "x", at: 400, from: 100, to: 400, kind: "edge" }]);
  });

  it("draws the guides for where the box then is, when it has gone down as well as across", () => {
    const p = begin().update({ x: 347, y: 165 });
    expect(p.moves.get("a")).toEqual({ x: 300, y: 140 });
    expect(p.guides).toEqual([{ axis: "x", at: 400, from: 140, to: 400, kind: "edge" }]);
  });

  it("snaps down onto a neighbour's top edge", () => {
    // d's top edge is at 200; 97 down puts a's top at 197.
    const d: Item = { id: "d", x: 600, y: 200, w: 30, h: 30 };
    const p = begin({ all: [a, b, c, d] }).update({ x: 150, y: 222 });
    expect(p.moves.get("a")).toEqual({ x: 100, y: 200 });
    expect(p.guides).toEqual([{ axis: "y", at: 200, from: 100, to: 630, kind: "edge" }]);
  });

  it("is off while Alt is held", () => {
    const p = begin().update(near, { alt: true });
    expect(p.moves.get("a")).toEqual({ x: 297, y: 100 });
    expect(p.guides).toEqual([]);
  });

  it("is off with noSnap too", () => {
    const p = begin().update(near, { noSnap: true });
    expect(p.moves.get("a")).toEqual({ x: 297, y: 100 });
    expect(p.guides).toEqual([]);
  });

  it("comes back on when the key is let go", () => {
    const s = begin();
    s.update(near, { alt: true });
    expect(s.update(near).moves.get("a")).toEqual({ x: 300, y: 100 });
  });

  it("treats a selection of several as one box", () => {
    // The second item runs out to x = 260, further than a: together they fill x 100..260, y 100..240.
    const wide: Item = { id: "wide", x: 100, y: 200, w: 160, h: 40 };
    const s = MoveSession.start({ items: [a, wide], all: [a, wide, b, c], frame, grabbed });
    // 137 across puts the group's right edge at 397, 3 short of b's left edge. Alone, a would end at 337.
    const p = s.update({ x: 287, y: 125 });
    expect(p.moves).toEqual(
      new Map([
        ["a", { x: 240, y: 100 }],
        ["wide", { x: 240, y: 200 }],
      ]),
    );
    expect(p.guides).toEqual([{ axis: "x", at: 400, from: 100, to: 400, kind: "edge" }]);
  });

  it("does not snap to the items it is dragging", () => {
    // If a were its own target, 3.5 across would snap back onto its old left edge.
    const p = begin().update({ x: 153.5, y: 125 });
    expect(p.moves.get("a")).toEqual({ x: 103.5, y: 100 });
    expect(p.guides).toEqual([]);
  });

  it("snaps the box a turned item fills, not the box it was drawn in", () => {
    // Turned a quarter, this item fills x 150..250, y 50..250 about the centre (200, 150).
    const r: Item = { id: "r", x: 100, y: 100, w: 200, h: 100, rotation: 90 };
    const s = MoveSession.start({ items: [r], all: [r, b, c], frame, grabbed: { x: 200, y: 150 } });
    const p = s.update({ x: 347, y: 150 });
    // 147 across leaves its right side at 397; snapped, it moves 150.
    expect(p.moves.get("r")).toEqual({ x: 250, y: 100 });
    expect(p.guides).toEqual([{ axis: "x", at: 400, from: 50, to: 400, kind: "edge" }]);
  });

  it("snaps to the slide's margins", () => {
    const s = begin({ frame: { ...frame, margin: 48 } });
    const p = s.update({ x: 101, y: 125 });
    expect(p.moves.get("a")).toEqual({ x: 48, y: 100 });
    expect(p.guides).toEqual([{ axis: "x", at: 48, from: 0, to: 540, kind: "margin" }]);
  });

  it("snaps to the slide's centre", () => {
    // 328 across leaves a's middle at 428 + 50 = 478, two short of the slide's middle at 480.
    const p = begin().update({ x: 478, y: 125 });
    expect(p.moves.get("a")).toEqual({ x: 430, y: 100 });
    expect(p.guides).toEqual([{ axis: "x", at: 480, from: 0, to: 540, kind: "centre" }]);
  });

  it("takes its reach from the option", () => {
    const p = begin({ snapThreshold: 2 }).update(near);
    expect(p.moves.get("a")).toEqual({ x: 297, y: 100 });
    expect(p.guides).toEqual([]);
  });

  it("gives no guides after the drag ends", () => {
    const s = begin();
    s.update(near);
    expect("guides" in s.end()).toBe(false);
  });
});
