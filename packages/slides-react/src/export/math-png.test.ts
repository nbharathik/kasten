import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Element, Theme } from "@kasten-slides/wasm";
import { describe, expect, it, vi } from "vitest";

import { newDeck } from "../test/engine.ts";
import { MATH_PAGE_CSS, MATH_SCALE, mathPage, mathPictures, mathPicturesIn } from "./math-png.ts";
import { posterPaths } from "./posters.ts";

const math = (id: string, latex: string, extra: Partial<Element> = {}): Element => ({ type: "math", id, latex, x: 40, y: 40, w: 300, h: 100, ...extra }) as Element;

/** What the expansion of a formula is once the engine writes it as a picture: a group holding one image named for the formula. */
const expansion = (element: Element, name: string, w = 300, h = 100): Element =>
  ({ type: "group", id: element.id, children: [{ type: "image", id: `${element.id}.1`, src: name, x: 40, y: 40, w, h }] }) as unknown as Element;

async function deckWith(...elements: Element[]) {
  const engine = await newDeck("Formulas");
  const slide = engine.deck.slides[0]!.id;
  engine.apply("add_elements", { slide, elements });
  return engine.deck;
}

describe("the pictures an expansion names", () => {
  it("are its images whose path is math/<name>.png, with the size each is shown at", () => {
    const group = {
      type: "group",
      id: "g",
      children: [
        { type: "image", id: "a", src: "math/1f2e.png", x: 0, y: 0, w: 320, h: 90 },
        { type: "image", id: "b", src: "assets/photo.png", x: 0, y: 0, w: 50, h: 50 },
        { type: "group", id: "n", children: [{ type: "image", id: "c", src: "math/aa.png", x: 0, y: 0, w: 10, h: 20 }] },
        { type: "shape", id: "s", shape: "rect", x: 0, y: 0, w: 1, h: 1 },
      ],
    } as unknown as Element;
    expect(mathPicturesIn(group)).toEqual([
      { name: "math/1f2e.png", w: 320, h: 90 },
      { name: "math/aa.png", w: 10, h: 20 },
    ]);
  });

  it("are none for the stand-in a formula expands to before the engine draws it, or for nothing", async () => {
    const deck = await deckWith(math("m", "x^2"));
    const stand = (await import("@kasten-slides/wasm")).expandComposite(deck.theme, deck.slides[0]!.layout, deck.slides[0]!.elements.at(-1)!);
    // Whatever the engine makes of it, it names pictures only as math/<name>.png.
    for (const picture of mathPicturesIn(stand)) expect(picture.name).toMatch(/^math\/[^/]+\.png$/);
    expect(mathPicturesIn(null)).toEqual([]);
  });
});

describe("the page of a formula", () => {
  const theme = (async () => (await newDeck("Theme")).deck.theme)();

  it("holds KaTeX's markup in a box of the picture's size, at the formula's size in units and its colour", async () => {
    const t: Theme = await theme;
    const page = mathPage(math("m", "E = mc^2", { fontSize: 24, color: "accent1" }) as Extract<Element, { type: "math" }>, t, 320, 90);
    expect(page).toContain('class="ks-math"');
    expect(page).toContain("width:320px;height:90px");
    expect(page).toContain("font-size:32px");
    expect(page).toContain(`color:${t.colors.accent1}`);
    expect(page).toContain('class="katex-display"');
    // A picture needs no MathML.
    expect(page).not.toContain("<math");
  });

  it("is not a display formula when it is inline", async () => {
    const page = mathPage(math("m", "x", { inline: true }) as Extract<Element, { type: "math" }>, await theme, 100, 40);
    expect(page).not.toContain("katex-display");
  });

  it("is null for an empty formula and for LaTeX that KaTeX cannot read", async () => {
    const t = await theme;
    expect(mathPage(math("m", "  ") as Extract<Element, { type: "math" }>, t, 100, 40)).toBeNull();
    expect(mathPage(math("m", "\\frac{") as Extract<Element, { type: "math" }>, t, 100, 40)).toBeNull();
  });

  it("is laid out by the same rules as the slide draws a formula with", () => {
    const css = readFileSync(join(import.meta.dirname, "../render/elements/math.css"), "utf8");
    const rule = (text: string, selector: string) => new RegExp(`${selector.replaceAll(".", "\\.")}\\s*\\{([^}]*)\\}`).exec(text)?.[1] ?? "";
    const declarations = (block: string) => new Set(block.split(";").map((d) => d.replace(/\s+/g, "").trim()).filter(Boolean));
    const slide = declarations(rule(css, ".ks-slide .ks-math"));
    const picture = declarations(rule(MATH_PAGE_CSS, ".ks-math"));
    expect(picture.size).toBeGreaterThan(3);
    for (const declaration of picture) expect(slide, declaration).toContain(declaration);
    expect(declarations(rule(css, ".ks-slide .ks-math .katex-display"))).toEqual(declarations(rule(MATH_PAGE_CSS, ".ks-math .katex-display")));
  });
});

