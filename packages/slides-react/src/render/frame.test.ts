// @vitest-environment node

import type { Theme } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { frameStyle, GHOST_OPACITY, opacityOf, transformOf } from "./frame.ts";
import { plainTheme } from "./testing/decks.ts";

const theme: Theme = plainTheme();

describe("transformOf", () => {
  it("is nothing for an element that is upright and unmirrored", () => {
    expect(transformOf(undefined, undefined, undefined)).toBeUndefined();
    expect(transformOf(null, false, false)).toBeUndefined();
    expect(transformOf(0, false, false)).toBeUndefined();
    expect(transformOf(Number.NaN, false, false)).toBeUndefined();
  });

  it("turns by degrees clockwise and mirrors, the mirror first", () => {
    expect(transformOf(90, false, false)).toBe("rotate(90deg) scale(1, 1)");
    expect(transformOf(12.345, true, false)).toBe("rotate(12.35deg) scale(-1, 1)");
    expect(transformOf(null, false, true)).toBe("rotate(0deg) scale(1, -1)");
    expect(transformOf(-30, true, true)).toBe("rotate(-30deg) scale(-1, -1)");
  });
});

describe("opacityOf", () => {
  it("is the style's opacity, and solid without one", () => {
    expect(opacityOf({}, "normal", theme)).toBe(1);
    expect(opacityOf({ style: { opacity: 0.4 } }, "normal", theme)).toBe(0.4);
    expect(opacityOf({ style: { opacity: 7 } }, "highlighted", theme)).toBe(1);
    expect(opacityOf({ style: { opacity: -1 } }, "normal", theme)).toBe(0);
  });

  it("is the theme's dimmed opacity, times the style's, when dimmed", () => {
    expect(opacityOf({}, "dimmed", theme)).toBe(0.25);
    expect(opacityOf({ style: { opacity: 0.5 } }, "dimmed", theme)).toBe(0.125);
    expect(opacityOf({}, "dimmed", { ...theme, dimmedOpacity: 3 })).toBe(1);
  });

  it("is a ghost's opacity for what a step hides", () => {
    expect(opacityOf({ style: { opacity: 0.5 } }, "hidden", theme)).toBe(GHOST_OPACITY);
  });
});

describe("frameStyle", () => {
  it("has the box, and adds the turn and the opacity only when they matter", () => {
    expect(frameStyle({ x: 1, y: 2, w: 3, h: 4 }, {}, 1)).toEqual({ position: "absolute", left: 1, top: 2, width: 3, height: 4 });
    expect(frameStyle({ x: 1, y: 2, w: 3, h: 4 }, { rotation: 10 }, 0.5)).toEqual({
      position: "absolute",
      left: 1,
      top: 2,
      width: 3,
      height: 4,
      transform: "rotate(10deg) scale(1, 1)",
      transformOrigin: "center",
      opacity: 0.5,
    });
  });
});
