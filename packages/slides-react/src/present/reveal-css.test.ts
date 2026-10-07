import { describe, expect, it } from "vitest";

import { REVEAL_CSS, installRevealCss, withoutPrintRules } from "./reveal-css.ts";

describe("reveal.js's stylesheet", () => {
  it("drops every print block, whole, and keeps what is around it", () => {
    const css = ".a{color:red}@media print{.b{color:blue}@page{size:1px}.c{x:y}}.d{color:green}@media print{.e{z:1}}.f{g:h}";
    expect(withoutPrintRules(css)).toBe(".a{color:red}.d{color:green}.f{g:h}");
  });

  it("is left alone when it has none", () => {
    expect(withoutPrintRules(".a{b:c}@media screen{.d{e:f}}")).toBe(".a{b:c}@media screen{.d{e:f}}");
  });

  it("has the rules of the deck and none that reflow a printed page", () => {
    expect(REVEAL_CSS).toContain(".reveal .slides");
    expect(REVEAL_CSS).toContain(".reveal-viewport");
    expect(REVEAL_CSS).not.toContain("@media print");
    expect(REVEAL_CSS).not.toContain("print-pdf) .reveal p");
  });

  it("is in the page while a presentation is open, once however many there are, and gone after", () => {
    const first = installRevealCss();
    const second = installRevealCss();
    expect(document.head.querySelectorAll("style[data-ks-show-reveal]")).toHaveLength(1);
    first();
    first();
    expect(document.head.querySelectorAll("style[data-ks-show-reveal]")).toHaveLength(1);
    second();
    expect(document.head.querySelectorAll("style[data-ks-show-reveal]")).toHaveLength(0);
  });
});
