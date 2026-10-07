import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { PdfRect } from "../../../../lib/vault/types";
import type { Transform } from "../../pdf/geometry";
import { cropPage, DPI, MAX_PIXELS, MAX_SIDE, problemAt, regionOf, type Surface, tooBig } from "./crop";
import { densityOf, sizeOf } from "./png";

const S = DPI / 72;
/** A4 upright, laid out at 300 dpi, as pdf.js's viewport has it. */
const UPRIGHT: Transform = [S, 0, 0, -S, 0, 842 * S];
/** The same page turned a quarter. */
const TURNED: Transform = [0, S, S, 0, 0, 0];
const RECT: PdfRect = [72, 440, 523, 610];

const PIXEL = new Uint8Array(readFileSync(join(import.meta.dirname, "../../../../../../fixtures/assets/pixel.png")));

/** A page that draws nothing, and a surface that hands back a small PNG. */
function stand(transform: Transform = UPRIGHT) {
  const page = {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({ scale, transform })),
    render: vi.fn((_: unknown) => ({ promise: Promise.resolve() })),
  };
  const canvas = { fake: true } as unknown as HTMLCanvasElement;
  const release = vi.fn();
  const make = vi.fn((_width: number, _height: number): Surface => ({ target: { canvas }, png: async () => PIXEL, release }));
  return { page: page as unknown as Parameters<typeof cropPage>[0], calls: page, canvas, release, make };
}

describe("the part of a page a box covers", () => {
  it("is found from the page's transform at 300 dpi", () => {
    const region = regionOf(UPRIGHT, RECT);
    expect(region.left).toBeCloseTo(72 * S, 6);
    expect(region.top).toBeCloseTo((842 - 610) * S, 6);
    // 451 by 170 points, at 300 dots an inch.
    expect([region.width, region.height]).toEqual([1879, 708]);
  });

  it("follows a page that is turned a quarter", () => {
    const region = regionOf(TURNED, RECT);
    expect([region.width, region.height]).toEqual([708, 1879]);
    expect(region.left).toBeCloseTo(440 * S, 6);
    expect(region.top).toBeCloseTo(72 * S, 6);
  });

  it("is never less than a pixel", () => {
    expect(regionOf(UPRIGHT, [10, 10, 10.05, 10.05])).toMatchObject({ width: 1, height: 1 });
  });
});

describe("how big a picture may be", () => {
  it("allows up to 60 megapixels", () => {
    expect(tooBig(7745, 7745)).toBeNull();
    expect(tooBig(1879, 708)).toBeNull();
    expect(tooBig(7746, 7746)).toMatch(/61 megapixels at 300 dpi and the most is 60/);
    expect(MAX_PIXELS).toBe(60_000_000);
  });

  it("allows a side up to the canvas's own limit", () => {
    expect(tooBig(MAX_SIDE, 100)).toBeNull();
    expect(tooBig(MAX_SIDE + 1, 100)).toMatch(/16385 pixels long/);
  });

  it("is told from the box on the screen and its scale", () => {
    // A page fitted at 1.5: 300 by 200 pixels on the screen are 200 by 133 points.
    expect(problemAt({ width: 300, height: 200 }, 1.5)).toBeNull();
    expect(problemAt({ width: 30000, height: 20000 }, 1.5)).toMatch(/megapixels/);
  });
});

describe("cutting a figure out of a page", () => {
  it("draws only the box, moved to the corner of a canvas the box's size", async () => {
    const { page, calls, canvas, make } = stand();
    const clipped = await cropPage(page, RECT, make);
    expect(calls.getViewport).toHaveBeenCalledWith({ scale: S });
    expect(make).toHaveBeenCalledWith(1879, 708);
    const [options] = calls.render.mock.calls[0] as [{ canvas: unknown; viewport: { scale: number }; transform: number[] }];
    expect(options.canvas).toBe(canvas);
    expect(options.viewport.scale).toBe(S);
    expect(options.transform.slice(0, 4)).toEqual([1, 0, 0, 1]);
    expect(options.transform[4]).toBeCloseTo(-72 * S, 6);
    expect(options.transform[5]).toBeCloseTo(-(842 - 610) * S, 6);
    expect([clipped.width, clipped.height]).toEqual([1879, 708]);
  });

  it("hands back the PNG with its density, and lets go of the canvas", async () => {
    const { page, release, make } = stand();
    const clipped = await cropPage(page, RECT, make);
    expect(densityOf(clipped.bytes)).toBe(300);
    expect(sizeOf(clipped.bytes)).toEqual({ width: 4, height: 3 });
    expect(release).toHaveBeenCalledOnce();
  });

  it("refuses a box that is too big before it draws anything", async () => {
    const { page, calls, make } = stand();
    await expect(cropPage(page, [0, 0, 5000, 5000], make)).rejects.toThrow(/megapixels/);
    expect(make).not.toHaveBeenCalled();
    expect(calls.render).not.toHaveBeenCalled();
  });

  it("lets go of the canvas when the page does not draw", async () => {
    const { page, calls, release, make } = stand();
    calls.render.mockReturnValueOnce({ promise: Promise.reject(new Error("The page is broken")) });
    await expect(cropPage(page, RECT, make)).rejects.toThrow("The page is broken");
    expect(release).toHaveBeenCalledOnce();
  });
});
