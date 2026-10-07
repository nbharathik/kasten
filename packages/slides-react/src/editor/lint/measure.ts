// Lint asks the browser one thing: how big the words of each element come out
// once they are laid out. The engine says what to measure (`lintProbes`), this
// draws each piece the way a slide draws it, off the page, and reads the size
// of the boxes. Rendering to a string and reading many boxes after one
// insertion means one layout for a whole slide, not one for each piece.

import type { Measure, Probe, ProbePart, Text, Theme } from "@kasten-slides/wasm";
import { createElement } from "react";

import { TextBlock } from "../../text/TextBlock.tsx";
import "./measure.css";

/** How big a laid-out box is, in CSS pixels (which are slide units). */
export interface BoxSize {
  width: number;
  height: number;
}

export interface MeasureEnv {
  /** Where the probes are laid out; the page's body by default. */
  parent?: HTMLElement;
  /** What the layout says about a box. The browser's own answer by default; a test that has no layout gives one. */
  sizeOf?: (node: Element) => BoxSize;
}

type Render = (element: ReturnType<typeof createElement>) => string;

/** The string renderer, loaded the first time it is needed so a page that never lints does not carry it. */
let render: Render | null = null;

/** Loads what `measureProbes` draws with. Call it, and wait, before the first measurement. */
export async function loadMeasurer(): Promise<void> {
  render ??= (await import("react-dom/server")).renderToStaticMarkup;
}

/** Whether `loadMeasurer` has finished. */
export const measurerReady = (): boolean => render !== null;

const browserSize = (node: Element): BoxSize => {
  const box = node.getBoundingClientRect();
  return { width: box.width, height: box.height };
};

/**
 * One piece of text twice: at its natural height in the room it is given
 * (`ks-mh`), and as narrow as it can be (`ks-mw`). The order is what
 * `measureProbes` reads it back by. The narrow one is the piece's `narrow`
 * words when it has them: the same words with a break allowed inside an address
 * or a word in the code font, which a page breaks wherever it must, so that
 * only a word that cannot be broken sets the width.
 */
function pair(draw: Render, theme: Theme, probe: Probe, part: ProbePart): string {
  const block = (text: Text): string => draw(createElement(TextBlock, { theme, text, baseStyle: part.base, width: probe.areaWidth, height: probe.areaHeight }));
  const tall = block(part.text);
  const narrow = part.narrow ? block(part.narrow) : tall;
  return `<div class="ks-mh" style="width:${probe.areaWidth}px">${tall}</div><div class="ks-mw">${narrow}</div>`;
}

/**
 * The sizes the words of each probe come out at, by element id. The height is
 * what the text needs when wrapped to the room; the width is the widest word,
 * which no wrapping can make smaller; both include the space around the text.
 * An element with several pieces (a table's cells) gets the biggest of each.
 */
export function measureProbes(theme: Theme, probes: readonly Probe[], env: MeasureEnv = {}): Record<string, Measure> {
  if (probes.length === 0 || typeof document === "undefined") return {};
  if (!render) throw new Error("measureProbes needs loadMeasurer to have finished");
  const draw = render;
  const sizeOf = env.sizeOf ?? browserSize;
  const room = document.createElement("div");
  room.className = "ks-measure";
  room.setAttribute("aria-hidden", "true");
  room.innerHTML = probes.map((probe) => probe.parts.map((part) => pair(draw, theme, probe, part)).join("")).join("");
  (env.parent ?? document.body).append(room);
  try {
    const out: Record<string, Measure> = {};
    let at = 0;
    for (const probe of probes) {
      let textWidth = 0;
      let textHeight = 0;
      for (let i = 0; i < probe.parts.length; i++, at += 2) {
        const tall = room.children[at]?.firstElementChild;
        const narrow = room.children[at + 1]?.firstElementChild;
        if (tall) textHeight = Math.max(textHeight, sizeOf(tall).height);
        if (narrow) textWidth = Math.max(textWidth, sizeOf(narrow).width);
      }
      out[probe.id] = { textWidth, textHeight, areaWidth: probe.areaWidth, areaHeight: probe.areaHeight };
    }
    return out;
  } finally {
    room.remove();
  }
}
