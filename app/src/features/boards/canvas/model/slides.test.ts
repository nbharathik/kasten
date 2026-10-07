import { describe, expect, it } from "vitest";

import type { BoardNode } from "../../../../lib/vault/types";
import { fitRect, slides, startAt } from "./slides";

const section = (id: string, x: number, y: number, width = 400, height = 300, collapsed = false): BoardNode => ({ id, kind: "group", label: id, x, y, width, height, ...(collapsed ? { collapsed } : {}) });
const sticky = (id: string, x: number, y: number): BoardNode => ({ id, kind: "text", text: id, x, y, width: 100, height: 60 });
const ids = (nodes: readonly BoardNode[]) => nodes.map((n) => n.id);

describe("slides", () => {
  it("reads the sections in rows from the top, each row from the left", () => {
    // A grid drawn by hand: the tops are not quite level.
    const nodes = [section("d", 520, 430), section("b", 510, 12), section("c", 0, 400), section("a", 0, 0), sticky("s", 2000, 0)];
    expect(ids(slides(nodes))).toEqual(["a", "b", "c", "d"]);
  });

  it("puts a section's own sections after it, in the same order", () => {
    const nodes = [
      section("part 2", 0, 1000, 1000, 600),
      section("part 1", 0, 0, 1000, 600),
      section("1b", 520, 100),
      section("1a", 40, 100),
      section("2a", 40, 1100),
    ];
    expect(ids(slides(nodes))).toEqual(["part 1", "1a", "1b", "part 2", "2a"]);
  });

  it("leaves out sections a fold hides, and keeps the folded one", () => {
    const nodes = [section("outer", 0, 0, 1000, 600, true), section("inner", 40, 100), section("next", 1200, 0)];
    expect(ids(slides(nodes))).toEqual(["outer", "next"]);
  });

  it("has no slides without sections", () => {
    expect(slides([sticky("s", 0, 0)])).toEqual([]);
  });
});

describe("startAt", () => {
  const nodes = [section("one", 0, 0, 1000, 600), section("inner", 40, 100), section("two", 1200, 0), sticky("s", 60, 120), sticky("far", 5000, 5000)];
  const deck = slides(nodes);
  const node = (id: string) => nodes.find((n) => n.id === id)!;

  it("starts at the selected section", () => {
    expect(deck[startAt(deck, [node("two")])]!.id).toBe("two");
  });

  it("starts at the smallest section holding what is selected", () => {
    expect(deck[startAt(deck, [node("s")])]!.id).toBe("inner");
  });

  it("starts at the first slide otherwise", () => {
    expect(startAt(deck, [])).toBe(0);
    expect(startAt(deck, [node("far")])).toBe(0);
  });
});

describe("fitRect", () => {
  it("centres a slide and fills the screen but for a margin", () => {
    const view = fitRect({ x: 100, y: 100, width: 800, height: 400 }, 1000, 800, 0.05);
    // The width decides: 1000 / (800 × 1.1).
    expect(view.zoom).toBeCloseTo(1000 / 880);
    expect(view.x + (100 + 400) * view.zoom).toBeCloseTo(500);
    expect(view.y + (100 + 200) * view.zoom).toBeCloseTo(400);
  });

  it("does not blow a small slide up past the most zoom", () => {
    expect(fitRect({ x: 0, y: 0, width: 100, height: 44 }, 1600, 900, 0.05, 2).zoom).toBe(2);
  });

  it("copes with a screen of no size", () => {
    const view = fitRect({ x: 0, y: 0, width: 400, height: 300 }, 0, 0, 0.05);
    expect(Number.isFinite(view.zoom) && view.zoom > 0).toBe(true);
  });
});
