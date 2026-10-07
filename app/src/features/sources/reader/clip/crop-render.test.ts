// The clip tool on a real PDF: pdf.js draws the sample paper's figures on a
// canvas of node-canvas, and the PNG that comes out is read back into pixels.
// The paper (fixtures/dev-vault/sources/paper-with-figures.pdf) is written by
// scripts/figures-pdf.mjs, which also says where each figure is and in what
// colours it is drawn.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { PDFDocumentProxy } from "pdfjs-dist";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterAll, describe, expect, it } from "vitest";

import type { PdfRect } from "../../../../lib/vault/types";
import { cropPage, DPI, type MakeSurface } from "./crop";
import { densityOf, sizeOf } from "./png";
import { decodePng } from "./test-png";

type Rgb = [number, number, number];
interface Figure {
  name: string;
  page: number;
  rect: PdfRect;
  caption: string;
}
interface Script {
  FIGURES: Figure[];
  COLORS: { read: Rgb; highlight: Rgb; clip: Rgb; cite: Rgb; bars: Rgb[] };
  STEPS: { x: number; pitch: number; y: number; width: number; height: number };
  BARS: { x: number; pitch: number; y: number; width: number; heights: number[] };
  BITMAP: { x: number; y: number; size: number };
  HEAT: { blocks: number; block: number };
  PAPER: { file: string; title: string; key: string };
  heat(bx: number, by: number): Rgb;
  build(options?: { rotate?: number }): { pdf: Buffer; sidecar: string; bib: string };
}

const ROOT = join(import.meta.dirname, "../../../../../..");
const S = DPI / 72;
const script = (await import(pathToFileURL(join(ROOT, "scripts/figures-pdf.mjs")).href)) as Script;
const SOURCES = join(ROOT, "fixtures/dev-vault/sources");

/** Canvases made by pdf.js's own factory, which is node-canvas here. */
function nodeSurface(doc: PDFDocumentProxy): MakeSurface {
  const factory = (doc as unknown as { canvasFactory: { create(w: number, h: number): { canvas: { toBuffer(type: string): Buffer }; context: CanvasRenderingContext2D } } }).canvasFactory;
  return (width, height) => {
    const { canvas, context } = factory.create(width, height);
    return { target: { canvas: null, canvasContext: context }, png: async () => new Uint8Array(canvas.toBuffer("image/png")), release() {} };
  };
}

const data = new Uint8Array(readFileSync(join(SOURCES, `${script.PAPER.file}.pdf`)));
const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
// node-canvas comes with pdf.js as an optional package: a platform without it cannot draw, and these tests wait.
const canDraw = (() => {
  try {
    (doc as unknown as { canvasFactory: { create(w: number, h: number): unknown } }).canvasFactory.create(1, 1);
    return true;
  } catch {
    return false;
  }
})();

afterAll(async () => {
  await doc.loadingTask.destroy();
});

/** The figure clipped, and the colour at a point on its page (PDF points) as the clip has it. */
async function clip(figure: Figure) {
  const page = await doc.getPage(figure.page);
  const clipped = await cropPage(page, figure.rect, nodeSurface(doc));
  const picture = decodePng(clipped.bytes);
  const [x1, , , y2] = figure.rect;
  const pixel = (x: number, y: number) => picture.at(Math.round((x - x1) * S), Math.round((y2 - y) * S)).slice(0, 3);
  return { clipped, picture, pixel };
}

const near = (got: number[], want: number[], by = 6) => got.every((c, i) => Math.abs(c - want[i]!) <= by);
const expectColour = (got: number[], want: number[]) => expect(near(got, want), `got ${got}, want ${want}`).toBe(true);

describe("the sample paper", () => {
  it("is what the script writes", () => {
    const { pdf, sidecar, bib } = script.build();
    expect(new Uint8Array(readFileSync(join(SOURCES, `${script.PAPER.file}.pdf`)))).toEqual(new Uint8Array(pdf));
    expect(readFileSync(join(SOURCES, `${script.PAPER.file}.highlights.json`), "utf8")).toBe(sidecar);
    expect(readFileSync(join(SOURCES, `${script.PAPER.file}.bib`), "utf8")).toBe(bib);
    expect(doc.numPages).toBe(2);
  });
});

