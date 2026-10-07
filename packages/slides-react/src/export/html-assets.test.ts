import type { Deck } from "@kasten-slides/wasm";
import { describe, expect, it, vi } from "vitest";

import { plainDeck } from "../render/testing/decks.ts";
import { base64, codePointsOf, dataUrl, mimeOf, pageStyles, rangeCovers, readPictures } from "./html-assets.ts";

const bytes = (...codes: number[]) => Uint8Array.from(codes);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0);
const text = (s: string) => new TextEncoder().encode(s);

describe("what a picture is", () => {
  it("is told by its first bytes, whatever its name says", () => {
    expect(mimeOf("a.jpg", PNG)).toBe("image/png");
    expect(mimeOf("a.png", JPEG)).toBe("image/jpeg");
    expect(mimeOf("a", bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("image/gif");
    expect(mimeOf("a", Uint8Array.from([...text("RIFF"), 0, 0, 0, 0, ...text("WEBPVP8 ")]))).toBe("image/webp");
    expect(mimeOf("a", text('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe("image/svg+xml");
    expect(mimeOf("a", text("  <svg></svg>"))).toBe("image/svg+xml");
  });

  it("is not a picture when it is anything else", () => {
    expect(mimeOf("notes.txt", text("hello"))).toBeNull();
    expect(mimeOf("a.pdf", text("%PDF-1.7"))).toBeNull();
    expect(mimeOf("a.avif", text("....ftypavif"))).toBe("image/avif");
  });

  it("goes in a page as a data URL", () => {
    expect(base64(text("Man"))).toBe("TWFu");
    expect(dataUrl(PNG, "image/png")).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...PNG))}`);
    // Long pictures are written in pieces without running out of stack.
    expect(base64(new Uint8Array(200_000)).length).toBe(Math.ceil(200_000 / 3) * 4);
  });
});

describe("the pictures of a deck", () => {
  const deck = (): Deck =>
    plainDeck([
      { type: "image", id: "a", x: 0, y: 0, w: 1, h: 1, src: "assets/a.png" },
      { type: "image", id: "b", x: 0, y: 0, w: 1, h: 1, src: "assets/b.png" },
      { type: "video", id: "v", x: 0, y: 0, w: 1, h: 1, src: "assets/clip.webm", poster: "assets/poster.jpg" },
      { type: "image", id: "c", x: 0, y: 0, w: 1, h: 1, src: "assets/text.txt" },
    ] as never).deck;

  it("are read from the host and made data URLs, the video's still with them and the video's file not asked for", async () => {
    const asked: string[] = [];
    const host = {
      imageUrl: () => undefined,
      readImage: async (path: string) => {
        asked.push(path);
        return path.endsWith("a.png") ? PNG : path.endsWith("poster.jpg") ? JPEG : path.endsWith("text.txt") ? text("not a picture") : undefined;
      },
    };
    const { found, missing } = await readPictures(host, deck());
    expect([...found.keys()].sort()).toEqual(["assets/a.png", "assets/poster.jpg"]);
    expect(found.get("assets/a.png")).toMatch(/^data:image\/png;base64,/);
    expect(asked).not.toContain("assets/clip.webm");
    // One the host does not have, and one that is no picture, are both missing.
    expect(missing.sort()).toEqual(["assets/b.png", "assets/text.txt"]);
  });

  it("are fetched from their address when the host cannot read them", async () => {
    const fetched = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => new Response(PNG, { status: url.toString().includes("gone") ? 404 : 200 }));
    const host = { imageUrl: (path: string) => (path.includes("b.png") ? "blob:gone" : `blob:${path}`) };
    const { found, missing } = await readPictures(host, deck());
    expect(found.has("assets/a.png")).toBe(true);
    expect(missing).toContain("assets/b.png");
    fetched.mockRestore();
  });

  it("do not stop the others when one cannot be read", async () => {
    const host = {
      imageUrl: () => undefined,
      readImage: async (path: string) => {
        if (path.endsWith("b.png")) throw new Error("no");
        return PNG;
      },
    };
    const { found, missing } = await readPictures(host, deck());
    expect(found.has("assets/a.png")).toBe(true);
    expect(missing).toContain("assets/b.png");
  });
});

describe("which scripts of a font the words use", () => {
  it("covers a range that has any of the characters, a wildcard, or none named", () => {
    const points = new Set([...text("Hello")].map((c) => c));
    const ascii = new Set([0x48, 0x65]);
    expect(rangeCovers("U+0000-00FF", ascii)).toBe(true);
    expect(rangeCovers("U+0100-02AF, U+0304", ascii)).toBe(false);
    expect(rangeCovers("U+0100-02AF, U+0048", ascii)).toBe(true);
    expect(rangeCovers("U+4??", new Set([0x4ab]))).toBe(true);
    expect(rangeCovers("U+4??", new Set([0x500]))).toBe(false);
    expect(rangeCovers("", ascii)).toBe(true);
    expect(rangeCovers("something odd", ascii)).toBe(true);
    void points;
  });

  it("knows the characters of a deck, with plain ASCII always in for numbers and labels", () => {
    const { deck } = plainDeck([{ type: "text", id: "t", x: 0, y: 0, w: 1, h: 1, text: { paragraphs: [{ runs: [{ t: "Ünïcode ✓" }] }] } } as never]);
    const points = codePointsOf(deck);
    expect(points.has("Ü".codePointAt(0) as number)).toBe(true);
    expect(points.has(0x2713)).toBe(true);
    expect(points.has(0x37)).toBe(true);
    expect(points.has("ж".codePointAt(0) as number)).toBe(false);
  });
});

describe("the styles of the page", () => {
  const STYLE = 1;
  const FACE = 5;
  const face = (family: string, extra: { weight?: string; style?: string; range?: string } = {}) => ({
    type: FACE,
    cssText: `@font-face { font-family: ${family}; src: url("/fonts/${family}.woff2") format("woff2"); }`,
    style: { getPropertyValue: (name: string) => ({ "font-family": family, "font-weight": extra.weight ?? "400", "font-style": extra.style ?? "normal", "unicode-range": extra.range ?? "", src: `url("/fonts/${family}-${extra.weight ?? "400"}${extra.style ?? ""}${extra.range ? "-x" : ""}.woff2") format("woff2")` })[name] ?? "" },
  });
  const rule = (selectorText: string) => ({ type: STYLE, selectorText, cssText: `${selectorText} { color: red; }`, style: { getPropertyValue: () => "" } });
  const sheet = (...rules: unknown[]): CSSStyleSheet => ({ cssRules: rules }) as unknown as CSSStyleSheet;
  const reader = async (url: string): Promise<string | null> => (url.includes("Nope") ? null : `data:font/woff2;base64,${btoa(url)}`);
  const markup = '<div style="font-family:&quot;Inter&quot;, &quot;Helvetica Neue&quot;, sans-serif">x</div>';
  const { deck } = plainDeck([]);

  it("has the rules of the slide and the fonts of the families it is set in, inline", async () => {
    const { css, missing } = await pageStyles(markup, deck, { sheets: [sheet(rule(".ks-slide .ks-el"), rule(".ks-editor .other"), face("Inter"), face("Lato"))], reader });
    expect(css).toContain(".ks-slide .ks-el");
    expect(css).not.toContain(".ks-editor");
    expect(css).toMatch(/@font-face\{font-family:"Inter";font-weight:400;font-style:normal;src:url\("data:font\/woff2;base64,/);
    expect(css).not.toContain("Lato");
    expect(missing).toEqual([]);
  });

  it("leaves out italic faces when nothing is italic, and scripts the words do not use", async () => {
    const sheets = [sheet(face("Inter"), face("Inter", { style: "italic" }), face("Inter", { range: "U+0400-045F" }))];
    const plain = await pageStyles(markup, deck, { sheets, reader });
    expect(plain.css.match(/@font-face/g)).toHaveLength(1);
    const slanted = await pageStyles(markup.replace("x", "<em>x</em>"), deck, { sheets, reader });
    expect(slanted.css.match(/@font-face/g)).toHaveLength(2);
    const russian = plainDeck([{ type: "text", id: "t", x: 0, y: 0, w: 1, h: 1, text: { paragraphs: [{ runs: [{ t: "Привет" }] }] } } as never]);
    const cyrillic = await pageStyles(markup, russian.deck, { sheets, reader });
    expect(cyrillic.css.match(/@font-face/g)).toHaveLength(2);
    expect(cyrillic.css).toContain("unicode-range:U+0400-045F");
  });

  it("says which family it could not give a font for", async () => {
    const { missing } = await pageStyles('<p style="font-family:&quot;Nope&quot;, serif">x</p><p style="font-family:Inter">y</p>', deck, { sheets: [sheet(face("Inter"))], reader });
    expect(missing).toEqual(["Nope"]);
    const unreadable = await pageStyles(markup, deck, { sheets: [sheet(face("Inter"))], reader: async () => null });
    expect(unreadable.missing).toEqual(["Inter"]);
  });
});
