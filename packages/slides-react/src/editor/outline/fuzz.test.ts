// The outline's writer against the engine's reader, on random texts. It runs
// once the engine's `set_text` reads Markdown (see roundtrip.test.ts).

import type { Text } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { openDeck, parserIsIn } from "../filmstrip/test-support.ts";
import { disagreements } from "./fuzz-support.ts";

/** A function that has the engine read some Markdown into a text box, and answers what it made of it. */
async function reader(): Promise<(markdown: string) => Text> {
  const { session, engine } = await openDeck({ slides: 2 });
  const slide = session.deck.slides[1]!;
  const id = engine.apply("add_elements", { slide: slide.id, elements: [{ type: "text", id: "", x: 10, y: 10, w: 300, h: 100, text: { paragraphs: [{ runs: [{ t: "" }] }] } }] as never }).output.ids[0]!;
  return (markdown) => {
    engine.apply("set_text", { slide: slide.id, id, markdown });
    return (engine.deck.slides[1]!.elements.find((e) => e.id === id) as { text: Text }).text;
  };
}

const read = await reader();
const parser = await parserIsIn();

describe.skipIf(!parser)("random texts, once the parser is in", () => {
  for (const seed of [1, 424242]) {
    it(`are read back as they were written, and written the same again (seed ${seed})`, () => {
      const { different, unsteady } = disagreements(read, seed, 2500);
      expect(different.slice(0, 3)).toEqual([]);
      expect(unsteady.slice(0, 3)).toEqual([]);
    });
  }
});
