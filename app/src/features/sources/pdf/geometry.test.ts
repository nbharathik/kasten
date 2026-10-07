import { describe, expect, it } from "vitest";

import { hits, lineBoxes, pdfRects, toPdf, toView, viewBox, type Transform } from "./geometry";

// An A4 page (595 × 842 pt) at 1.5×, as pdf.js makes it: y flips.
const T: Transform = [1.5, 0, 0, -1.5, 0, 842 * 1.5];

describe("page geometry", () => {
  it("goes between PDF points and the page's pixels", () => {
    expect(toView(T, 72, 770)).toEqual([108, 108]);
    expect(toPdf(T, 108, 108)).toEqual([72, 770]);
    // A highlight's rectangle is a box on the page, whichever way round.
    expect(viewBox(T, [72, 596.47, 499.01, 608.2])).toEqual({ left: 108, top: expect.closeTo(350.7, 5), width: expect.closeTo(640.515, 5), height: expect.closeTo(17.595, 5) });
    const back = pdfRects(T, [viewBox(T, [72, 596.47, 499.01, 608.2])]);
    expect(back).toEqual([[72, 596.47, 499.01, 608.2]]);
  });

  it("joins a selection's pieces into one box per line, on the page only", () => {
    const page = { left: 100, top: 50, right: 993, bottom: 1313 };
    const boxes = lineBoxes(
      [
        { left: 208, top: 400, right: 300, bottom: 418 },
        { left: 300, top: 401, right: 520, bottom: 417 },
        { left: 208, top: 425, right: 400, bottom: 443 },
        { left: 400, top: 425, right: 400.5, bottom: 443 }, // a speck
        { left: 900, top: 1300, right: 1100, bottom: 1330 }, // off the page's edge
      ],
      page,
    );
    expect(boxes).toEqual([
      { left: 108, top: 350, width: 312, height: 18 },
      { left: 108, top: 375, width: 192, height: 18 },
      { left: 800, top: 1250, width: 93, height: 13 },
    ]);
  });

  it("finds the highlight under a click", () => {
    const rects = [[72, 596.47, 499.01, 608.2]] as [number, number, number, number][];
    expect(hits(T, rects, 200, 360)).toBe(true);
    expect(hits(T, rects, 200, 330)).toBe(false);
    expect(hits(T, rects, 106.5, 360)).toBe(true); // within the pad
  });
});
