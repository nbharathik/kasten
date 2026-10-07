// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import type { Deck } from "@kasten-slides/wasm";
import { afterEach, describe, expect, it } from "vitest";

import { themeNamed } from "../text/test-support.ts";
import { mountPrintLayout, pagesOf } from "./print.tsx";

afterEach(cleanup);

/** A deck of four slides: plain, with three steps, hidden, and a backup. */
async function deckOf(): Promise<Deck> {
  const slide = (id: string, extra: Record<string, unknown> = {}) => ({ id, layout: "blank", elements: [], notes: `notes of ${id}`, ...extra });
  return {
    format: "kasten-deck",
    formatVersion: 1,
    title: "Print",
    size: { w: 960, h: 540 },
    theme: await themeNamed("Light"),
    present: { slideNumbers: true, stepLabel: "Step {n} / {total}" },
    slides: [slide("s-1"), slide("s-2", { steps: 3 }), slide("s-3", { hidden: true }), slide("s-4", { backup: true })],
  } as unknown as Deck;
}

describe("the pages of a printout", () => {
  it("are the slides that are not hidden, each once at its last step", async () => {
    const pages = pagesOf(await deckOf(), { steps: "final", notes: false });
    expect(pages.map((p) => [p.slide.id, p.step])).toEqual([["s-1", undefined], ["s-2", 3], ["s-4", undefined]]);
  });

  it("are one for every step of a slide that has steps, when asked", async () => {
    const pages = pagesOf(await deckOf(), { steps: "each", notes: false });
    expect(pages.map((p) => [p.slide.id, p.step])).toEqual([["s-1", undefined], ["s-2", 0], ["s-2", 1], ["s-2", 2], ["s-2", 3], ["s-4", undefined]]);
  });

  it("number slides among those printed", async () => {
    expect(pagesOf(await deckOf(), { steps: "final", notes: false }).map((p) => p.number)).toEqual([1, 2, 3]);
  });
});

describe("the printout in the page", () => {
  it("is put in and taken out again, with its own page size", async () => {
    const unmount = await mountPrintLayout(await deckOf(), () => undefined, { steps: "final", notes: false });
    expect(document.querySelectorAll(".ks-print-page")).toHaveLength(3);
    expect(document.querySelector("style[data-ks-print]")?.textContent).toContain("size: 960px 540px");
    unmount();
    expect(document.querySelector(".ks-print-root")).toBeNull();
    expect(document.querySelector("style[data-ks-print]")).toBeNull();
  });

  it("puts the speaker notes under the slide on a handout", async () => {
    const unmount = await mountPrintLayout(await deckOf(), () => undefined, { steps: "final", notes: true });
    expect(document.querySelector("style[data-ks-print]")?.textContent).toContain("size: 794px 1123px");
    expect(document.querySelectorAll(".ks-print-notes")[0]?.textContent).toContain("notes of s-1");
    unmount();
  });
});
