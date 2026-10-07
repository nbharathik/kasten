import { describe, expect, it } from "vitest";

import { fontFamiliesIn, readSlideSheet, slideStyles } from "./slide-css.ts";

const STYLE = 1;
const FONT_FACE = 5;

interface FakeFace {
  family: string;
  weight?: string;
  style?: string;
  range?: string;
  src: string;
}

const face = (f: FakeFace) => ({
  type: FONT_FACE,
  cssText: `@font-face { font-family: ${f.family}; src: ${f.src}; }`,
  style: {
    getPropertyValue: (name: string) =>
      ({ "font-family": f.family, "font-weight": f.weight ?? "", "font-style": f.style ?? "", "unicode-range": f.range ?? "", src: f.src })[name] ?? "",
  },
});
const rule = (selectorText: string, body = "color: red") => ({ type: STYLE, selectorText, cssText: `${selectorText} { ${body}; }`, style: { getPropertyValue: () => "" } });
const sheet = (...rules: unknown[]): CSSStyleSheet => ({ cssRules: rules }) as unknown as CSSStyleSheet;

const INTER = face({ family: "Inter", weight: "400", range: "U+0000-00FF", src: 'url("/fonts/inter-latin-400.woff2") format("woff2"), url("/fonts/inter-latin-400.woff") format("woff")' });
const INTER_EXT = face({ family: "Inter", weight: "400", range: "U+0100-02AF", src: 'url("/fonts/inter-ext-400.woff2") format("woff2")' });
const INTER_BOLD_ITALIC = face({ family: "Inter", weight: "700", style: "italic", src: 'url("/fonts/inter-700-italic.woff2") format("woff2")' });
const LATO = face({ family: "Lato", weight: "400", src: 'url("/fonts/lato-400.woff2") format("woff2")' });

const reader = async (url: string): Promise<string | null> => (url.includes("missing") ? null : `data:font/woff2;base64,${btoa(url)}`);

describe("the slide's stylesheet in the page", () => {
  it("keeps the rules of the slide and of its text, and none of the editor's", () => {
    const read = readSlideSheet([
      sheet(rule(".ks-slide .ks-el"), rule(".ks-text .ks-p"), rule(".ks-editor .ks-stage"), rule(".ks-fs-list"), rule(".ks-slide[data-mode=\"edit\"] [data-master] *")),
    ]);
    expect(read.rules.map((r) => r.split(" {")[0])).toEqual([".ks-slide .ks-el", ".ks-text .ks-p", '.ks-slide[data-mode="edit"] [data-master] *']);
  });

  it("looks inside media rules, and skips a sheet the page may not open", () => {
    const media = { type: 4, cssRules: [rule(".ks-slide .ks-fill"), face({ family: "Lato", src: 'url("/x.woff2") format("woff2")' })] };
    const closed = {
      get cssRules(): never {
        throw new DOMException("blocked", "SecurityError");
      },
    } as unknown as CSSStyleSheet;
    const read = readSlideSheet([closed, sheet(media)]);
    expect(read.rules).toHaveLength(1);
    expect(read.faces.map((f) => f.family)).toEqual(["Lato"]);
  });

  it("reads each face's family, weight, style, range and file, taking the woff2", () => {
    const [f] = readSlideSheet([sheet(INTER)]).faces;
    expect(f).toEqual({ family: "Inter", weight: "400", style: "normal", range: "U+0000-00FF", url: "/fonts/inter-latin-400.woff2" });
  });

  it("leaves out a face that names no file (a local font)", () => {
    expect(readSlideSheet([sheet(face({ family: "Local", src: 'local("Arial")' }))]).faces).toEqual([]);
  });
});

describe("the fonts a slide's markup names", () => {
  it("are the families in its font-family declarations, without quotes", () => {
    const html = `<div style="font-family:Inter, &quot;Helvetica Neue&quot;, sans-serif"><p style="color:red;font-family:'Roboto Mono', monospace">x</p><span style="font-family:Inter">y</span></div>`;
    expect(fontFamiliesIn(html)).toEqual(new Set(["Inter", "Helvetica Neue", "sans-serif", "Roboto Mono", "monospace"]));
  });

  it("are none in markup that names none", () => {
    expect(fontFamiliesIn('<div style="color:red">x</div>')).toEqual(new Set());
  });
});

describe("the style of a slide's picture", () => {
  const sheets = [sheet(rule(".ks-slide .ks-el", "position: absolute"), INTER, INTER_EXT, INTER_BOLD_ITALIC, LATO)];

  it("has the slide's rules, and the fonts the markup uses, as data", async () => {
    const { css, missing } = await slideStyles('<div style="font-family:Inter, sans-serif">x</div>', { sheets, reader });
    expect(css).toContain(".ks-slide .ks-el { position: absolute; }");
    expect(css.match(/@font-face/g)).toHaveLength(3);
    expect(css).toContain('font-family:"Inter"');
    expect(css).toContain("unicode-range:U+0100-02AF");
    expect(css).toContain("font-style:italic");
    expect(css).toContain(`url("data:font/woff2;base64,${btoa("/fonts/inter-latin-400.woff2")}")`);
    expect(css).not.toContain("Lato");
    expect(missing).toEqual([]);
  });

  it("does not carry a font the markup does not use", async () => {
    const { css } = await slideStyles('<div style="font-family:Lato">x</div>', { sheets, reader });
    expect(css.match(/@font-face/g)).toHaveLength(1);
    expect(css).not.toContain("Inter");
  });

  it("names a family it has no font for, and one whose file cannot be read", async () => {
    const broken = [sheet(face({ family: "Broken", src: 'url("/missing.woff2") format("woff2")' }), LATO)];
    const { css, missing } = await slideStyles('<p style="font-family:Broken, Lato, Georgia">x</p>', { sheets: broken, reader });
    expect(css.match(/@font-face/g)).toHaveLength(1);
    // A stack's first family is the one wanted: Lato is embedded but is only a fallback here, and Georgia is a later fallback.
    expect(missing).toEqual(["Broken"]);
  });
});
