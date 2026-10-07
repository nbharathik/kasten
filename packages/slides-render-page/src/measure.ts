// How big the words of every element come out, for lint. The engine says what to measure (`lintProbes`), the
// editor's own measurer draws each piece the way a slide draws it and reads the boxes; this only asks it for every
// slide, and waits for the fonts so that the sizes are the ones the finished slide has.

import type { DeckEngine, Measures } from "@kasten-slides/wasm";
import { loadMeasurer, measureProbes } from "@kasten-slides/react/render-host";

import { frame } from "./settle.ts";

/** How many times the deck is measured again because a font arrived in the meantime. */
const MOST_ROUNDS = 4;

function take(engine: DeckEngine): Measures {
  const slides: Measures["slides"] = {};
  for (const slide of engine.deck.slides) {
    const sizes = measureProbes(engine.deck.theme, engine.lintProbes(slide.id));
    if (Object.keys(sizes).length > 0) slides[slide.id] = sizes;
  }
  return { slides };
}

export async function measureDeck(engine: DeckEngine): Promise<Measures> {
  await loadMeasurer();
  // The first pass is what makes the browser fetch the fonts the words are set in; the next ones see them.
  let measures = take(engine);
  for (let round = 0; round < MOST_ROUNDS; round++) {
    await document.fonts?.ready;
    await frame();
    const again = take(engine);
    const settled = JSON.stringify(again) === JSON.stringify(measures);
    measures = again;
    if (settled) break;
  }
  return measures;
}
