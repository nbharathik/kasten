// A real deck for tests: made by the WebAssembly build of slides-core, so a
// test draws what the editor would draw.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { DeckEngine, loadSlides } from "@kasten-slides/wasm";

let loaded: Promise<void> | null = null;

/** A new deck with a title slide, in the named theme (Light, Dark, Serif or Lecture). */
export async function newDeck(title = "Test deck", theme = "Light"): Promise<DeckEngine> {
  loaded ??= readFile(join(import.meta.dirname, "../../../slides-wasm/pkg/slides_wasm_bg.wasm")).then((bytes) => loadSlides(bytes));
  await loaded;
  return DeckEngine.create(title, theme, 1);
}