describe.skipIf(!canDraw)("a figure clipped from the sample paper", () => {
  it("is a PNG at 300 dpi the size of its box, and says so", async () => {
    for (const figure of script.FIGURES) {
      const { clipped, picture } = await clip(figure);
      const [x1, y1, x2, y2] = figure.rect;
      expect([clipped.width, clipped.height], figure.name).toEqual([Math.round((x2 - x1) * S), Math.round((y2 - y1) * S)]);
      expect([picture.width, picture.height]).toEqual([clipped.width, clipped.height]);
      expect(sizeOf(clipped.bytes)).toEqual({ width: clipped.width, height: clipped.height });
      expect(densityOf(clipped.bytes)).toBe(300);
    }
  });

  it("starts and ends where the box does: the frame drawn around it is at the edges", async () => {
    for (const figure of script.FIGURES) {
      const { picture } = await clip(figure);
      const edges: [number, number][] = [
        [Math.floor(picture.width / 2), 0],
        [Math.floor(picture.width / 2), picture.height - 1],
        [0, Math.floor(picture.height / 2)],
        [picture.width - 1, Math.floor(picture.height / 2)],
      ];
      for (const [x, y] of edges) {
        const [r, g, b] = picture.at(x, y);
        expect(Math.max(r, g, b), `${figure.name} at ${x},${y}`).toBeLessThan(235);
      }
      // And the frame is a line, not a band: a little inside the edge is white or the figure's.
      expect(picture.at(Math.floor(picture.width / 2), 6).slice(0, 3)).toEqual([255, 255, 255]);
    }
  });

  it("shows the diagram of figure 1, boxes where they are drawn", async () => {
    const { pixel } = await clip(script.FIGURES[0]!);
    const { x, pitch, y, height } = script.STEPS;
    // Near the top left corner of each box, clear of its label.
    const inside = (step: number) => pixel(x + step * pitch + 10, y + height - 10);
    expectColour(inside(0), script.COLORS.read);
    expectColour(inside(1), script.COLORS.highlight);
    expectColour(inside(2), script.COLORS.clip);
    expectColour(inside(3), script.COLORS.cite);
    // Below the boxes' labels there is only paper.
    expect(pixel(140, y - 45)).toEqual([255, 255, 255]);
  });

  it("shows the bars of figure 2 as tall as they are drawn", async () => {
    const { pixel } = await clip(script.FIGURES[1]!);
    const { x, pitch, y, width, heights } = script.BARS;
    const middle = (bar: number) => x + bar * pitch + width / 2;
    const last = heights.length - 1;
    expectColour(pixel(middle(0), y + heights[0]! / 2), script.COLORS.bars[0]!);
    expectColour(pixel(middle(last), y + heights[last]! / 2), script.COLORS.bars[last]!);
    // A little above the first bar there is only paper; the last bar is that tall.
    expect(pixel(middle(0), y + heights[0]! + 10)).toEqual([255, 255, 255]);
    expectColour(pixel(middle(last), y + heights[0]! + 10), script.COLORS.bars[last]!);
  });

  it("shows the bitmap of figure 3, each block in its own colour", async () => {
    const { pixel } = await clip(script.FIGURES[2]!);
    const { blocks } = script.HEAT;
    const { x, y, size } = script.BITMAP;
    // The middle of a block: its row counts from the top of the bitmap.
    for (const [bx, by] of [[0, 0], [3, 2], [5, 5], [7, 7]] as const) {
      expectColour(pixel(x + ((bx + 0.5) * size) / blocks, y + size - ((by + 0.5) * size) / blocks), script.heat(bx, by));
    }
  });

  it("is cut right from a page that is turned a quarter: the box turns with it", async () => {
    const turned = await pdfjs.getDocument({ data: new Uint8Array(script.build({ rotate: 90 }).pdf), verbosity: 0 }).promise;
    try {
      const figure = script.FIGURES[0]!;
      const page = await turned.getPage(figure.page);
      const clipped = await cropPage(page, figure.rect, nodeSurface(turned));
      const picture = decodePng(clipped.bytes);
      // 451 by 170 points upright; turned, it is 170 wide and 451 high.
      expect([clipped.width, clipped.height]).toEqual([Math.round(170 * S), Math.round(451 * S)]);
      // Where pdf.js itself puts a point of the page in the turned picture, less where the box's corner is.
      const view = page.getViewport({ scale: S });
      const corners = [view.convertToViewportPoint(figure.rect[0], figure.rect[1]), view.convertToViewportPoint(figure.rect[2], figure.rect[3])];
      const [left, top] = [Math.min(corners[0]![0]!, corners[1]![0]!), Math.min(corners[0]![1]!, corners[1]![1]!)];
      const { x, pitch, y, height } = script.STEPS;
      const wants: [number, Rgb][] = [
        [0, script.COLORS.read],
        [1, script.COLORS.highlight],
        [2, script.COLORS.clip],
        [3, script.COLORS.cite],
      ];
      for (const [step, want] of wants) {
        const [vx, vy] = view.convertToViewportPoint(x + step * pitch + 10, y + height - 10);
        expectColour(picture.at(Math.round(vx! - left), Math.round(vy! - top)).slice(0, 3), want);
      }
    } finally {
      await turned.loadingTask.destroy();
    }
  });

  it("is refused when the box is the whole of a page many times over", async () => {
    const page = await doc.getPage(1);
    await expect(cropPage(page, [0, 0, 5000, 5000], nodeSurface(doc))).rejects.toThrow(/megapixels/);
  });
});
