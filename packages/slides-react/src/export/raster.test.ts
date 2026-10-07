import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pixelsOf, rasterize, svgDocument } from "./raster.ts";

/** A PNG's first bytes: what a canvas answers `toBlob` with. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("the size of a picture", () => {
  it("is the units times the scale, in whole pixels", () => {
    expect(pixelsOf(960, 540, 3)).toEqual({ w: 2880, h: 1620 });
    expect(pixelsOf(100.4, 20.2, 2)).toEqual({ w: 201, h: 40 });
    expect(pixelsOf(0.1, 0.1, 1)).toEqual({ w: 1, h: 1 });
  });

  it("is kept within what a canvas can hold, and keeps its shape", () => {
    const wide = pixelsOf(20000, 100, 3);
    expect(wide?.w).toBeLessThanOrEqual(8192);
    expect((wide?.w ?? 0) / (wide?.h ?? 1)).toBeCloseTo(200, 0);
    const big = pixelsOf(6000, 6000, 3);
    expect((big?.w ?? 0) * (big?.h ?? 0)).toBeLessThanOrEqual(48_000_000);
  });

  it("is nothing when there is nothing to draw", () => {
    for (const [w, h, s] of [[0, 10, 1], [10, 0, 1], [-5, 10, 1], [10, 10, 0], [Number.NaN, 10, 1], [10, Number.POSITIVE_INFINITY, 1]] as const) {
      expect(pixelsOf(w, h, s), `${w} ${h} ${s}`).toBeNull();
    }
  });
});

describe("the SVG that holds the markup", () => {
  it("is a foreignObject of the units' size, shown at the scale", () => {
    const svg = svgDocument("<span>x</span>", ".a{color:red}", 400, 120, 3);
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="360"');
    expect(svg).toContain('viewBox="0 0 400 120"');
    expect(svg).toContain('<foreignObject x="0" y="0" width="400" height="120">');
  });

  it("is XML the browser will read: the HTML is written back closed, the CSS is escaped, and the namespaces are there", () => {
    const svg = svgDocument("<p>one<br>two &nbsp; three</p><img src='a.png'>", 'a > b::after{content:"&"}', 50, 50, 1);
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    const style = parsed.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "style")[0];
    expect(style?.textContent).toBe('a > b::after{content:"&"}');
  });

  it("puts the CSS before the markup it styles", () => {
    const svg = svgDocument("<b>bold</b>", ".x{}", 10, 10, 1);
    expect(svg.indexOf("<style")).toBeGreaterThan(-1);
    expect(svg.indexOf("<style")).toBeLessThan(svg.indexOf("<b>"));
  });
});

/** Stands in for the browser's picture loading and canvas, which jsdom does not have. */
function fakeBrowser({ load = true, taint = false, context = true }: { load?: boolean; taint?: boolean; context?: boolean } = {}) {
  const drawn: { w: number; h: number }[] = [];
  const sources: string[] = [];
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private address = "";
    get src(): string {
      return this.address;
    }
    set src(value: string) {
      this.address = value;
      sources.push(value);
      setTimeout(() => (load ? this.onload?.() : this.onerror?.()), 0);
    }
  }
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() =>
    context ? { drawImage: (_image: unknown, _x: number, _y: number, w: number, h: number) => drawn.push({ w, h }) } : null) as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(((callback: (blob: Blob | null) => void) => {
    if (taint) throw new DOMException("Tainted canvases may not be exported.", "SecurityError");
    callback(new Blob([PNG as BlobPart], { type: "image/png" }));
  }) as never);
  return { drawn, sources };
}

describe("rasterize", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("draws the markup at the scale and answers the PNG's bytes", async () => {
    const browser = fakeBrowser();
    const bytes = await rasterize("<span>x</span>", ".a{}", 400, 120, 3);
    expect(Array.from(bytes ?? [])).toEqual(Array.from(PNG));
    expect(browser.drawn).toEqual([{ w: 1200, h: 360 }]);
    // It is drawn from an SVG that carries the markup and the CSS itself.
    const [source] = browser.sources;
    expect(source).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    const svg = decodeURIComponent((source ?? "").split(",").slice(1).join(","));
    expect(svg).toContain("<span>x</span>");
    expect(svg).toContain(".a{}");
  });

  it("is null when the browser will not draw the SVG", async () => {
    fakeBrowser({ load: false });
    expect(await rasterize("<span>x</span>", "", 100, 40, 3)).toBeNull();
  });

  it("is null when the canvas is tainted and will not give up its pixels, as in some WebKit builds", async () => {
    fakeBrowser({ taint: true });
    expect(await rasterize("<span>x</span>", "", 100, 40, 3)).toBeNull();
  });

  it("is null when there is no canvas to draw on", async () => {
    fakeBrowser({ context: false });
    expect(await rasterize("<span>x</span>", "", 100, 40, 3)).toBeNull();
  });

  it("is null for a size that is nothing, without asking the browser", async () => {
    const browser = fakeBrowser();
    expect(await rasterize("<span>x</span>", "", 0, 40, 3)).toBeNull();
    expect(browser.sources).toEqual([]);
  });
});
