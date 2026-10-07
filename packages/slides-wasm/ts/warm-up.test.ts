// Its own file because the module is loaded once for each: what is cold here has not been used by another test.
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";

import { DeckEngine, expandComposite, loadSlides, warmUp } from "./index.ts";
import type { Element, Theme } from "./index.ts";

let theme: Theme;

beforeAll(async () => {
  await loadSlides(await readFile(new URL("../pkg/slides_wasm_bg.wasm", import.meta.url)));
  theme = DeckEngine.create("Talk", "Light", 31).deck.theme;
});

const code = (language: string, source: string): Element =>
  ({ type: "code", id: "e-c", x: 64, y: 148, w: 832, h: 300, language, code: source }) as unknown as Element;

const time = <T>(run: () => T): [T, number] => {
  const start = performance.now();
  const value = run();
  return [value, performance.now() - start];
};

describe("warming up", () => {
  it("takes the slow first use of the code colouring away from the first code block", () => {
    const [, warming] = time(warmUp);
    const [group, first] = time(() => expandComposite(theme, "blank", code("python", "def f(x):\n    return x + 1  # one\n")));
    const [, next] = time(() => expandComposite(theme, "blank", code("python", "x = 1\ny = 2\n")));
    console.info(`warm up ${warming.toFixed(1)} ms, then the first code block ${first.toFixed(1)} ms and the next ${next.toFixed(1)} ms`);
    expect(group?.type).toBe("group");
    // What the first block used to wait for is spent in the warm-up now, and the block costs a fraction of it. Both are
    // read from the same clock, so a machine that is busy (it can double a time) does not tip the comparison either way,
    // and a warm-up that did nothing fails the first line as well as the second.
    expect(warming).toBeGreaterThan(next * 10);
    expect(first).toBeLessThan(warming / 2);
  });

  it("changes nothing that is drawn and is cheap to do again", () => {
    const element = code("python", "a = [1, 2, 3]  # list\n");
    const before = JSON.stringify(expandComposite(theme, "blank", { ...element }));
    const [, again] = time(warmUp);
    expect(JSON.stringify(expandComposite(theme, "blank", { ...element }))).toBe(before);
    expect(again).toBeLessThan(100);
  });
});
