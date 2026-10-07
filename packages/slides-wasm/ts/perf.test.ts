import { readFile } from "node:fs/promises";
import { beforeAll, expect, it } from "vitest";

import { DeckEngine, loadSlides } from "./index.ts";

beforeAll(async () => {
  await loadSlides(await readFile(new URL("../pkg/slides_wasm_bg.wasm", import.meta.url)));
});

/** A deck the size of a long talk: 50 slides of 20 text boxes. */
function bigDeck(): DeckEngine {
  const engine = DeckEngine.create("Big", "Light", 9);
  for (let i = 0; i < 49; i++) engine.apply("add_slide", { layout: "blank" });
  for (const slide of engine.deck.slides) {
    const elements = Array.from({ length: 20 }, (_, i) => ({
      type: "text" as const,
      id: "",
      x: (i % 5) * 180,
      y: Math.floor(i / 5) * 120,
      w: 160,
      h: 90,
      text: { paragraphs: [{ runs: [{ t: `Box ${i}` }] }] },
    }));
    engine.apply("add_elements", { slide: slide.id, elements });
  }
  return engine;
}

// Applying an operation, and getting back what changed, has to be fast enough
// that dragging feels instant: the budget is 2 ms at the 95th percentile, and
// a build fails when it is missed by more than 20%.
it("applies an operation in under 2 ms at the 95th percentile", () => {
  const engine = bigDeck();
  const slides = engine.deck.slides;
  const times: number[] = [];
  for (let i = 0; i < 2400; i++) {
    const slide = slides[i % slides.length];
    const element = slide?.elements[(i * 7) % 20];
    if (!slide || !element) throw new Error("the big deck has slides and elements");
    const start = performance.now();
    engine.apply("transform_elements", { slide: slide.id, items: [{ id: element.id, x: (i * 13) % 800, y: (i * 29) % 400 }] });
    if (i >= 400) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)] ?? Infinity;
  console.log(`transform_elements on 50 slides of 20 elements: p50 ${times[Math.floor(times.length / 2)]?.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms`);
  expect(p95).toBeLessThan(2.4);
});