describe("the pictures of a deck's formulas", () => {
  const styles = vi.fn(async () => ".katex{}");

  it("are one for each name the expansions give, drawn at three times the size of the picture's box", async () => {
    const a = math("a", "x^2");
    const b = math("b", "y^2", { inline: true });
    const deck = await deckWith(a, b);
    const raster = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const made = await mathPictures(deck, { expand: (_t, _l, e) => expansion(e, `math/${e.id}.png`, 320, 90), raster, styles });
    expect([...made.keys()]).toEqual(["math/a.png", "math/b.png"]);
    expect(raster).toHaveBeenCalledTimes(2);
    const [page, css, w, h, scale] = raster.mock.calls[0] as unknown as [string, string, number, number, number];
    expect(page).toContain("katex");
    expect(css).toContain(".katex{}");
    expect(css).toContain(MATH_PAGE_CSS);
    expect([w, h, scale]).toEqual([320, 90, MATH_SCALE]);
    expect(MATH_SCALE).toBe(3);
  });

  it("are found in groups, and made once for a name that comes twice", async () => {
    const same = math("s1", "x");
    const again = math("s2", "x");
    const group = { type: "group", id: "g", children: [same] } as unknown as Element;
    const deck = await deckWith(group, again);
    const raster = vi.fn(async () => new Uint8Array([9]));
    const made = await mathPictures(deck, { expand: (_t, _l, e) => expansion(e, "math/one.png"), raster, styles });
    expect([...made.keys()]).toEqual(["math/one.png"]);
    expect(raster).toHaveBeenCalledTimes(1);
  });

  it("leave out a formula the browser cannot draw, and go on with the rest", async () => {
    const deck = await deckWith(math("a", "x"), math("b", "y"), math("c", "\\frac{"));
    const raster = vi.fn<() => Promise<Uint8Array | null>>().mockResolvedValueOnce(new Uint8Array([1])).mockResolvedValueOnce(null).mockResolvedValue(new Uint8Array([1]));
    const made = await mathPictures(deck, { expand: (_t, _l, e) => expansion(e, `math/${e.id}.png`), raster, styles });
    // "b" was refused by the canvas, "c" is not LaTeX: both are text in the file.
    expect([...made.keys()]).toEqual(["math/a.png"]);
  });

  it("are none when the page has no KaTeX stylesheet", async () => {
    const deck = await deckWith(math("a", "x"));
    const raster = vi.fn(async () => new Uint8Array([1]));
    const made = await mathPictures(deck, { expand: (_t, _l, e) => expansion(e, "math/a.png"), raster, styles: async () => null });
    expect(made.size).toBe(0);
    expect(raster).not.toHaveBeenCalled();
  });

  it("are none for a formula whose expansion is not a picture, and a formula that cannot be expanded does not stop the others", async () => {
    const deck = await deckWith(math("a", "x"), math("b", "y"));
    const raster = vi.fn(async () => new Uint8Array([1]));
    const expand = (_t: Theme, _l: string, e: Element): Element | null => {
      if (e.id === "a") throw new Error("cannot expand");
      return expansion(e, "math/b.png");
    };
    const made = await mathPictures(deck, { expand, raster, styles });
    expect([...made.keys()]).toEqual(["math/b.png"]);
  });

  it("are none when the deck has no formulas, and nothing is drawn", async () => {
    const deck = await deckWith({ type: "shape", id: "s", shape: "rect", x: 0, y: 0, w: 10, h: 10 } as unknown as Element);
    const raster = vi.fn();
    expect((await mathPictures(deck, { raster, styles })).size).toBe(0);
    expect(raster).not.toHaveBeenCalled();
  });
});

describe("the stills of embedded pages and videos", () => {
  it("are the posters the deck names, once each, wherever the elements are", async () => {
    const deck = await deckWith(
      { type: "embed", id: "e", url: "https://example.com", poster: "assets/site.png", x: 0, y: 0, w: 100, h: 100 } as unknown as Element,
      { type: "video", id: "v", src: "clip.mp4", poster: "assets/clip.png", x: 0, y: 0, w: 100, h: 100 } as unknown as Element,
      { type: "group", id: "g", children: [{ type: "video", id: "v2", src: "b.mp4", poster: "assets/site.png", x: 0, y: 0, w: 1, h: 1 }] } as unknown as Element,
      { type: "video", id: "v3", src: "c.mp4", poster: "", x: 0, y: 0, w: 1, h: 1 } as unknown as Element,
    );
    expect(posterPaths(deck)).toEqual(["assets/site.png", "assets/clip.png"]);
  });
});
