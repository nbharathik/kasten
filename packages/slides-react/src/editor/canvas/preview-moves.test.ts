// @vitest-environment node
import type { Element, Slide, Theme } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { splitMoves } from "./preview-moves.ts";

const theme = { layouts: [] } as unknown as Theme;
const shape = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Element> = {}): Element => ({ type: "shape", id, shape: "rect", x, y, w, h, ...extra }) as Element;
const slide = { id: "s-1", layout: "blank", elements: [shape("a", 10, 20, 100, 50), shape("b", 0, 0, 40, 40, { rotation: 30 } as Partial<Element>)] } as unknown as Slide;

describe("which overrides are plain moves", () => {
  it("counts a change of position alone as a move, by how far", () => {
    const { moves, rest } = splitMoves(slide, theme, new Map([["a", { x: 15, y: 10, w: 100, h: 50 }]]));
    expect([...moves]).toEqual([["a", { dx: 5, dy: -10 }]]);
    expect(rest.size).toBe(0);
  });

  it("does not count a resize or a turn", () => {
    const { moves, rest } = splitMoves(slide, theme, new Map([
      ["a", { x: 10, y: 20, w: 120, h: 50 }],
      ["b", { x: 0, y: 0, w: 40, h: 40, rotation: 45 }],
    ]));
    expect(moves.size).toBe(0);
    expect([...rest.keys()]).toEqual(["a", "b"]);
  });

  it("moves a turned element that stays turned the same way, and keeps its flips", () => {
    const moved = splitMoves(slide, theme, new Map([["b", { x: 5, y: 5, w: 40, h: 40, rotation: 30 }]]));
    expect(moved.moves.get("b")).toEqual({ dx: 5, dy: 5 });
    const flipped = splitMoves(slide, theme, new Map([["a", { x: 10, y: 20, w: 100, h: 50, flipH: true }]]));
    expect(flipped.moves.size).toBe(0);
  });

  it("leaves an id that is not on the slide to the general path", () => {
    expect(splitMoves(slide, theme, new Map([["nope", { x: 0, y: 0, w: 1, h: 1 }]])).rest.size).toBe(1);
  });
});
