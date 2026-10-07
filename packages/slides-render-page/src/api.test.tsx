import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSlides } from "@kasten-slides/wasm";

import { createApi } from "./api.tsx";
import type { RenderApi } from "./types.ts";

let composites = "";

const BIB = `@inproceedings{vaswani2017,
  title     = {Attention is all you need},
  author    = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob},
  booktitle = {Advances in Neural Information Processing Systems},
  year      = {2017}
}`;
const here = dirname(fileURLToPath(import.meta.url));

beforeAll(async () => {
  // A browser finishes loading a picture (or fails to); this test page never starts, so no picture is ever waited for.
  Object.defineProperty(HTMLImageElement.prototype, "complete", { get: () => true, configurable: true });
  await loadSlides(await readFile(resolve(here, "../../slides-wasm/pkg/slides_wasm_bg.wasm")));
  composites = await readFile(resolve(here, "../../../fixtures/decks/composites.deck"), "utf8");
});

async function opened(): Promise<{ api: RenderApi; stage: HTMLElement }> {
  const stage = document.createElement("div");
  document.body.append(stage);
  const api = createApi(stage);
  await api.ready;
  await api.load(composites);
  return { api, stage };
}

describe("the calls the driver makes", () => {
  it("open a deck and say what is in it", async () => {
    const stage = document.createElement("div");
    const api = createApi(stage);
    const info = await api.load(composites);
    expect(info.title).toBe("Composite elements");
    expect(info.slides).toBe(12);
    expect(info.size).toEqual({ w: 960, h: 540 });
    expect(info.outline[3]).toMatchObject({ steps: 4, hidden: false, backup: false });
  });

  it("refuse a deck that is not one, and everything until one is open", async () => {
    const stage = document.createElement("div");
    const api = createApi(stage);
    await expect(api.load("not a deck")).rejects.toThrow();
    await expect(api.slide(0)).rejects.toThrow("No deck is open");
    expect(() => api.pages({ scope: "all", steps: "final" })).toThrow("No deck is open");
  });

  it("draw a slide at a step, and say what cannot be drawn", async () => {
    const { api, stage } = await opened();
    const shown = await api.slide(3, 2);
    expect(shown).toMatchObject({ index: 3, step: 2, steps: 4, width: 960, height: 540 });
    expect(stage.style.width).toBe("960px");
    expect(stage.querySelectorAll(".ks-slide")).toHaveLength(1);
    expect((await api.slide(3)).step).toBe(4);
    expect((await api.slide(0)).step).toBeNull();
    await expect(api.slide(99)).rejects.toThrow("There is no slide 100: the deck has 12.");
    await expect(api.slide(3, 9)).rejects.toThrow("steps 0 to 4");
    await expect(api.slide(0, 1)).rejects.toThrow("no steps");
  });

  it("draw every slide in a grid", async () => {
    const { api, stage } = await opened();
    const grid = await api.grid(null, null);
    expect(grid).toMatchObject({ width: 1600, columns: 4, slides: 12 });
    expect(stage.querySelectorAll("figure")).toHaveLength(12);
    expect(stage.textContent).toContain("A walkthrough of code");
    expect(stage.textContent).toContain("4 steps");
    expect((await api.grid(2, 1000)).width).toBe(1000);
  });

  it("list the pictures of a PNG export as the editor names them", async () => {
    const { api } = await opened();
    const all = api.pages({ scope: "all", steps: "final" });
    expect(all).toHaveLength(12);
    expect(all[0]).toEqual({ index: 0, step: null, number: 1, name: "slide-01.png" });
    expect(all[3]).toEqual({ index: 3, step: 4, number: 4, name: "slide-04.png" });
    const each = api.pages({ scope: "all", steps: "each" });
    expect(each).toHaveLength(16);
    expect(each.filter((p) => p.index === 3).map((p) => p.name)).toEqual(["slide-04-step-0.png", "slide-04-step-1.png", "slide-04-step-2.png", "slide-04-step-3.png", "slide-04-step-4.png"]);
    expect(api.pages({ scope: "current", steps: "final", current: 5 })).toEqual([{ index: 5, step: null, number: 6, name: "slide-06.png" }]);
    expect(() => api.pages({ scope: "current", steps: "final", current: 40 })).toThrow("There is no slide 41: the deck has 12.");
  });

  it("lay the deck out for printing and take it away again", async () => {
    const { api } = await opened();
    const printed = await api.print({ steps: "final", notes: false });
    expect(printed).toEqual({ pages: 12, width: 960, height: 540 });
    expect(document.querySelectorAll(".ks-print-page")).toHaveLength(12);
    expect(document.title).toBe("Composite elements");
    api.unprint();
    expect(document.querySelectorAll(".ks-print-page")).toHaveLength(0);
    expect((await api.print({ steps: "each", notes: true })).pages).toBe(16);
    await api.slide(0);
    expect(document.querySelectorAll(".ks-print-page")).toHaveLength(0);
  });

  it("write a citation from the bibliography given with the deck, and as its keys without one", async () => {
    const stage = document.createElement("div");
    document.body.append(stage);
    const api = createApi(stage);
    await api.ready;
    // The tenth slide cites `vaswani2017` (and others) in three ways.
    await api.load(composites);
    await api.slide(9);
    expect(stage.textContent).toContain("(vaswani2017; devlin2019)");
    expect(stage.textContent).not.toContain("Vaswani et al.");
    await api.load(composites, BIB);
    await api.slide(9);
    expect(stage.textContent).toContain("Vaswani et al., 2017 (NeurIPS)");
    expect(stage.textContent).toContain("devlin2019?");
    // A new bibliography is drawn from the next time, without opening the deck again; none gives the keys back.
    await api.references(null);
    await api.slide(9);
    expect(stage.textContent).toContain("(vaswani2017; devlin2019)");
    await api.references(BIB);
    await api.slide(9);
    expect(stage.textContent).toContain("Vaswani et al., 2017 (NeurIPS)");
    // Opening a deck says what the bibliography is again: a deck opened without one has none.
    await api.load(composites);
    await api.slide(9);
    expect(stage.textContent).not.toContain("Vaswani et al.");
    await api.references(null);
  });
});
