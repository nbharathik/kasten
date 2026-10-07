import { describe, expect, it } from "vitest";

import { cssText, ptToPx, px } from "./css.ts";

describe("px", () => {
  it("rounds to three decimals", () => {
    expect(px(22 * 4 / 3)).toBe("29.333px");
    expect(px(16)).toBe("16px");
    expect(px(0)).toBe("0px");
    expect(px(-0)).toBe("0px");
    expect(px(-24)).toBe("-24px");
    expect(px(1 / 3)).toBe("0.333px");
    expect(px(9.6)).toBe("9.6px");
  });

  it("turns points into pixels", () => {
    expect(ptToPx(18)).toBe(24);
    expect(ptToPx(6)).toBe(8);
  });
});

describe("cssText", () => {
  it("writes property names in kebab case", () => {
    expect(cssText({ fontSize: "12px", textAlign: "center", backgroundColor: "#fff" })).toBe("font-size:12px;text-align:center;background-color:#fff");
  });

  it("writes numbers as pixels, except where a property takes a plain number", () => {
    expect(cssText({ marginTop: 8, lineHeight: 1.15, fontWeight: 700, opacity: 0.5, paddingLeft: 24 })).toBe("margin-top:8px;line-height:1.15;font-weight:700;opacity:0.5;padding-left:24px");
  });

  it("writes custom properties as they are", () => {
    expect(cssText({ "--ks-indent": "24px", "--ks-n": 3 })).toBe("--ks-indent:24px;--ks-n:3");
  });

  it("writes vendor prefixes", () => {
    expect(cssText({ WebkitUserSelect: "none" })).toBe("-webkit-user-select:none");
  });

  it("leaves out empty values", () => {
    expect(cssText({ color: undefined, width: "", height: "3px" })).toBe("height:3px");
    expect(cssText({})).toBe("");
  });

  it("drops a value that would end its declaration early, but not one in quotes", () => {
    expect(cssText({ color: "red; background: url(http://x)", width: "1px" })).toBe("width:1px");
    expect(cssText({ color: "red}" })).toBe("");
    expect(cssText({ fontFamily: '"A;B", serif' })).toBe('font-family:"A;B", serif');
    expect(cssText({ fontFamily: '"unclosed' })).toBe("");
  });
});
