// @vitest-environment node

import { describe, expect, it } from "vitest";

import { cropFrame } from "./crop.ts";

describe("cropFrame", () => {
  it("is null when nothing is cut", () => {
    expect(cropFrame(undefined)).toBeNull();
    expect(cropFrame(null)).toBeNull();
    expect(cropFrame({ left: 0, top: 0, right: 0, bottom: 0 })).toBeNull();
  });

  it("draws the whole picture twice as wide when half of it is cut off across", () => {
    expect(cropFrame({ left: 0.25, top: 0, right: 0.25, bottom: 0 })).toEqual({ left: "-50%", top: "0%", width: "200%", height: "100%" });
  });

  it("moves the picture up and left by what is cut from the top and left, as a share of what stays", () => {
    expect(cropFrame({ left: 0.2, top: 0.1, right: 0, bottom: 0.4 })).toEqual({ left: "-25%", top: "-20%", width: "125%", height: "200%" });
  });

  it("keeps a sliver when everything is cut, and ignores what is not a number", () => {
    expect(cropFrame({ left: 0.6, top: 0, right: 0.6, bottom: 0 })?.width).toBe("10000%");
    expect(cropFrame({ left: Number.NaN, top: 0.5, right: 0, bottom: 0 })).toEqual({ left: "0%", top: "-100%", width: "100%", height: "200%" });
  });

  it("pads the picture for a negative crop", () => {
    expect(cropFrame({ left: -0.25, top: 0, right: 0, bottom: 0 })).toEqual({ left: "20%", top: "0%", width: "80%", height: "100%" });
  });
});
