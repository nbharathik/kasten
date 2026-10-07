import { describe, expect, it } from "vitest";

import { assemblePage, jsonForScript } from "./html-page.ts";

describe("the page as text", () => {
  const page = assemblePage({ title: 'A "talk" <on> tools & more', css: ".a{b:c}", slides: '<div class="reveal"></div>', data: { text: "</script><b>" }, script: "var a = 1;" });

  it("is a page with its title, styles, stage, data and script all inline", () => {
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain('<html lang="en">');
    expect(page).toContain("<title>A &quot;talk&quot; &lt;on&gt; tools &amp; more</title>");
    expect(page).toContain(".a{b:c}");
    expect(page).toContain('<div class="ks-show" role="application"');
    expect(page).toContain('<div class="reveal"></div>');
    expect(page).toContain('<div class="ks-show-chrome"></div>');
    expect(page).toContain('<script type="application/json" id="ks-data">');
    expect(page).toContain("<script>var a = 1;</script>");
    expect(page).toContain("<noscript>");
  });

  it("has nothing from outside", () => {
    expect(page).not.toMatch(/(?:src|href)=["']https?:/);
    expect(page).not.toMatch(/<link\b/);
    expect(page).not.toMatch(/@import/);
  });

  it("keeps data from ending its script", () => {
    const start = page.indexOf('id="ks-data">') + 'id="ks-data">'.length;
    const json = page.slice(start, page.indexOf("</script>", start));
    expect(JSON.parse(json)).toEqual({ text: "</script><b>" });
    expect(json).not.toContain("<");
  });

  it("writes json without the characters a script cannot hold", () => {
    expect(jsonForScript({ a: "<!--", b: "  " })).toBe('{"a":"\\u003c!--","b":"\\u2028\\u2029"}');
  });

  it("keeps styles from ending their element", () => {
    expect(assemblePage({ title: "t", css: "a{}</style><script>x</script>", slides: "", data: {}, script: "" })).not.toMatch(/<\/style><script>x/);
  });
});
