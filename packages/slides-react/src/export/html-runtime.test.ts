import { describe, expect, it } from "vitest";

import { inScript } from "./html-page.ts";
import { pageScript, revealSource, wrapModule, wrapReveal } from "./html-runtime.ts";

describe("a runtime file in the page", () => {
  it("is its own scope that gives an object of what it exports", () => {
    const wrapped = wrapModule("const HIDDEN = 2;\nexport const ONE = 1;\nexport function twice(n) { return n * HIDDEN; }\nexport async function later() {}\nexport class Box {}\n");
    const made = new Function(`return ${wrapped};`)() as Record<string, unknown>;
    expect(Object.keys(made).sort()).toEqual(["Box", "ONE", "later", "twice"]);
    expect((made.twice as (n: number) => number)(21)).toBe(42);
    expect(made.HIDDEN).toBeUndefined();
  });

  it("does not meet another file's names", () => {
    const a = wrapModule("function calm() { return 'a'; }\nexport const a = () => calm();");
    const b = wrapModule("function calm() { return 'b'; }\nexport const b = () => calm();");
    const both = new Function(`var x = ${a}; var y = ${b}; return [x.a(), y.b()];`)() as string[];
    expect(both).toEqual(["a", "b"]);
  });
});

describe("reveal.js in the page", () => {
  it("is an expression that gives what its last line exported", () => {
    const wrapped = wrapReveal("var q = { name: 'reveal' };\nvar z = 3;\nexport { q as default };\n");
    expect(new Function(`return ${wrapped};`)()).toEqual({ name: "reveal" });
  });

  it("is refused if it is not in the form this expects, rather than pasted as it is", () => {
    expect(() => wrapReveal("var q = 1;")).toThrow(/not in the form/);
  });

  it("is the real reveal.js, and the whole script is text a browser can read", async () => {
    const source = await revealSource();
    expect(source.length).toBeGreaterThan(50_000);
    const script = pageScript(source);
    // Read, not run: it needs a page. A syntax slip anywhere would show here.
    expect(() => new Function(script)).not.toThrow();
    expect(script).not.toMatch(/<\/script/i);
    expect(script.startsWith('"use strict";')).toBe(true);
    for (const name of ["revealConfig", "matchSlides", "animateMorph", "attachChrome", "playEnter", "newcomers"]) expect(script).toContain(name);
    expect(script).not.toMatch(/^export /m);
    expect(script).not.toMatch(/^import /m);
  });
});

describe("text in a script", () => {
  it("cannot end it", () => {
    expect(inScript("a</script>b</SCRIPT >c")).toBe("a<\\/script>b<\\/SCRIPT >c");
    expect(inScript("plain")).toBe("plain");
  });
});
