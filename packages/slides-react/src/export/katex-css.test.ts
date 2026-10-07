import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderMath } from "../render/math.ts";
import { classesOf, familiesUsed, fontUrl, katexStyles, readKatexSheet } from "./katex-css.ts";

/** KaTeX's own stylesheet, as the bundler hands it to the page. */
const CSS = readFileSync(join(import.meta.dirname, "../../node_modules/katex/dist/katex.min.css"), "utf8");

const htmlOf = (latex: string): string => {
  const rendered = renderMath(latex, false, "html");
  if (!rendered.ok) throw new Error(rendered.message);
  return rendered.html;
};

/**
 * The `@font-face` rules as a browser gives them. jsdom's stylesheets leave out
 * the `src` of a font, which every browser keeps, so the test hands over rules
 * that have it, made from the same text.
 */
function browserFaces(): CSSStyleSheet {
  const rules = [...CSS.matchAll(/@font-face\{([^}]*)\}/g)].map((match) => {
    const declarations = new Map([...(match[1] ?? "").matchAll(/([\w-]+):((?:[^;]|;(?=base64))*)/g)].map((d) => [d[1] as string, (d[2] as string).replace(/^["']|["']$/g, "")]));
    return { type: 5, cssText: `@font-face { ${match[1]} }`, style: { getPropertyValue: (name: string) => declarations.get(name) ?? "" } };
  });
  return { cssRules: rules } as unknown as CSSStyleSheet;
}

const sheets = (): CSSStyleSheet[] => [...Array.from(document.styleSheets), browserFaces()];

let style: HTMLStyleElement | null = null;
beforeEach(() => {
  style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
});
afterEach(() => style?.remove());

describe("the source of a font", () => {
  it("is the woff2 file when there is one", () => {
    expect(fontUrl('url("a/K.woff") format("woff"), url("a/K.woff2") format("woff2"), url(a/K.ttf) format("truetype")')).toBe("a/K.woff2");
  });

  it("is the first file when none is woff2, and nothing when there is none", () => {
    expect(fontUrl("url(a/K.woff) format('woff'), url(a/K.ttf) format('truetype')")).toBe("a/K.woff");
    expect(fontUrl("local(Arial)")).toBeNull();
  });
});

describe("KaTeX's stylesheet in the page", () => {
  it("is read: its rules, and its twenty fonts", () => {
    const sheet = readKatexSheet(sheets());
    expect(sheet?.faces).toHaveLength(20);
    expect(sheet?.faces.every((face) => face.family.startsWith("KaTeX_") && face.url.endsWith(".woff2"))).toBe(true);
    expect(sheet?.rules.length).toBeGreaterThan(100);
    expect(sheet?.rules.every((rule) => rule.includes(".katex"))).toBe(true);
  });

  it("is not there on a page that does not have it", () => {
    style?.remove();
    expect(readKatexSheet(sheets())).toBeNull();
  });

  it("is not read from a sheet the page may not open", () => {
    const closed = { get cssRules(): never { throw new DOMException("blocked", "SecurityError"); } } as unknown as CSSStyleSheet;
    expect(readKatexSheet([closed])).toBeNull();
    expect(readKatexSheet([closed, ...sheets()])?.faces).toHaveLength(20);
  });
});

describe("the fonts a formula needs", () => {
  const used = (latex: string) => familiesUsed(htmlOf(latex), readKatexSheet(sheets())!);

  it("are the main font and the maths italic for a plain formula, and no others", () => {
    expect([...used("E = mc^2")].sort()).toEqual(["KaTeX_Main", "KaTeX_Math"]);
  });

  it("include the alphabet a command asks for", () => {
    expect(used("\\mathcal{L}").has("KaTeX_Caligraphic")).toBe(true);
    expect(used("\\mathbb{R}").has("KaTeX_AMS")).toBe(true);
    expect(used("\\mathfrak{g}").has("KaTeX_Fraktur")).toBe(true);
    expect(used("\\mathsf{A}").has("KaTeX_SansSerif")).toBe(true);
    expect(used("\\mathtt{code}").has("KaTeX_Typewriter")).toBe(true);
  });

  it("include the sizes of brackets and big operators that a tall formula grows", () => {
    expect(used("\\bigl( x \\bigr)").has("KaTeX_Size1")).toBe(true);
    expect(used("\\left(\\frac{a}{b}\\right)").has("KaTeX_Size2")).toBe(true);
    expect(used("\\left(\\frac{\\frac{a}{b}}{\\frac{c}{d}}\\right)").has("KaTeX_Size3")).toBe(true);
    expect(used("\\sum_{i=1}^{n} i").has("KaTeX_Size2")).toBe(true);
    expect([...used("x")].some((family) => family.startsWith("KaTeX_Size"))).toBe(false);
  });

  it("are read from the classes in the markup", () => {
    expect(classesOf('<span class="katex"><span class="mord mathnormal">x</span></span>')).toEqual(new Set(["katex", "mord", "mathnormal"]));
  });
});

describe("the stylesheet for a picture of a formula", () => {
  const reader = async (url: string) => `data:font/woff2;base64,${btoa(url.split("/").pop() ?? "")}`;

  it("has KaTeX's rules and, inline, the fonts the formula uses", async () => {
    const css = await katexStyles(htmlOf("E = mc^2"), { sheets: sheets(), reader });
    expect(css).toContain(".katex");
    expect(css).toMatch(/@font-face\{font-family:"KaTeX_Main";[^}]*src:url\("data:font\/woff2;base64,/);
    expect(css).toContain('font-family:"KaTeX_Math"');
    // Not the ones it does not: they would only make the picture heavier.
    expect(css).not.toContain('font-family:"KaTeX_Fraktur"');
    expect(css).not.toContain("http");
  });

  it("keeps the weight and style of each face, so the browser picks the right one", async () => {
    const css = (await katexStyles(htmlOf("E = mc^2"), { sheets: sheets(), reader })) ?? "";
    expect(css).toMatch(/font-family:"KaTeX_Main";font-weight:(?:400|normal);font-style:normal/);
    expect(css).toMatch(/font-family:"KaTeX_Main";font-weight:(?:700|bold);font-style:normal/);
    expect(css).toMatch(/font-family:"KaTeX_Math";font-weight:(?:400|normal);font-style:italic/);
  });

  it("asks for each font once however many formulas there are", async () => {
    const asked: string[] = [];
    const counting = async (url: string) => {
      asked.push(url);
      return "data:font/woff2;base64,AA==";
    };
    await katexStyles(htmlOf("x"), { sheets: sheets(), reader: counting });
    expect(new Set(asked).size).toBe(asked.length);
  });

  it("is null when the page has no KaTeX stylesheet", async () => {
    style?.remove();
    expect(await katexStyles(htmlOf("x"), { sheets: sheets(), reader })).toBeNull();
  });

  it("is null when the main font cannot be read, since the picture would be set in whatever the browser has", async () => {
    expect(await katexStyles(htmlOf("x"), { sheets: sheets(), reader: async () => null })).toBeNull();
    expect(await katexStyles(htmlOf("x"), { sheets: sheets(), reader: async (url) => (url.includes("Main-Regular") ? null : "data:font/woff2;base64,AA==") })).toBeNull();
  });

  it("does without a font that is not the main one, when it cannot be read", async () => {
    const css = await katexStyles(htmlOf("E = mc^2"), { sheets: sheets(), reader: async (url) => (url.includes("Math-Italic") ? null : "data:font/woff2;base64,AA==") });
    expect(css).toContain('font-family:"KaTeX_Main"');
    // The face that could not be read is not in the CSS; the ones beside it are.
    expect(css).not.toMatch(/font-family:"KaTeX_Math";font-weight:400;font-style:italic/);
    expect(css).toMatch(/font-family:"KaTeX_Math";font-weight:700;font-style:italic/);
  });
});
