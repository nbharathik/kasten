// @vitest-environment jsdom
import type { Deck } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { themeNamed } from "../text/test-support.ts";
import { dataUrlOf, entryName, pngPages, slidePictures } from "./png.ts";

const text = (id: string, words: string) => ({ type: "text", id, x: 40, y: 40, w: 400, h: 60, text: { paragraphs: [{ runs: [{ t: words }] }] } });

/** Four slides: plain (with a picture), with two steps, hidden, and a backup. */
async function deckOf(): Promise<Deck> {
  const slide = (id: string, elements: unknown[] = [], extra: Record<string, unknown> = {}) => ({ id, layout: "blank", elements, ...extra });
  return {
    format: "kasten-deck",
    formatVersion: 1,
    title: "Pictures",
    size: { w: 960, h: 540 },
    theme: await themeNamed("Light"),
    present: { slideNumbers: true, stepLabel: "Step {n} / {total}" },
    slides: [
      slide("s-1", [text("e-1", "Hello there"), { type: "image", id: "e-2", x: 500, y: 40, w: 100, h: 100, src: "assets/pic.png" }]),
      slide("s-2", [text("e-3", "Two steps")], { steps: 2 }),
      slide("s-3", [text("e-4", "Hidden one")], { hidden: true }),
      slide("s-4", [text("e-5", "Backup")], { backup: true }),
    ],
  } as unknown as Deck;
}

const options = (over: Partial<Parameters<typeof pngPages>[1]> = {}) => ({ scope: "all" as const, scale: 2 as const, steps: "final" as const, ...over });
const bytesOf = (s: string) => new TextEncoder().encode(s);
const tools = (over: Partial<Parameters<typeof slidePictures>[2]> = {}) => ({
  styles: async () => ({ css: "STYLE", missing: [] }),
  katex: async () => null,
  raster: async (_html: string, _css: string, w: number, h: number, scale: number) => bytesOf(`png ${w}x${h} @${scale}`),
  ...over,
});

describe("the slides a PNG export draws", () => {
  it("are the ones that are shown, each once at its last step", async () => {
    const pages = pngPages(await deckOf(), options());
    expect(pages.map((p) => [p.slide.id, p.step, p.number])).toEqual([["s-1", undefined, 1], ["s-2", 2, 2], ["s-4", undefined, 3]]);
  });

  it("are a picture for every step of a slide that has steps, when asked", async () => {
    const pages = pngPages(await deckOf(), options({ steps: "each" }));
    expect(pages.map((p) => [p.slide.id, p.step])).toEqual([["s-1", undefined], ["s-2", 0], ["s-2", 1], ["s-2", 2], ["s-4", undefined]]);
  });

  it("are the current slide alone, even one that is hidden", async () => {
    const deck = await deckOf();
    expect(pngPages(deck, options({ scope: "current" }), "s-3").map((p) => [p.slide.id, p.step, p.number])).toEqual([["s-3", undefined, 3]]);
    expect(pngPages(deck, options({ scope: "current", steps: "each" }), "s-2").map((p) => [p.slide.id, p.step])).toEqual([["s-2", 0], ["s-2", 1], ["s-2", 2]]);
  });

  it("are the first slide when the current one is not known", async () => {
    expect(pngPages(await deckOf(), options({ scope: "current" }), "gone").map((p) => p.slide.id)).toEqual(["s-1"]);
  });
});

describe("the name of a picture", () => {
  it("is the slide's place among those shown, with the step when there is one to tell apart", async () => {
    const [first, second] = pngPages(await deckOf(), options({ steps: "each" }));
    expect(entryName(first!, 12, false)).toBe("slide-01.png");
    expect(entryName(second!, 12, true)).toBe("slide-02-step-0.png");
    expect(entryName({ ...second!, number: 7, step: 3 }, 120, true)).toBe("slide-007-step-3.png");
    expect(entryName({ ...second!, number: 7, step: 3 }, 12, false)).toBe("slide-07.png");
  });
});

