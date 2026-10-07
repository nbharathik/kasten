// A figure cut from a page at 300 dpi. Only the box is drawn: the page is
// laid out at 300 dpi, then shifted so the box starts at the canvas's corner
// and the canvas is the box's size. A whole page at that density is 8.7
// megapixels for a letter page (35 MB of memory) and a poster is a lot more,
// so a page is never drawn whole. No OffscreenCanvas is needed: a plain
// canvas works in every webview the app runs in.

import type { PDFPageProxy } from "pdfjs-dist";

import type { PdfRect } from "../../../../lib/vault/types";
import { type Transform, viewBox } from "../../pdf/geometry";
import { withDensity } from "./png";

/** The density of a clip, in dots an inch. */
export const DPI = 300;
/** The most pixels a clip has. A bitmap this big is 240 MB in memory before it is a PNG. */
export const MAX_PIXELS = 60_000_000;
/** The longest side a canvas can have in the webviews the app runs in (Chromium's and WebKit's limit). */
export const MAX_SIDE = 16_384;

/** The box on the page laid out at `DPI`, in pixels from the page's top left. */
export interface Region {
  left: number;
  top: number;
  /** The canvas's size: whole pixels, at least one. */
  width: number;
  height: number;
}

/** What is drawn on, and how the picture is got out of it. */
export interface Surface {
  /** What pdf.js draws on: a canvas, or the context of one where there is no document to make it in. */
  target: { canvas: HTMLCanvasElement | null; canvasContext?: CanvasRenderingContext2D };
  /** The picture as PNG bytes. */
  png(): Promise<Uint8Array>;
  /** Lets go of the bitmap's memory. */
  release(): void;
}

export type MakeSurface = (width: number, height: number) => Surface;

/** A figure cut out: a PNG with its density, and its size in pixels. */
export interface Clipped {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** The part of a page's picture the box covers, given the page's transform at `DPI`. */
export function regionOf(transform: Transform, rect: PdfRect): Region {
  const box = viewBox(transform, rect);
  return { left: box.left, top: box.top, width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)) };
}

/** Why a picture of this size cannot be made, in words for the person; null when it can. */
export function tooBig(width: number, height: number): string | null {
  const pixels = width * height;
  if (pixels > MAX_PIXELS) return `That box would be ${Math.ceil(pixels / 1_000_000)} megapixels at ${DPI} dpi and the most is ${MAX_PIXELS / 1_000_000}. Draw it smaller, around the figure.`;
  if (Math.max(width, height) > MAX_SIDE) return `That box would be ${Math.max(width, height)} pixels long at ${DPI} dpi and the most is ${MAX_SIDE}. Draw it smaller, around the figure.`;
  return null;
}

/** The size in pixels a box drawn on the screen at `scale` (screen pixels to a point) has at `DPI`. */
export function pixelsOf(box: { width: number; height: number }, scale: number): { width: number; height: number } {
  const zoom = DPI / 72 / scale;
  return { width: Math.max(1, Math.round(box.width * zoom)), height: Math.max(1, Math.round(box.height * zoom)) };
}

/** Why a box drawn on the screen at `scale` cannot be made into a picture; null when it can. */
export function problemAt(box: { width: number; height: number }, scale: number): string | null {
  const { width, height } = pixelsOf(box, scale);
  return tooBig(width, height);
}

/** A canvas in the page. */
export const domSurface: MakeSurface = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return {
    target: { canvas },
    png: () =>
      new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("This window could not make a picture that big. Draw a smaller box around the figure."));
          blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
        }, "image/png");
      }),
    release() {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
};

/** The rectangle of the page (in PDF points) as a PNG at 300 dpi. Refuses a box over the limits before anything is drawn. */
export async function cropPage(page: Pick<PDFPageProxy, "getViewport" | "render">, rect: PdfRect, makeSurface: MakeSurface = domSurface): Promise<Clipped> {
  const viewport = page.getViewport({ scale: DPI / 72 });
  const region = regionOf(viewport.transform as unknown as Transform, rect);
  const problem = tooBig(region.width, region.height);
  if (problem) throw new Error(problem);
  const surface = makeSurface(region.width, region.height);
  try {
    await page.render({ ...surface.target, viewport, transform: [1, 0, 0, 1, -region.left, -region.top] }).promise;
    return { bytes: withDensity(await surface.png(), DPI), width: region.width, height: region.height };
  } finally {
    surface.release();
  }
}
