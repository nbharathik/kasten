// TeX from a page is drawn within limits: no links or pictures, and no
// macro that expands without end.

import katex from "katex";
import { describe, expect, it } from "vitest";

import { KATEX } from "./math-view";

describe("math from a page", () => {
  it("draws no link or picture", () => {
    const html = katex.renderToString("\\href{javascript:alert(1)}{x} \\url{https://example.com} \\includegraphics{https://example.com/a.png}", {
      ...KATEX,
      throwOnError: false,
    });
    expect(html).not.toMatch(/<a |<img /);
  });

  it("stops a macro that expands without end, and a huge rule", () => {
    expect(() => katex.renderToString("\\def\\a{\\a\\a}\\a", { ...KATEX, throwOnError: true })).toThrow(/expansion/i);
    const html = katex.renderToString("\\rule{1000em}{1000em}", { ...KATEX, throwOnError: false });
    // The TeX itself stays readable in the page, but nothing is drawn that big.
    expect(html).not.toMatch(/(width|height|border[a-z-]*):\s*1000em/);
    expect(html).toMatch(/20em/);
  });
});
