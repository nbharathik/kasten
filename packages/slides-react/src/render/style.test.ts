// @vitest-environment node

import type { Theme } from "@kasten-slides/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import { newDeck } from "../test/engine.ts";
import { dashArray, paintOf, paintsBox, shadowFilter, strokeWidthOf } from "./style.ts";

let theme: Theme;

beforeAll(async () => {
  theme = (await newDeck()).deck.theme;
});

describe("dashArray", () => {
  it("scales PowerPoint's dash patterns by the line's width", () => {
    expect(dashArray("dash", 2)).toBe("8 6");
    expect(dashArray("dot", 2)).toBe("2 6");
    expect(dashArray("dashDot", 2)).toBe("8 6 2 6");
    expect(dashArray("longDash", 3)).toBe("24 9");
  });

  it("is nothing for a solid line, or none", () => {
    expect(dashArray("solid", 2)).toBeUndefined();
    expect(dashArray(undefined, 2)).toBeUndefined();
    expect(dashArray(null, 2)).toBeUndefined();
    expect(dashArray("wavy" as never, 2)).toBeUndefined();
  });

  it("keeps the dashes of a hairline long enough to see", () => {
    expect(dashArray("dash", 0)).toBe("2 1.5");
    expect(dashArray("dash", 0.1)).toBe("2 1.5");
  });
});

describe("paintOf", () => {
  it("paints nothing without a style", () => {
    expect(paintOf(theme, undefined)).toEqual({ fill: "none", stroke: "none", strokeWidth: 0, strokeDasharray: undefined });
    expect(paintOf(theme, {})).toEqual({ fill: "none", stroke: "none", strokeWidth: 0, strokeDasharray: undefined });
  });

  it("fills and outlines in the theme's colours", () => {
    const paint = paintOf(theme, { fill: { color: "accent1", alpha: 0.5 }, stroke: { color: "text1", width: 3, dash: "dash", alpha: 0.8 } });
    expect(paint).toEqual({ fill: "rgba(26, 115, 232, 0.5)", stroke: "rgba(32, 33, 36, 0.8)", strokeWidth: 3, strokeDasharray: "12 9" });
  });

  it("outlines with a unit of width when the deck names none", () => {
    expect(paintOf(theme, { stroke: { color: "#ff0000" } })).toMatchObject({ stroke: "#ff0000", strokeWidth: 1 });
  });

  it("draws no outline of no width", () => {
    expect(paintOf(theme, { stroke: { color: "#ff0000", width: 0 } })).toMatchObject({ stroke: "none", strokeWidth: 0 });
    expect(strokeWidthOf({ color: "text1", width: -2 })).toBe(0);
  });
});

describe("shadowFilter", () => {
  it("is a CSS drop shadow in the theme's colour", () => {
    expect(shadowFilter(theme, { color: "text1", blur: 8, dx: 2, dy: 4, alpha: 0.4 })).toBe("drop-shadow(2px 4px 8px rgba(32, 33, 36, 0.4))");
    expect(shadowFilter(theme, { color: "#000000", blur: -3, dx: 0, dy: 0 })).toBe("drop-shadow(0px 0px 0px #000000)");
  });

  it("is nothing without a shadow", () => {
    expect(shadowFilter(theme, undefined)).toBeUndefined();
    expect(shadowFilter(theme, null)).toBeUndefined();
  });
});

describe("paintsBox", () => {
  it("is true for a fill, a visible outline or a shadow", () => {
    expect(paintsBox({ fill: { color: "bg2" } })).toBe(true);
    expect(paintsBox({ stroke: { color: "text1" } })).toBe(true);
    expect(paintsBox({ shadow: { color: "text1", blur: 1, dx: 1, dy: 1 } })).toBe(true);
  });

  it("is false for nothing, an empty style, or an outline of no width", () => {
    expect(paintsBox(undefined)).toBe(false);
    expect(paintsBox({})).toBe(false);
    expect(paintsBox({ radius: 8, opacity: 0.5 })).toBe(false);
    expect(paintsBox({ stroke: { color: "text1", width: 0 } })).toBe(false);
  });
});
