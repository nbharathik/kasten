import { describe, expect, it } from "vitest";

import type { Item } from "./items.ts";
import { MarqueeSession } from "./session.ts";

const a: Item = { id: "a", x: 100, y: 100, w: 100, h: 50 };
const b: Item = { id: "b", x: 400, y: 300, w: 100, h: 100 };
const c: Item = { id: "c", x: 700, y: 450, w: 100, h: 50 };
const locked: Item = { id: "lk", x: 100, y: 10, w: 20, h: 20, locked: true };
const all = [a, b, c, locked];
const origin = { x: 0, y: 0 };

describe("MarqueeSession", () => {
  it("gives the rectangle and the items it takes in, as the pointer moves", () => {
    const s = MarqueeSession.start({ all, origin, base: [], additive: false });
    expect(s.update({ x: 450, y: 200 })).toEqual({ rect: { x: 0, y: 0, w: 450, h: 200 }, ids: ["a"] });
    expect(s.update({ x: 520, y: 420 })).toEqual({ rect: { x: 0, y: 0, w: 520, h: 420 }, ids: ["a", "b"] });
    expect(s.update({ x: 30, y: 30 })).toEqual({ rect: { x: 0, y: 0, w: 30, h: 30 }, ids: [] });
  });

  it("makes a rectangle with positive size whichever way it is dragged", () => {
    const s = MarqueeSession.start({ all, origin: { x: 520, y: 420 }, base: [], additive: false });
    expect(s.update(origin)).toEqual({ rect: { x: 0, y: 0, w: 520, h: 420 }, ids: ["a", "b"] });
    const t = MarqueeSession.start({ all, origin: { x: 520, y: 0 }, base: [], additive: false });
    expect(t.update({ x: 0, y: 420 }).rect).toEqual({ x: 0, y: 0, w: 520, h: 420 });
  });

  it("leaves locked items out", () => {
    // Both rectangles hold or reach the locked item (x 100..120, y 10..30) and nothing else.
    const s = MarqueeSession.start({ all, origin, base: [], additive: false });
    expect(s.update({ x: 150, y: 60 }).ids).toEqual([]);
    const t = MarqueeSession.start({ all, origin, base: [], additive: false, mode: "touch" });
    expect(t.update({ x: 110, y: 20 }).ids).toEqual([]);
  });

  describe("adding to a selection", () => {
    it("puts the selection it began with first, then what the rectangle takes", () => {
      const s = MarqueeSession.start({ all, origin, base: ["c"], additive: true });
      expect(s.update({ x: 520, y: 420 }).ids).toEqual(["c", "a", "b"]);
    });

    it("names an item once even if both have it", () => {
      const s = MarqueeSession.start({ all, origin, base: ["a"], additive: true });
      expect(s.update({ x: 520, y: 420 }).ids).toEqual(["a", "b"]);
    });

    it("keeps the base while the rectangle takes in nothing", () => {
      const s = MarqueeSession.start({ all, origin, base: ["c"], additive: true });
      expect(s.update({ x: 30, y: 30 }).ids).toEqual(["c"]);
    });

    it("replaces it when not additive", () => {
      const s = MarqueeSession.start({ all, origin, base: ["c"], additive: false });
      expect(s.update({ x: 520, y: 420 }).ids).toEqual(["a", "b"]);
      expect(s.update({ x: 30, y: 30 }).ids).toEqual([]);
    });
  });

  describe("modes", () => {
    it("contains by default, so an item the rectangle only reaches into is left out", () => {
      const s = MarqueeSession.start({ all, origin, base: [], additive: false });
      expect(s.update({ x: 450, y: 350 }).ids).toEqual(["a"]);
    });

    it("touches when asked", () => {
      const s = MarqueeSession.start({ all, origin, base: [], additive: false, mode: "touch" });
      expect(s.update({ x: 450, y: 350 }).ids).toEqual(["a", "b"]);
    });
  });

  describe("end", () => {
    it("gives the last state", () => {
      const s = MarqueeSession.start({ all, origin, base: [], additive: false });
      s.update({ x: 520, y: 420 });
      expect(s.end()).toEqual({ rect: { x: 0, y: 0, w: 520, h: 420 }, ids: ["a", "b"] });
    });

    it("takes a last pointer position", () => {
      const s = MarqueeSession.start({ all, origin, base: [], additive: false });
      expect(s.end({ x: 520, y: 420 }).ids).toEqual(["a", "b"]);
    });

    it("is an empty rectangle at the origin for a click, which clears the selection", () => {
      const s = MarqueeSession.start({ all, origin: { x: 60, y: 70 }, base: ["a", "b"], additive: false });
      expect(s.end()).toEqual({ rect: { x: 60, y: 70, w: 0, h: 0 }, ids: [] });
    });

    it("keeps the selection for an additive click", () => {
      const s = MarqueeSession.start({ all, origin, base: ["a", "b"], additive: true });
      expect(s.end().ids).toEqual(["a", "b"]);
    });

    it("hands out copies, so changing one does not change the session", () => {
      const s = MarqueeSession.start({ all, origin, base: [], additive: false });
      const first = s.update({ x: 520, y: 420 });
      first.ids.push("zzz");
      first.rect.w = 1;
      expect(s.end()).toEqual({ rect: { x: 0, y: 0, w: 520, h: 420 }, ids: ["a", "b"] });
    });

    it("hands out copies from end as well", () => {
      const s = MarqueeSession.start({ all, origin, base: [], additive: false });
      s.update({ x: 520, y: 420 });
      const done = s.end();
      done.ids.push("zzz");
      done.rect.w = 1;
      expect(s.end()).toEqual({ rect: { x: 0, y: 0, w: 520, h: 420 }, ids: ["a", "b"] });
    });

    it("does not change the base it was given", () => {
      const base = ["c"];
      const s = MarqueeSession.start({ all, origin, base, additive: true });
      s.update({ x: 520, y: 420 });
      expect(base).toEqual(["c"]);
    });
  });
});
