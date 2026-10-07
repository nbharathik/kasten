// @vitest-environment node

import type { Theme } from "@kasten-slides/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import { newDeck } from "../test/engine.ts";
import { COLOR_TOKENS, colorOf, hexOf, isColorToken } from "./color.ts";

let light: Theme;
let dark: Theme;

beforeAll(async () => {
  light = (await newDeck("Light deck", "Light")).deck.theme;
  dark = (await newDeck("Dark deck", "Dark")).deck.theme;
});

describe("colorOf", () => {
  it("looks a token up in the theme's colours", () => {
    expect(colorOf(light, "accent1")).toBe("#1a73e8");
    expect(colorOf(light, "bg1")).toBe("#ffffff");
    expect(colorOf(dark, "bg1")).toBe("#0f1115");
  });

  it("knows all ten tokens of the theme", () => {
    for (const token of COLOR_TOKENS) {
      expect(colorOf(light, token)).toBe(light.colors[token]);
    }
  });

  it("keeps a hex value, in the six-digit lower-case form", () => {
    expect(colorOf(light, "#12ab34")).toBe("#12ab34");
    expect(colorOf(light, "#12AB34")).toBe("#12ab34");
    expect(colorOf(light, "#fa0")).toBe("#ffaa00");
  });

  it("writes rgba(...) when it is see-through", () => {
    expect(colorOf(light, "accent1", 0.5)).toBe("rgba(26, 115, 232, 0.5)");
    expect(colorOf(light, "#000000", 0.3)).toBe("rgba(0, 0, 0, 0.3)");
    expect(colorOf(light, "#fff", 0)).toBe("rgba(255, 255, 255, 0)");
  });

  it("writes plain hex when the alpha is 1, absent or not a number", () => {
    expect(colorOf(light, "accent2", 1)).toBe("#ea4335");
    expect(colorOf(light, "accent2", undefined)).toBe("#ea4335");
    expect(colorOf(light, "accent2", null)).toBe("#ea4335");
    expect(colorOf(light, "accent2", Number.NaN)).toBe("#ea4335");
  });

  it("keeps the alpha between 0 and 1 and rounds it to three places", () => {
    expect(colorOf(light, "#ffffff", 7)).toBe("#ffffff");
    expect(colorOf(light, "#ffffff", -3)).toBe("rgba(255, 255, 255, 0)");
    expect(colorOf(light, "#ffffff", 0.123456)).toBe("rgba(255, 255, 255, 0.123)");
  });

  it("draws a value that is neither token nor hex in the text colour", () => {
    expect(colorOf(light, "red")).toBe("#202124");
    expect(colorOf(light, "accent7")).toBe("#202124");
    expect(colorOf(light, "constructor")).toBe("#202124");
    expect(colorOf(light, "#12345")).toBe("#202124");
    expect(colorOf(light, "red;background:url(x)", 0.5)).toBe("rgba(32, 33, 36, 0.5)");
  });
});

describe("hexOf and isColorToken", () => {
  it("says what a value stands for", () => {
    expect(hexOf(light, "text2")).toBe("#5f6368");
    expect(hexOf(light, "#ABC")).toBe("#aabbcc");
    expect(hexOf(light, "chartreuse")).toBeNull();
    expect(isColorToken("accent6")).toBe(true);
    expect(isColorToken("accent7")).toBe(false);
    expect(isColorToken("#ffffff")).toBe(false);
  });
});
