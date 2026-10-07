// @vitest-environment node
// The same cases as the tests of `resolve::box_in` in slides-core.

import type { Element, Theme } from "@kasten-slides/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import { newDeck } from "../test/engine.ts";
import { boxOf, layoutOf, placeholderOf } from "./box.ts";

let light: Theme;

beforeAll(async () => {
  light = (await newDeck("Light deck", "Light")).deck.theme;
});

const text = (fields: Partial<Element>): Element => ({ type: "text", id: "e-1", text: { paragraphs: [] }, ...fields }) as Element;

describe("boxOf", () => {
  it("keeps the box an element names itself", () => {
    const element = text({ x: 10, y: 20, w: 30, h: 40 });
    expect(boxOf(light, "blank", element)).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });

  it("takes the box of a placeholder from the layout, and a side the element names wins", () => {
    const slot = layoutOf(light, "title-only")?.placeholders.find((p) => p.role === "title");
    expect(slot).toBeDefined();
    const element = text({ placeholder: "title" });
    expect(boxOf(light, "title-only", element)).toEqual({ x: slot!.x, y: slot!.y, w: slot!.w, h: slot!.h });
    expect(boxOf(light, "title-only", text({ placeholder: "title", h: 99 }))?.h).toBe(99);
    expect(boxOf(light, "title-only", text({ placeholder: "title", x: 0 }))?.x).toBe(0);
  });

  it("has no box for an element with neither", () => {
    expect(boxOf(light, "blank", text({}))).toBeNull();
  });

  it("has no box when the layout or the slot is not there", () => {
    expect(boxOf(light, "no-such-layout", text({ placeholder: "title" }))).toBeNull();
    expect(boxOf(light, "title-only", text({ placeholder: "body" }))).toBeNull();
    expect(boxOf(light, "blank", text({ placeholder: "title" }))).toBeNull();
  });

  it("treats a null side like a missing one, and a zero as a value", () => {
    expect(boxOf(light, "title-only", text({ placeholder: "title", w: null }))?.w).toBeGreaterThan(0);
    expect(boxOf(light, "blank", text({ x: 0, y: 0, w: 0, h: 0 }))).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(boxOf(light, "blank", text({ x: 0, y: 0, w: 5, h: null }))).toBeNull();
  });

  it("takes each side from the layout the slide uses", () => {
    const element = text({ placeholder: "body" });
    const one = boxOf(light, "title-body", element);
    const two = boxOf(light, "two-columns", element);
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();
    expect(two!.w).toBeLessThan(one!.w);
  });
});

describe("placeholderOf", () => {
  it("finds the slot an element fills", () => {
    expect(placeholderOf(light, "title-body", { placeholder: "body" })?.prompt).toBe("Click to add text");
    expect(placeholderOf(light, "title-body", { placeholder: "nope" })).toBeUndefined();
    expect(placeholderOf(light, "title-body", { placeholder: null })).toBeUndefined();
    expect(placeholderOf(light, "title-body", {})).toBeUndefined();
  });
});
