// @vitest-environment node

import type { Element } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { isUndrawn, stateOf } from "./visibility.ts";

const text = (t: string, placeholder?: string): Element => ({ type: "text", id: "e", ...(placeholder ? { placeholder } : {}), text: { paragraphs: [{ runs: [{ t }] }] } }) as Element;
const image = (src: string): Element => ({ type: "image", id: "e", src }) as Element;

describe("stateOf", () => {
  const hidden = { type: "shape", id: "e", shape: "rect", stepStates: { 1: "hidden" } } as Element;

  it("ignores steps when there is no step", () => {
    expect(stateOf(hidden, undefined, false)).toBe("normal");
  });

  it("reads the element's state at the step", () => {
    expect(stateOf(hidden, 0, false)).toBe("normal");
    expect(stateOf(hidden, 1, false)).toBe("hidden");
  });

  it("is hidden when the group that holds it is, whatever it says itself", () => {
    expect(stateOf(hidden, 0, true)).toBe("hidden");
    expect(stateOf(hidden, undefined, true)).toBe("hidden");
  });
});

describe("isUndrawn", () => {
  it("is true for an empty placeholder, unless an editor is drawing", () => {
    expect(isUndrawn(text("", "title"), "present", false)).toBe(true);
    expect(isUndrawn(text("  ", "title"), "export", false)).toBe(true);
    expect(isUndrawn(text("", "title"), "thumbnail", false)).toBe(true);
    expect(isUndrawn(text("", "title"), "edit", false)).toBe(false);
  });

  it("is false for a placeholder with words, and for an empty box that fills no placeholder", () => {
    expect(isUndrawn(text("Hi", "title"), "present", false)).toBe(false);
    expect(isUndrawn(text("", undefined), "present", false)).toBe(false);
  });

  it("holds for a shape that fills a placeholder too", () => {
    const shape = { type: "shape", id: "e", shape: "rect", placeholder: "body" } as Element;
    expect(isUndrawn(shape, "present", false)).toBe(true);
    expect(isUndrawn(shape, "edit", false)).toBe(false);
  });

  it("is true for a picture with no file, unless an editor is drawing the slide's own", () => {
    expect(isUndrawn(image(""), "present", false)).toBe(true);
    expect(isUndrawn(image(" "), "present", false)).toBe(true);
    expect(isUndrawn(image(""), "edit", false)).toBe(false);
    expect(isUndrawn(image("a.png"), "present", false)).toBe(false);
  });

  it("is true for the theme's picture with no file in every mode", () => {
    expect(isUndrawn(image(""), "edit", true)).toBe(true);
    expect(isUndrawn(image(""), "present", true)).toBe(true);
  });

  it("is false for everything else", () => {
    expect(isUndrawn({ type: "line", id: "e" } as Element, "present", false)).toBe(false);
    expect(isUndrawn({ type: "group", id: "e", children: [] } as Element, "present", false)).toBe(false);
  });
});
