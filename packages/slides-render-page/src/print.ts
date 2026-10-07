// The deck laid out for printing, ready for the browser to print to a PDF. The layout is the editor's own
// (`mountPrintLayout`): one page to a slide at the slide's size, live text. What it does not do is get its fonts
// loaded, because on the screen the layout is not shown and the browser fetches only the fonts of text it lays
// out. So the layout is shown off to the side while the fonts and pictures arrive, and put away again.

import type { Deck } from "@kasten-slides/wasm";
import { DEFAULT_PRINT, type PrintOptions, mountPrintLayout, pagesOf } from "@kasten-slides/react/render-host";

import { mediaUrl } from "./media.ts";
import { settle } from "./settle.ts";
import type { PrintChoice, PrintInfo } from "./types.ts";

const OFF_TO_THE_SIDE = ".ks-print-root { display: block !important; position: absolute !important; left: -100000px !important; top: 0 !important; }";

/** The page size the print layout asks for, in CSS pixels, from its `@page` rule. */
export function pageSizeOf(css: string): { width: number; height: number } | null {
  const match = /@page\s*{[^}]*size:\s*([\d.]+)px\s+([\d.]+)px/.exec(css);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

export interface Printout {
  info: PrintInfo;
  /** Takes the layout off the page. */
  remove: () => void;
}

export async function layOut(deck: Deck, choice: PrintChoice = {}): Promise<Printout> {
  const options: PrintOptions = { ...DEFAULT_PRINT, steps: choice.steps ?? DEFAULT_PRINT.steps, notes: choice.notes ?? DEFAULT_PRINT.notes };
  const aside = document.createElement("style");
  aside.textContent = OFF_TO_THE_SIDE;
  document.head.append(aside);
  let remove: () => void;
  try {
    remove = await mountPrintLayout(deck, mediaUrl, options);
    await settle(document.body);
  } finally {
    aside.remove();
  }
  const css = document.querySelector("style[data-ks-print]")?.textContent ?? "";
  const size = pageSizeOf(css) ?? { width: deck.size.w, height: deck.size.h };
  document.title = deck.title;
  return { info: { pages: pagesOf(deck, options).length, ...size }, remove };
}
