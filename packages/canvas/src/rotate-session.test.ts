import { describe, expect, it } from "vitest";

import type { Item } from "./items.ts";
import { RotateSession } from "./session.ts";

// 200 x 100 with its centre at (200, 150); its rotate handle floats straight above at (200, 76).
const r: Item = { id: "r", x: 100, y: 100, w: 200, h: 100 };
const handle = { x: 200, y: 76 };
const centre = { x: 200, y: 150 };

/** A pointer `degrees` clockwise from straight up, 100 from the centre. */
const clockFrom = (degrees: number) => ({
  x: centre.x + 100 * Math.sin((degrees * Math.PI) / 180),
  y: centre.y - 100 * Math.cos((degrees * Math.PI) / 180),
});

describe("RotateSession on one item", () => {
  it("turns it to follow the pointer about its centre", () => {
    const s = RotateSession.start({ items: [r], grabbed: handle });
    const p = s.update({ x: 300, y: 150 });
    expect(p.angle).toBeCloseTo(90, 9);
    expect(p.boxes.size).toBe(1);
    const box = p.boxes.get("r");
    expect(box).toMatchObject({ x: 100, y: 100, w: 200, h: 100 });
    expect(box?.rotation).toBeCloseTo(90, 9);
  });

  it("adds the turn to the rotation it had", () => {
    const leaning: Item = { ...r, rotation: 30 };
    const s = RotateSession.start({ items: [leaning], grabbed: handle });
    const p = s.update(clockFrom(45));
    expect(p.angle).toBeCloseTo(75, 9);
    expect(p.boxes.get("r")?.rotation).toBeCloseTo(75, 9);
  });

  it("goes anticlockwise, and wraps into 0 to 360", () => {
    const leaning: Item = { ...r, rotation: 30 };
    const s = RotateSession.start({ items: [leaning], grabbed: handle });
    expect(s.update(clockFrom(-45)).angle).toBeCloseTo(345, 9);
    const nearlyFull: Item = { ...r, rotation: 350 };
    expect(RotateSession.start({ items: [nearlyFull], grabbed: handle }).update(clockFrom(20)).angle).toBeCloseTo(10, 9);
  });

  it("follows the change from where it was grabbed, not the pointer's own angle", () => {
    // Grabbed a quarter round from the top, at the right: the box has not turned until the pointer does.
    const s = RotateSession.start({ items: [r], grabbed: clockFrom(90) });
    expect(s.update(clockFrom(90)).angle).toBe(0);
    expect(s.update(clockFrom(135)).angle).toBeCloseTo(45, 9);
  });

  it("turns in 15 degree steps with Shift, of the whole rotation", () => {
    const leaning: Item = { ...r, rotation: 30 };
    const s = RotateSession.start({ items: [leaning], grabbed: handle });
    // 30 + 52 = 82 is nearest 75; 30 + 8 = 38 is nearest 45; 30 + 7 = 37 is nearest 30.
    expect(s.update(clockFrom(52), { shift: true }).angle).toBe(75);
    expect(s.update(clockFrom(8), { shift: true }).angle).toBe(45);
    expect(s.update(clockFrom(7), { shift: true }).angle).toBe(30);
    expect(s.update(clockFrom(52), { shift: true }).boxes.get("r")?.rotation).toBe(75);
    // And free again when Shift is let go.
    expect(s.update(clockFrom(52)).angle).toBeCloseTo(82, 9);
  });

  it("does not move or resize it", () => {
    const p = RotateSession.start({ items: [r], grabbed: handle }).update({ x: 500, y: 40 });
    expect(p.boxes.get("r")).toMatchObject({ x: 100, y: 100, w: 200, h: 100 });
  });
});

