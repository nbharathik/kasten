import { describe, expect, it } from "vitest";

import { boxCss, boxOf } from "./box-style.ts";
import { cssText } from "./css.ts";
import { DEFAULT_INSETS } from "./metrics.ts";

describe("boxOf", () => {
  it("takes the text's own insets and valign first, then the box's, then the defaults", () => {
    expect(boxOf({}, {})).toEqual({ insets: DEFAULT_INSETS, valign: "top" });
    expect(boxOf({}, { insets: { left: 1, top: 2, right: 3, bottom: 4 }, valign: "middle" })).toEqual({ insets: { left: 1, top: 2, right: 3, bottom: 4 }, valign: "middle" });
    expect(boxOf({ insets: { left: 5, top: 6, right: 7, bottom: 8 }, valign: "bottom" }, { insets: { left: 1, top: 2, right: 3, bottom: 4 }, valign: "middle" })).toEqual({ insets: { left: 5, top: 6, right: 7, bottom: 8 }, valign: "bottom" });
    expect(boxOf({ insets: null, valign: null }, {})).toEqual({ insets: DEFAULT_INSETS, valign: "top" });
  });

  it("uses the default for an inset that is not a number", () => {
    expect(boxOf({ insets: { left: Number.NaN, top: 1, right: Number.POSITIVE_INFINITY, bottom: 2 } }, {}).insets).toEqual({ left: 9.6, top: 1, right: 9.6, bottom: 2 });
  });
});

describe("boxCss", () => {
  it("is one box, whether it is drawn or edited", () => {
    const css = boxCss({ width: 300, height: 120 });
    expect(css).toMatchObject({ position: "absolute", inset: "0px", width: "300px", height: "120px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "flex-start", padding: "4.8px 9.6px 4.8px 9.6px", overflow: "visible", whiteSpace: "pre-wrap", wordBreak: "break-word" });
    expect(cssText(css)).toContain("padding:4.8px 9.6px 4.8px 9.6px");
  });

  it("stacks from the middle or the bottom", () => {
    expect(boxCss({ width: 1, height: 1, valign: "middle" }).justifyContent).toBe("center");
    expect(boxCss({ width: 1, height: 1, valign: "bottom" }).justifyContent).toBe("flex-end");
    expect(boxCss({ width: 1, height: 1, valign: "bottom" }, { valign: "top" }).justifyContent).toBe("flex-start");
  });

  it("does not depend on the page around it for spacing, case or ligatures", () => {
    expect(boxCss({ width: 1, height: 1 })).toMatchObject({ letterSpacing: "normal", wordSpacing: "normal", textTransform: "none", textIndent: "0px", textShadow: "none", fontVariantLigatures: "none" });
  });
});
