// Helpers for the tests of this folder only; nothing else imports them.
//
// The themes are the real ones, made by the WebAssembly engine. The wasm file
// is read by path rather than through `new URL(..., import.meta.url)`, which
// the test bundler rewrites into an address when the tests run in jsdom.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Theme } from "@kasten-slides/wasm";
import { DeckEngine, loadSlides } from "@kasten-slides/wasm";

let loaded: Promise<void> | null = null;

/** The built-in theme of that name: Light, Dark, Serif or Lecture. */
export async function themeNamed(name = "Light"): Promise<Theme> {
  loaded ??= loadSlides(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../slides-wasm/pkg/slides_wasm_bg.wasm")));
  await loaded;
  return DeckEngine.create("Test deck", name, 1).deck.theme;
}

/** jsdom draws nothing, so it has no boxes for ProseMirror to ask about; these answer with empty ones. */
export function installDomShims(): void {
  const empty = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) };
  const rects = { length: 0, item: () => null, [Symbol.iterator]: () => [][Symbol.iterator]() };
  const range = Range.prototype as unknown as Record<string, unknown>;
  range.getClientRects ??= () => rects;
  range.getBoundingClientRect ??= () => empty;
  const element = Element.prototype as unknown as Record<string, unknown>;
  element.getClientRects ??= () => rects;
  element.scrollIntoView ??= () => undefined;
  const doc = document as unknown as Record<string, unknown>;
  doc.elementFromPoint ??= () => null;
}