describe("RotateSession precision", () => {
  // 131 degrees round from straight up, 100 from the centre (200, 150). Worked out from the pointer, the angle
  // comes to 131.00000000000006 before it is rounded.
  const t = (131 * Math.PI) / 180;
  const pointer = { x: 200 + 100 * Math.sin(t), y: 150 - 100 * Math.cos(t) };

  it("leaves no dust on a single item's angle", () => {
    const p = RotateSession.start({ items: [r], grabbed: handle }).update(pointer);
    expect(p.angle).toBe(131);
    expect(p.boxes.get("r")?.rotation).toBe(131);
  });

  it("leaves no dust on a group's angle", () => {
    // Together these fill x 100..300, y 100..200, so they turn about (200, 150) too.
    const first: Item = { id: "g1", x: 100, y: 100, w: 50, h: 50 };
    const second: Item = { id: "g2", x: 250, y: 150, w: 50, h: 50 };
    const p = RotateSession.start({ items: [first, second], grabbed: handle }).update(pointer);
    expect(p.angle).toBe(131);
    expect(p.boxes.get("g1")?.rotation).toBe(131);
    expect(p.boxes.get("g2")?.rotation).toBe(131);
  });

  it("leaves no dust on the rotation an item ends with", () => {
    // An item written upside down with noise in the tenth decimal, as another tool might: 179.9999999999 + 131 comes
    // to 310.9999999999 without the rounding.
    const upside: Item = { id: "g1", x: 100, y: 100, w: 50, h: 50, rotation: 179.9999999999 };
    const second: Item = { id: "g2", x: 250, y: 150, w: 50, h: 50 };
    const p = RotateSession.start({ items: [upside, second], grabbed: handle }).update(pointer);
    expect(p.boxes.get("g1")?.rotation).toBe(311);
  });

  it("keeps where a group's items land to a billionth of a unit", () => {
    // A turn of 131 degrees puts the centres at irrational places; they are kept to nine decimals, not to sixteen.
    const first: Item = { id: "g1", x: 100, y: 100, w: 50, h: 50 };
    const second: Item = { id: "g2", x: 250, y: 150, w: 50, h: 50 };
    const p = RotateSession.start({ items: [first, second], grabbed: handle }).update(pointer);
    for (const id of ["g1", "g2"]) {
      const box = p.boxes.get(id);
      expect(Number((box?.x ?? Number.NaN).toFixed(9))).toBe(box?.x);
      expect(Number((box?.y ?? Number.NaN).toFixed(9))).toBe(box?.y);
    }
    expect(p.boxes.get("g1")?.x).not.toBe(100);
  });
});

describe("RotateSession on several items", () => {
  // Together they fill x 100..500, y 100..400, so they turn about (300, 250).
  const a: Item = { id: "a", x: 100, y: 100, w: 100, h: 50 };
  const b: Item = { id: "b", x: 400, y: 300, w: 100, h: 100 };
  const grabbed = { x: 300, y: 100 };

  it("swings each centre round the group's and turns each item by the same amount", () => {
    const s = RotateSession.start({ items: [a, b], grabbed });
    const p = s.update({ x: 450, y: 250 });
    expect(p.angle).toBe(90);
    // a's centre (150, 125) is 150 left of the pivot (300, 250) and 125 above it; a quarter turn clockwise puts it
    // 125 right of the pivot and 150 above it, at (425, 100). b's centre (450, 350) goes to (200, 400).
    expect(p.boxes.get("a")).toEqual({ x: 375, y: 75, w: 100, h: 50, rotation: 90 });
    expect(p.boxes.get("b")).toEqual({ x: 150, y: 350, w: 100, h: 100, rotation: 90 });
  });

  it("adds the turn to what each item already had", () => {
    // Upside down, b fills the same box as before, so the group still turns about (300, 250).
    const upside: Item = { ...b, rotation: 180 };
    const p = RotateSession.start({ items: [a, upside], grabbed }).update({ x: 450, y: 250 });
    expect(p.boxes.get("a")?.rotation).toBe(90);
    expect(p.boxes.get("b")?.rotation).toBe(270);
  });

  it("counts the group's turn from nothing, not from the rotation of its first item", () => {
    const upside: Item = { ...a, rotation: 180 };
    const p = RotateSession.start({ items: [upside, b], grabbed }).update({ x: 450, y: 250 });
    expect(p.angle).toBe(90);
    expect(p.boxes.get("a")?.rotation).toBe(270);
    expect(p.boxes.get("b")?.rotation).toBe(90);
  });

  it("finds the pivot from the boxes as turned, so a tilt that enlarges one shifts it a little", () => {
    // b tilted 10 degrees fills x 392.08..507.92, y 292.08..407.92; with a, the group's centre is (303.96, 253.96).
    // From there the grab is at -91.47 degrees and the pointer at -1.55, a turn of 89.92 rather than 90.
    const tilted: Item = { ...b, rotation: 10 };
    const p = RotateSession.start({ items: [a, tilted], grabbed }).update({ x: 450, y: 250 });
    expect(p.angle).toBeCloseTo(89.92, 2);
    expect(p.boxes.get("b")?.rotation).toBeCloseTo(p.angle + 10, 9);
  });

  it("keeps their sizes, and their distances from the pivot", () => {
    const p = RotateSession.start({ items: [a, b], grabbed }).update({ x: 380, y: 130 });
    for (const [item, box] of [
      [a, p.boxes.get("a")],
      [b, p.boxes.get("b")],
    ] as const) {
      expect(box?.w).toBe(item.w);
      expect(box?.h).toBe(item.h);
      const before = Math.hypot(item.x + item.w / 2 - 300, item.y + item.h / 2 - 250);
      const after = Math.hypot((box?.x ?? 0) + item.w / 2 - 300, (box?.y ?? 0) + item.h / 2 - 250);
      expect(after).toBeCloseTo(before, 9);
    }
  });

  it("turns in 15 degree steps with Shift, counting from the start", () => {
    // 52 degrees round from the top snaps to 45 for the group.
    const s = RotateSession.start({ items: [a, b], grabbed });
    const p = s.update({ x: 300 + 150 * Math.sin((52 * Math.PI) / 180), y: 250 - 150 * Math.cos((52 * Math.PI) / 180) }, { shift: true });
    expect(p.angle).toBe(45);
    expect(p.boxes.get("a")?.rotation).toBe(45);
    expect(p.boxes.get("b")?.rotation).toBe(45);
  });

  it("leaves every item where it was while the pointer has not moved", () => {
    const p = RotateSession.start({ items: [a, b], grabbed }).update({ x: 300, y: 100 });
    expect(p.angle).toBe(0);
    expect(p.boxes.get("a")).toEqual({ x: 100, y: 100, w: 100, h: 50, rotation: 0 });
  });

  it("turns them about the centre of the box round turned items", () => {
    // Turned a quarter, this fills x 150..250, y 50..250; with a it fills x 100..250, y 50..250: centre (175, 150).
    const q: Item = { id: "q", x: 100, y: 100, w: 200, h: 100, rotation: 90 };
    const p = RotateSession.start({ items: [a, q], grabbed: { x: 175, y: 50 } }).update({ x: 275, y: 150 });
    expect(p.angle).toBe(90);
    // q's centre (200, 150) is 25 right of the pivot (175, 150); turned a quarter it is 25 below it, at (175, 175).
    expect(p.boxes.get("q")).toEqual({ x: 75, y: 125, w: 200, h: 100, rotation: 180 });
  });
});

