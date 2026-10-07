import type { Item, Rect } from "@kasten-slides/canvas";
import { describe, expect, it } from "vitest";

import { CHIP, GAP, INSET, STAGE_ROOM, moveHandles, onScreen, placeMoveHandle } from "./move-handle.ts";

/** A stage that shows everything from a little left of and above the slide, as the stage does when it is not scrolled. */
const ROOMY: Rect = { x: -STAGE_ROOM, y: -STAGE_ROOM, w: 5000, h: 5000 };

const centreOf = (place: { x: number; y: number }) => ({ x: place.x + CHIP / 2, y: place.y + CHIP / 2 });
const item = (id: string, x: number, y: number, w = 100, h = 60, extra: Partial<Item> = {}): Item => ({ id, x, y, w, h, ...extra });

describe("where the move handle goes", () => {
  it("sits just outside the top left corner, clear of the corner's own resize handle", () => {
    const place = placeMoveHandle({ box: { x: 200, y: 100, w: 100, h: 50 }, area: ROOMY });
    expect(place).toEqual({ x: 200 - GAP - CHIP, y: 100 - GAP - CHIP, inside: false });
    // The resize handle at the corner reaches 4.5 px out: the chip stays clear of it.
    expect(200 - (place.x + CHIP)).toBeGreaterThan(4.5);
    expect(100 - (place.y + CHIP)).toBeGreaterThan(4.5);
  });

  it("is the same size at every zoom: only the box it belongs to grows", () => {
    const small = placeMoveHandle({ box: onScreen({ x: 100, y: 100, w: 200, h: 100 }, 0.5), area: ROOMY });
    const large = placeMoveHandle({ box: onScreen({ x: 100, y: 100, w: 200, h: 100 }, 2), area: ROOMY });
    expect(small).toEqual({ x: 50 - GAP - CHIP, y: 50 - GAP - CHIP, inside: false });
    expect(large).toEqual({ x: 200 - GAP - CHIP, y: 200 - GAP - CHIP, inside: false });
  });

  it("goes inside the corner when the block is against the top or the left of what can be seen", () => {
    const corner = placeMoveHandle({ box: { x: 0, y: 0, w: 300, h: 200 }, area: ROOMY });
    expect(corner).toEqual({ x: INSET, y: INSET, inside: true });
    const top = placeMoveHandle({ box: { x: 200, y: 0, w: 300, h: 200 }, area: ROOMY });
    expect(top).toEqual({ x: 200 + INSET, y: INSET, inside: true });
    const left = placeMoveHandle({ box: { x: 0, y: 150, w: 300, h: 200 }, area: ROOMY });
    expect(left).toEqual({ x: INSET, y: 150 + INSET, inside: true });
  });

  it("stays outside for as long as the whole chip can be seen, and not a pixel longer", () => {
    // The chip's left edge is at x - 30: with the view starting at -24, x = 6 just fits.
    expect(placeMoveHandle({ box: { x: GAP + CHIP - STAGE_ROOM, y: 300, w: 100, h: 60 }, area: ROOMY }).inside).toBe(false);
    expect(placeMoveHandle({ box: { x: GAP + CHIP - STAGE_ROOM - 1, y: 300, w: 100, h: 60 }, area: ROOMY }).inside).toBe(true);
    expect(placeMoveHandle({ box: { x: 300, y: GAP + CHIP - STAGE_ROOM, w: 100, h: 60 }, area: ROOMY }).inside).toBe(false);
    expect(placeMoveHandle({ box: { x: 300, y: GAP + CHIP - STAGE_ROOM - 1, w: 100, h: 60 }, area: ROOMY }).inside).toBe(true);
  });

  it("follows the top left corner of a block that is turned, and stays outside its turned outline", () => {
    // 100 by 50 at (200, 100), turned a quarter clockwise: the box's top left corner is now its top right on the screen, at (275, 75).
    const place = placeMoveHandle({ box: { x: 200, y: 100, w: 100, h: 50 }, rotation: 90, area: ROOMY });
    expect(place.inside).toBe(false);
    const c = centreOf(place);
    // Out along the turned block's own up-and-left: on the screen that is up and to the right of the corner.
    expect(c.x).toBeCloseTo(275 + GAP + CHIP / 2, 6);
    expect(c.y).toBeCloseTo(75 - GAP - CHIP / 2, 6);
  });

  it("keeps the chip upright and the same distance from the corner whatever the turn", () => {
    const box = { x: 300, y: 300, w: 160, h: 90 };
    const centre = { x: 380, y: 345 };
    for (const rotation of [0, 15, 45, 90, 135, 180, 225, 270, 315]) {
      const place = placeMoveHandle({ box, rotation, area: ROOMY });
      expect(place.inside).toBe(false);
      const c = centreOf(place);
      // Half the chip plus the gap, along both of the block's own axes: the diagonal of the chip's step.
      const t = (rotation * Math.PI) / 180;
      const corner = {
        x: centre.x + (-80 * Math.cos(t) + 45 * Math.sin(t)),
        y: centre.y + (-80 * Math.sin(t) - 45 * Math.cos(t)),
      };
      expect(Math.hypot(c.x - corner.x, c.y - corner.y)).toBeCloseTo(Math.SQRT2 * (GAP + CHIP / 2), 6);
    }
  });

  it("goes inside a turned block's own corner too, along its own axes", () => {
    // Turned a half: the top left corner is the bottom right one on the screen, at (300, 200) for a 100 by 60 box at (200, 140)... against the area's edge it goes inward.
    const box = { x: 200, y: 140, w: 100, h: 60 };
    const wide: Rect = { x: -1000, y: -1000, w: 5000, h: 5000 };
    const outside = placeMoveHandle({ box, rotation: 180, area: wide });
    expect(outside.inside).toBe(false);
    // Squeeze the view so that the chip cannot fit past the bottom right of the turned box.
    const view: Rect = { x: 0, y: 0, w: 300 + GAP + CHIP - 1, h: 200 + GAP + CHIP - 1 };
    const inside = placeMoveHandle({ box, rotation: 180, area: view });
    expect(inside.inside).toBe(true);
    const c = centreOf(inside);
    expect(c.x).toBeCloseTo(300 - INSET - CHIP / 2, 6);
    expect(c.y).toBeCloseTo(200 - INSET - CHIP / 2, 6);
  });

  it("is pushed into the view when the block's corner has been scrolled out of it", () => {
    // The view starts 100 px in: the block's corner at 50 is out of sight, and neither place shows the whole chip.
    const view: Rect = { x: 100, y: 0, w: 800, h: 600 };
    const place = placeMoveHandle({ box: { x: 50, y: 300, w: 400, h: 200 }, area: view });
    expect(place.x).toBe(100);
    expect(place.y).toBe(300 - GAP - CHIP);
  });

  it("copes with a view that is smaller than the chip", () => {
    const place = placeMoveHandle({ box: { x: 50, y: 50, w: 100, h: 100 }, area: { x: 0, y: 0, w: 10, h: 10 } });
    expect(Number.isFinite(place.x) && Number.isFinite(place.y)).toBe(true);
  });
});