describe("a picture as a data URL", () => {
  it("names the kind of picture by its file name, and by its first bytes when the name does not say", () => {
    expect(dataUrlOf("a/b.png", Uint8Array.from([1, 2, 3]))).toBe("data:image/png;base64,AQID");
    expect(dataUrlOf("photo.JPG", Uint8Array.from([255]))).toMatch(/^data:image\/jpeg;base64,/);
    expect(dataUrlOf("vector.svg", bytesOf("<svg/>"))).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(dataUrlOf("noext", Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toMatch(/^data:image\/png;base64,/);
    expect(dataUrlOf("noext", Uint8Array.from([1, 2]))).toMatch(/^data:application\/octet-stream;base64,/);
  });

  it("holds any number of bytes", () => {
    const big = new Uint8Array(200_000).fill(65);
    expect(atob(dataUrlOf("x.png", big).split(",")[1] as string)).toHaveLength(200_000);
  });
});

describe("the pictures of a deck", () => {
  it("are one for each page, drawn at the deck's size and the scale asked for", async () => {
    const seen: [string, string, number, number, number][] = [];
    const raster = async (html: string, css: string, w: number, h: number, scale: number) => {
      seen.push([html, css, w, h, scale]);
      return bytesOf(`png ${seen.length}`);
    };
    const { pictures, warnings } = await slidePictures(await deckOf(), options({ scale: 4 }), tools({ raster }));
    expect(pictures.map((p) => p.name)).toEqual(["slide-01.png", "slide-02.png", "slide-03.png"]);
    expect(pictures.map((p) => new TextDecoder().decode(p.bytes))).toEqual(["png 1", "png 2", "png 3"]);
    expect(seen.map(([, , w, h, scale]) => [w, h, scale])).toEqual([[960, 540, 4], [960, 540, 4], [960, 540, 4]]);
    expect(seen[0]?.[0]).toContain("Hello there");
    expect(seen[1]?.[0]).toContain("Two steps");
    expect(seen.every(([, css]) => css.includes("STYLE"))).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("carry the pictures the deck names as data, since a picture of markup loads nothing", async () => {
    const seen: string[] = [];
    const images = new Map([["assets/pic.png", Uint8Array.from([1, 2, 3])]]);
    await slidePictures(await deckOf(), options({ scope: "current" }), tools({ images, current: "s-1", raster: async (html) => (seen.push(html), bytesOf("x")) }));
    expect(seen[0]).toContain("data:image/png;base64,AQID");
  });

  it("carry KaTeX's style when a slide has a formula", async () => {
    const deck = await deckOf();
    (deck.slides[0]!.elements as unknown[]).push({ type: "math", id: "e-9", x: 40, y: 200, w: 300, h: 80, latex: "x^2 + y^2" });
    const css: string[] = [];
    await slidePictures(deck, options({ scope: "current" }), tools({ current: "s-1", katex: async () => "KATEX RULES", raster: async (_html, style) => (css.push(style), bytesOf("x")) }));
    expect(css[0]).toContain("KATEX RULES");
    const plain: string[] = [];
    await slidePictures(deck, options({ scope: "current" }), tools({ current: "s-2", katex: async () => "KATEX RULES", raster: async (_html, style) => (plain.push(style), bytesOf("x")) }));
    expect(plain[0]).not.toContain("KATEX RULES");
  });

  it("say once which font could not be embedded", async () => {
    const styles = async () => ({ css: "", missing: ["Fancy Sans"] });
    const { warnings } = await slidePictures(await deckOf(), options(), tools({ styles }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Fancy Sans");
  });

  it("leave out a page the browser cannot draw, and say which", async () => {
    let n = 0;
    const raster = async () => (++n === 2 ? null : bytesOf("ok"));
    const { pictures, warnings } = await slidePictures(await deckOf(), options(), tools({ raster }));
    expect(pictures.map((p) => p.name)).toEqual(["slide-01.png", "slide-03.png"]);
    expect(warnings.join(" ")).toContain("slide 2");
  });

  it("cannot be made at all in a browser that draws none, and that is an error a person can read", async () => {
    await expect(slidePictures(await deckOf(), options(), tools({ raster: async () => null }))).rejects.toThrow(/cannot draw/);
  });

  it("report their progress", async () => {
    const seen: [number, number][] = [];
    await slidePictures(await deckOf(), options(), tools({ progress: (done, total) => seen.push([done, total]) }));
    expect(seen).toEqual([[1, 3], [2, 3], [3, 3]]);
  });
});
