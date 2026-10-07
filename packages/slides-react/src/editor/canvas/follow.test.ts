// @vitest-environment node
import type { Element, Slide, Theme } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { withFollowing } from "./follow.ts";

const theme = { layouts: [] } as unknown as Theme;
const box = (id: string, x: number, y: number, w: number, h: number): Element => ({ type: "shape", id, shape: "rect", x, y, w, h }) as Element;
const connector = (id: string, from: string | null, to: string | null, rest: Partial<Element> = {}): Element =>
  ({ type: "connector", id, route: "straight", from: from ? { el: from, side: "right" } : null, to: to ? { el: to, side: "left" } : null, x: 0, y: 0, w: 0, h: 0, ...rest }) as Element;
const slideOf = (...elements: Element[]): Slide => ({ id: "s-1", layout: "blank", elements }) as unknown as Slide;
/** The boxes a drag has taken elements to. */
const at = (boxes: Record<string, [number, number, number, number]>): ReadonlyMap<string, { x: number; y: number; w: number; h: number }> =>
  new Map(Object.entries(boxes).map(([id, [x, y, w, h]]) => [id, { x, y, w, h }]));

describe("connectors following what is dragged", () => {
  const a = box("a", 0, 0, 100, 50);
  const b = box("b", 300, 100, 100, 50);
  const line = connector("c", "a", "b", { x: 100, y: 25, w: 200, h: 100 });

  it("puts a connector between the elements as they are drawn now", () => {
    const out = withFollowing(slideOf(a, b, line), theme, at({ a: [0, 200, 100, 50] }));
    const c = out.elements[2] as Extract<Element, { type: "connector" }>;
    // From the right middle of a (100, 225) to the left middle of b (300, 125): it runs up and to the right.
    expect([c.x, c.y, c.w, c.h, c.flipH, c.flipV]).toEqual([100, 125, 200, 100, false, true]);
  });

  it("flips when the end passes the start", () => {
    const out = withFollowing(slideOf(a, b, line), theme, at({ b: [-300, 100, 100, 50] }));
    const c = out.elements[2] as Extract<Element, { type: "connector" }>;
    expect(c.flipH).toBe(true);
    expect(c.w).toBe(400);
  });

  it("leaves everything that did not move, and the slide itself, as it was", () => {
    const slide = slideOf(a, b, line, box("z", 500, 0, 10, 10));
    expect(withFollowing(slide, theme, at({}))).toBe(slide);
    expect(withFollowing(slide, theme, at({ z: [500, 40, 10, 10] }))).toBe(slide);
    const out = withFollowing(slideOf(a, b, line), theme, at({ a: [0, 10, 100, 50] }));
    expect(out.elements[1]).toBe(b);
  });

  it("keeps a free end where it was", () => {
    const half = connector("h", "a", null, { x: 100, y: 25, w: 50, h: 0 });
    const out = withFollowing(slideOf(a, half), theme, at({ a: [0, 100, 100, 50] }));
    const c = out.elements[1] as Extract<Element, { type: "connector" }>;
    // Start moved to (100, 125); the free end stays at (150, 25).
    expect([c.x, c.y, c.w, c.h, c.flipV]).toEqual([100, 25, 50, 100, true]);
  });

  it("follows into groups", () => {
    const group = { type: "group", id: "g", children: [line] } as unknown as Element;
    const out = withFollowing(slideOf(a, b, group), theme, at({ a: [0, 200, 100, 50] }));
    const inner = (out.elements[2] as Extract<Element, { type: "group" }>).children[0] as Extract<Element, { type: "connector" }>;
    expect(inner.flipV).toBe(true);
  });
});