describe("which blocks have a handle", () => {
  const base = { group: null, hovered: null, gesture: null, active: true } as const;

  it("gives one selected block its own handle, at its box and turn", () => {
    const a = item("a", 10, 20, 100, 50, { rotation: 30 });
    expect(moveHandles({ ...base, selected: [a] })).toEqual([{ kind: "selection", id: null, box: { x: 10, y: 20, w: 100, h: 50 }, rotation: 30 }]);
  });

  it("gives several selected blocks one handle on the box round them", () => {
    const a = item("a", 10, 20);
    const b = item("b", 400, 300);
    const around = { x: 10, y: 20, w: 490, h: 340 };
    expect(moveHandles({ ...base, selected: [a, b], group: around })).toEqual([{ kind: "selection", id: null, box: around, rotation: 0 }]);
  });

  it("gives a locked block none, and a selection of locked blocks none", () => {
    const locked = item("l", 10, 20, 100, 50, { locked: true });
    expect(moveHandles({ ...base, selected: [locked] })).toEqual([]);
    expect(moveHandles({ ...base, selected: [locked, { ...locked, id: "m" }], group: { x: 0, y: 0, w: 1, h: 1 } })).toEqual([]);
    // One that can be moved is enough for the selection's handle: it moves that one and leaves the locked ones.
    expect(moveHandles({ ...base, selected: [locked, item("free", 300, 300)], group: { x: 10, y: 20, w: 390, h: 340 } })).toHaveLength(1);
  });

  it("gives a hovered block that is not selected a lighter handle of its own, and a selected one only its selection handle", () => {
    const a = item("a", 10, 20);
    const b = item("b", 300, 200, 100, 60, { rotation: 10 });
    expect(moveHandles({ ...base, selected: [], hovered: b })).toEqual([{ kind: "hover", id: "b", box: { x: 300, y: 200, w: 100, h: 60 }, rotation: 10 }]);
    expect(moveHandles({ ...base, selected: [a], hovered: b }).map((h) => h.kind)).toEqual(["selection", "hover"]);
    expect(moveHandles({ ...base, selected: [a], hovered: a }).map((h) => h.kind)).toEqual(["selection"]);
    expect(moveHandles({ ...base, selected: [], hovered: { ...b, locked: true } })).toEqual([]);
  });

  it("shows none while a drawing tool is in hand or a gesture other than a move goes on", () => {
    const a = item("a", 10, 20);
    expect(moveHandles({ ...base, selected: [a], hovered: item("b", 300, 200), active: false })).toEqual([]);
    for (const gesture of ["resize", "rotate", "marquee", "end", "draw"] as const) {
      expect(moveHandles({ ...base, selected: [a], hovered: item("b", 300, 200), gesture }), gesture).toEqual([]);
    }
    for (const gesture of ["move", "grab"] as const) expect(moveHandles({ ...base, selected: [a], gesture }), gesture).toHaveLength(1);
  });
});
