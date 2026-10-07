import { describe, expect, it } from "vitest";

import type { Item } from "./items.ts";
import { ResizeSession } from "./session.ts";
import type { Frame } from "./snap.ts";
import type { Handle } from "./transform.ts";

const frame: Frame = { width: 960, height: 540 };
// Lines: b at x 400 / 450 / 500, y 300 / 350 / 400; c at x 700 / 750 / 800, y 450 / 475 / 500;
// the slide at x 0 / 480 / 960, y 0 / 270 / 540.
const a: Item = { id: "a", x: 100, y: 100, w: 100, h: 50 };
const b: Item = { id: "b", x: 400, y: 300, w: 100, h: 100 };
const c: Item = { id: "c", x: 700, y: 450, w: 100, h: 50 };

type Point = { x: number; y: number };

describe("ResizeSession on several items", () => {
  const a2: Item = { id: "a2", x: 100, y: 200, w: 60, h: 40 };
  // Together they fill x 100..200, y 100..240.
  const items = [a, a2];
  const start = (handle: Handle, grabbed: Point, extra: Item[] = [b, c]) => ResizeSession.start({ items, handle, all: [...items, ...extra], frame, grabbed });

  it("scales them as one box, keeping how they lie in it", () => {
    // The south east corner is at (200, 240); 100 across and 70 down scales x by 2 and y by 1.5.
    const p = start("se", { x: 200, y: 240 }).update({ x: 300, y: 310 });
    expect(p.boxes).toEqual(
      new Map([
        ["a", { x: 100, y: 100, w: 200, h: 75 }],
        ["a2", { x: 100, y: 250, w: 120, h: 60 }],
      ]),
    );
    expect(p.guides).toEqual([]);
  });

  it("scales them all by one factor with Shift", () => {
    // The wider stretch, 2, sets both: the group goes from 100 x 140 to 200 x 280.
    const p = start("se", { x: 200, y: 240 }).update({ x: 300, y: 310 }, { shift: true });
    expect(p.boxes).toEqual(
      new Map([
        ["a", { x: 100, y: 100, w: 200, h: 100 }],
        ["a2", { x: 100, y: 300, w: 120, h: 80 }],
      ]),
    );
  });

  it("snaps the group's edge, not each item's", () => {
    // 497 across puts the group's right edge at 697, 3 short of c's left edge: the width becomes 600, six times.
    const p = start("e", { x: 200, y: 170 }).update({ x: 697, y: 170 });
    expect(p.boxes).toEqual(
      new Map([
        ["a", { x: 100, y: 100, w: 600, h: 50 }],
        ["a2", { x: 100, y: 200, w: 360, h: 40 }],
      ]),
    );
    expect(p.guides).toEqual([{ axis: "x", at: 700, from: 100, to: 500, kind: "edge" }]);
  });

  it("does not snap to the items being resized", () => {
    // a's right edge, 200, is 3 short of the group's dragged edge at 203. Were a its own target, the edge would snap onto it.
    const p = start("e", { x: 200, y: 170 }).update({ x: 203, y: 170 });
    expect(p.guides).toEqual([]);
    expect(p.boxes.get("a")?.w).toBeCloseTo(103, 9);
  });

  it("mirrors the group when dragged inside out, and marks each item as flipped", () => {
    // The east handle dragged 150 left leaves the group 50 wide, to the left of its old left edge (x 50..100).
    const p = start("e", { x: 200, y: 170 }).update({ x: 50, y: 170 });
    expect(p.boxes).toEqual(
      new Map([
        // a spans the group's whole width, so mirrored it stays where it is, then halves with the group.
        ["a", { x: 50, y: 100, w: 50, h: 50, flipH: true }],
        // a2 sat at the left of the group; mirrored, it sits at the right.
        ["a2", { x: 70, y: 200, w: 30, h: 40, flipH: true }],
      ]),
    );
  });

  it("mirrors the group top to bottom when dragged inside out that way", () => {
    // The south handle, at (150, 240), dragged 180 up leaves the group 40 tall above its old top edge (y 60..100).
    const p = start("s", { x: 150, y: 240 }).update({ x: 150, y: 60 });
    const top = p.boxes.get("a2");
    const bottom = p.boxes.get("a");
    // a2 sat at the bottom of the group; mirrored, it is at the top. a was at the top, and is now at the bottom.
    expect(top).toMatchObject({ x: 100, w: 60, flipV: true });
    expect(top?.flipH).toBeUndefined();
    expect(top?.y).toBeCloseTo(60, 6);
    expect(top?.h).toBeCloseTo(80 / 7, 6);
    expect(bottom).toMatchObject({ x: 100, w: 100, flipV: true });
    expect(bottom?.y).toBeCloseTo(600 / 7, 6);
    expect(bottom?.h).toBeCloseTo(100 / 7, 6);
  });

  it("turns rotation round for a mirrored item", () => {
    const leaning: Item = { ...a2, rotation: 30 };
    const s = ResizeSession.start({ items: [a, leaning], handle: "e", all: [a, leaning], frame, grabbed: { x: 200, y: 170 } });
    const p = s.update({ x: 50, y: 170 });
    expect(p.boxes.get("a2")?.rotation).toBe(330);
    expect(p.boxes.get("a")?.rotation).toBeUndefined();
  });

  it("uses the box round turned items for the group", () => {
    // Turned a quarter, this fills x 150..250, y 50..250; with a it makes a group from x 100 to 250.
    const r: Item = { id: "r", x: 100, y: 100, w: 200, h: 100, rotation: 90 };
    const s = ResizeSession.start({ items: [a, r], handle: "e", all: [a, r], frame });
    // The east handle of that group is at (250, 150). Dragging it 150 further doubles the width from 150 to 300.
    const p = s.update({ x: 400, y: 150 });
    expect(p.boxes.get("a")).toEqual({ x: 100, y: 100, w: 200, h: 50 });
    // r's turned box, 100 wide and 200 tall, becomes 200 wide and 200 tall: its own width and height swap roles.
    expect(p.boxes.get("r")).toEqual({ x: 200, y: 50, w: 200, h: 200, rotation: 90 });
  });
});
