// New elements, as they are first placed. Every one leaves `id` empty for the
// engine to assign, and takes its colours from the theme's tokens so it
// follows a theme change.

import type { Element, Route, Text } from "@kasten-slides/wasm";

import type { Box } from "./session/types.ts";

export const MIN_SIZE = 8;

/** Text made of one plain paragraph. */
export function plainText(words: string): Text {
  return { paragraphs: [{ runs: [{ t: words }] }] };
}

export function textBox(box: Box, words = ""): Element {
  return { type: "text", id: "", ...box, text: plainText(words) } as Element;
}

/** Shapes start filled with accent 1 and outlined a shade darker, like Google Slides. */
export function shape(preset: string, box: Box): Element {
  return {
    type: "shape",
    id: "",
    shape: preset,
    ...box,
    style: { fill: { color: "accent1" }, stroke: { color: "text1", width: 1, alpha: 0.35 } },
    text: { paragraphs: [{ runs: [{ t: "", color: "bg1" }], align: "center" }], valign: "middle" },
  } as Element;
}

/**
 * A line from `from` to `to`. It is stored as the box between the points with
 * flips, since a line runs from the box's top left to its bottom right.
 */
export function line(route: Route, arrow: boolean, from: { x: number; y: number }, to: { x: number; y: number }): Element {
  const flipH = to.x < from.x;
  const flipV = to.y < from.y;
  return {
    type: "line",
    id: "",
    route,
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    w: Math.abs(to.x - from.x),
    h: Math.abs(to.y - from.y),
    ...(flipH ? { flipH } : {}),
    ...(flipV ? { flipV } : {}),
    style: { stroke: { color: "text1", width: 2 }, ...(arrow ? { endArrow: "triangle" } : {}) },
  } as Element;
}

export function image(src: string, box: Box, alt?: string): Element {
  return { type: "image", id: "", src, ...box, ...(alt ? { alt } : {}) } as Element;
}

/** A table of empty cells, `columns` of equal width across `box`. */
export function table(rows: number, columns: number, box: Box): Element {
  const width = box.w / columns;
  const height = box.h / rows;
  return {
    type: "table",
    id: "",
    ...box,
    columns: Array.from({ length: columns }, () => width),
    rows: Array.from({ length: rows }, () => ({ height, cells: Array.from({ length: columns }, () => ({ text: plainText("") })) })),
    headerRow: true,
  } as Element;
}

/** The box a shape or text box gets when it is placed by a click rather than a drag. */
export function clickBox(at: { x: number; y: number }, size: { w: number; h: number }): Box {
  return { x: Math.round(at.x - size.w / 2), y: Math.round(at.y - size.h / 2), ...size };
}

/** An image scaled to fit inside `frame` (most of the slide), centred. */
export function fitted(natural: { w: number; h: number }, slide: { w: number; h: number }, share = 0.6): Box {
  const scale = Math.min((slide.w * share) / natural.w, (slide.h * share) / natural.h, 1);
  const w = Math.max(MIN_SIZE, Math.round(natural.w * scale));
  const h = Math.max(MIN_SIZE, Math.round(natural.h * scale));
  return { x: Math.round((slide.w - w) / 2), y: Math.round((slide.h - h) / 2), w, h };
}
