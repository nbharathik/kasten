// Between a page's CSS pixels and PDF points, the coordinates highlights
// are kept in. A page viewport maps a PDF point
// (x, y) to (a·x + c·y + e, b·x + d·y + f); its inverse brings a selection's
// boxes back. Pure, so the reader's geometry is tested without pdf.js.

import type { PdfRect } from "../../../lib/vault/types";

/** pdf.js's `PageViewport.transform`. */
export type Transform = readonly [number, number, number, number, number, number];

/** A box in a page's CSS pixels, from its top left. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** What `getBoundingClientRect` gives, in window pixels. */
export interface ClientRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function toView(t: Transform, x: number, y: number): [number, number] {
  return [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
}

export function toPdf(t: Transform, x: number, y: number): [number, number] {
  const det = t[0] * t[3] - t[1] * t[2];
  const px = x - t[4];
  const py = y - t[5];
  return [(t[3] * px - t[2] * py) / det, (t[0] * py - t[1] * px) / det];
}

/** A PDF rectangle as a box on the page. */
export function viewBox(t: Transform, rect: PdfRect): Box {
  const [x1, y1] = toView(t, rect[0], rect[1]);
  const [x2, y2] = toView(t, rect[2], rect[3]);
  return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

/** Boxes on the page as PDF rectangles, `[x1, y1, x2, y2]` with x1 < x2 and y1 < y2. */
export function pdfRects(t: Transform, boxes: readonly Box[]): PdfRect[] {
  return boxes.map((b) => {
    const [x1, y1] = toPdf(t, b.left, b.top);
    const [x2, y2] = toPdf(t, b.left + b.width, b.top + b.height);
    return [round(Math.min(x1, x2)), round(Math.min(y1, y2)), round(Math.max(x1, x2)), round(Math.max(y1, y2))];
  });
}

/** A selection's client rectangles as boxes on `page`: clipped to it, the
 * specks dropped, and the pieces of each line joined into one. */
export function lineBoxes(rects: readonly ClientRect[], page: ClientRect): Box[] {
  const boxes = rects
    .map((r) => ({ left: Math.max(r.left, page.left), top: Math.max(r.top, page.top), right: Math.min(r.right, page.right), bottom: Math.min(r.bottom, page.bottom) }))
    .filter((r) => r.right - r.left >= 1 && r.bottom - r.top >= 1)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: { left: number; top: number; right: number; bottom: number }[] = [];
  for (const r of boxes) {
    const height = r.bottom - r.top;
    const line = lines.find((l) => {
      const overlap = Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top);
      return overlap > 0.5 * Math.min(height, l.bottom - l.top);
    });
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else lines.push({ ...r });
  }
  return lines.map((l) => ({ left: l.left - page.left, top: l.top - page.top, width: l.right - l.left, height: l.bottom - l.top }));
}

/** Whether the page point (x, y) falls on one of `rects`, give or take `pad` pixels. */
export function hits(t: Transform, rects: readonly PdfRect[], x: number, y: number, pad = 2): boolean {
  return rects.some((rect) => {
    const b = viewBox(t, rect);
    return x >= b.left - pad && x <= b.left + b.width + pad && y >= b.top - pad && y <= b.top + b.height + pad;
  });
}