describe("RotateSession results", () => {
  it("says nothing changed if the pointer never moved, or came back", () => {
    const s = RotateSession.start({ items: [r], grabbed: handle });
    expect(s.end().changed).toBe(false);
    s.update(clockFrom(80));
    s.update(handle);
    expect(s.end().changed).toBe(false);
  });

  it("starts from the rotation the item has", () => {
    const leaning: Item = { ...r, rotation: 30 };
    const done = RotateSession.start({ items: [leaning], grabbed: handle }).end();
    expect(done.angle).toBe(30);
    expect(done.boxes.get("r")?.rotation).toBe(30);
    expect(done.changed).toBe(false);
  });

  it("does not count a rotation written as 400 as changed from 40", () => {
    const odd: Item = { ...r, rotation: 400 };
    const s = RotateSession.start({ items: [odd], grabbed: handle });
    s.update(handle);
    const done = s.end();
    expect(done.changed).toBe(false);
    expect(done.boxes.get("r")?.rotation).toBeCloseTo(40, 9);
  });

  it("gives the last boxes and angle from end, with or without a last position", () => {
    const s = RotateSession.start({ items: [r], grabbed: handle });
    s.update({ x: 300, y: 150 });
    const done = s.end();
    expect(done.changed).toBe(true);
    expect(done.angle).toBeCloseTo(90, 9);
    expect(done.boxes.get("r")?.rotation).toBeCloseTo(90, 9);
    expect(RotateSession.start({ items: [r], grabbed: handle }).end({ x: 300, y: 150 }).angle).toBeCloseTo(90, 9);
  });

  it("counts a group turn as a change, and no turn as none", () => {
    const a: Item = { id: "a", x: 100, y: 100, w: 100, h: 50 };
    const b: Item = { id: "b", x: 400, y: 300, w: 100, h: 100 };
    const s = RotateSession.start({ items: [a, b], grabbed: { x: 300, y: 100 } });
    expect(s.end().changed).toBe(false);
    expect(s.end({ x: 450, y: 250 }).changed).toBe(true);
  });

  it("gives a fresh preview each time", () => {
    const s = RotateSession.start({ items: [r], grabbed: handle });
    const first = s.update({ x: 300, y: 150 });
    s.update({ x: 200, y: 250 });
    expect(first.boxes.get("r")?.rotation).toBeCloseTo(90, 9);
  });

  it("does nothing with nothing to turn", () => {
    const s = RotateSession.start({ items: [], grabbed: handle });
    expect(s.update({ x: 500, y: 500 })).toEqual({ boxes: new Map(), angle: 0 });
    expect(s.end().changed).toBe(false);
  });
});
