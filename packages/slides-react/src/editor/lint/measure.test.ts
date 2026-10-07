import type { DeckEngine } from "@kasten-slides/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import { newDeck } from "../../test/engine.ts";
import { loadMeasurer, measureProbes, measurerReady } from "./measure.ts";

let engine: DeckEngine;
let slide: string;

beforeAll(async () => {
  engine = await newDeck("Measure");
  slide = engine.apply("add_slide", { layout: "blank" }).output.slide;
  engine.apply("add_elements", {
    slide,
    elements: [
      { type: "text", id: "words", x: 40, y: 40, w: 300, h: 80, text: { paragraphs: [{ runs: [{ t: "Some words" }] }, { runs: [{ t: "and more" }] }] } },
      { type: "shape", id: "bubble", shape: "ellipse", x: 400, y: 40, w: 200, h: 100, text: { paragraphs: [{ runs: [{ t: "Inside" }] }] } },
      {
        type: "table",
        id: "grid",
        x: 40,
        y: 200,
        w: 400,
        h: 90,
        columns: [200, 200],
        rows: [{ cells: [{ text: { paragraphs: [{ runs: [{ t: "short" }] }] } }, { text: { paragraphs: [{ runs: [{ t: "a much longer cell" }] }] } }] }],
      },
    ],
  });
});

describe("measuring text in the browser", () => {
  it("needs its renderer loaded first", () => {
    expect(measurerReady()).toBe(false);
    expect(() => measureProbes(engine.deck.theme, engine.lintProbes(slide))).toThrowError(/loadMeasurer/);
  });

  it("draws each piece of text twice, off the page, and reads both boxes", async () => {
    await loadMeasurer();
    expect(measurerReady()).toBe(true);
    const seen: { kind: string; words: string; attached: boolean; room: string }[] = [];
    const sizeOf = (node: Element) => {
      const wrapper = node.parentElement!;
      seen.push({ kind: wrapper.className, words: node.textContent ?? "", attached: node.isConnected, room: wrapper.getAttribute("style") ?? "" });
      return { width: 100 + (node.textContent ?? "").length, height: 10 * (node.textContent ?? "").length };
    };
    const probes = engine.lintProbes(slide);
    const measures = measureProbes(engine.deck.theme, probes, { sizeOf });

    // A text box of two paragraphs, an ellipse, and a table of two cells: five pieces, each drawn for its height and for its width.
    expect(probes.map((p) => [p.id, p.parts.length])).toEqual([
      ["words", 1],
      ["bubble", 1],
      ["grid", 2],
    ]);
    expect(seen.map((s) => s.kind)).toEqual(["ks-mh", "ks-mw", "ks-mh", "ks-mw", "ks-mh", "ks-mw", "ks-mh", "ks-mw"].slice(0, seen.length));
    expect(seen).toHaveLength(8);
    expect(seen.every((s) => s.attached), "laid out in the page, or there would be nothing to read").toBe(true);
    expect(seen[0]).toMatchObject({ kind: "ks-mh", words: "Some wordsand more", room: "width:300px" });
    // The ellipse is laid out in the rectangle inside it.
    expect(seen[2]?.room).toMatch(/^width:141\.42\d*px$/);
    expect(document.querySelector(".ks-measure"), "nothing is left on the page").toBeNull();

    // The biggest of a table's cells, and the room each element was given.
    const words = "Some wordsand more".length;
    expect(measures.words).toEqual({ textWidth: 100 + words, textHeight: 10 * words, areaWidth: 300, areaHeight: 80 });
    expect(measures.grid).toMatchObject({ textWidth: 100 + "a much longer cell".length, textHeight: 10 * "a much longer cell".length, areaWidth: 400, areaHeight: 90 });
    expect(Object.keys(measures)).toEqual(["words", "bubble", "grid"]);
  });

  it("draws with the box and the type a slide draws with, so the numbers are the slide's", async () => {
    await loadMeasurer();
    let box = "";
    let paragraph = "";
    measureProbes(engine.deck.theme, engine.lintProbes(slide).slice(0, 1), {
      sizeOf: (node) => {
        box ||= node.getAttribute("style") ?? "";
        paragraph ||= node.querySelector(".ks-p")?.getAttribute("style") ?? "";
        return { width: 0, height: 0 };
      },
    });
    expect(box).toContain("padding:4.8px 9.6px 4.8px 9.6px");
    expect(box).toContain("white-space:pre-wrap");
    expect(paragraph).toMatch(/font-size:29\.3\d*px/);
    expect(paragraph).toContain("font-family");
  });

  it("lays out the narrow words of a piece for its width, where an address may be broken, and its own words for its height", async () => {
    await loadMeasurer();
    const words = (t: string) => ({ paragraphs: [{ runs: [{ t }] }] });
    const address = "https://example.com/a/long/path";
    const broken = [...address].join("\u200b");
    const probes = [
      { id: "address", areaWidth: 200, areaHeight: 60, parts: [{ text: words(address), base: "body", narrow: words(broken) }] },
      { id: "prose", areaWidth: 200, areaHeight: 60, parts: [{ text: words("Some words"), base: "body" }] },
    ];
    const seen: Record<string, string[]> = {};
    measureProbes(engine.deck.theme, probes, {
      sizeOf: (node) => {
        const kind = node.parentElement!.className;
        (seen[`${kind}:${node.textContent}`] ??= []).push(kind);
        return { width: 1, height: 1 };
      },
    });
    expect(Object.keys(seen).sort()).toEqual([`ks-mh:${address}`, `ks-mh:Some words`, `ks-mw:${broken}`, `ks-mw:Some words`].sort());
  });

  it("measures nothing for nothing, and can be laid out somewhere else", async () => {
    await loadMeasurer();
    expect(measureProbes(engine.deck.theme, [])).toEqual({});
    const parent = document.createElement("section");
    document.body.append(parent);
    let where: Element | null = null;
    measureProbes(engine.deck.theme, engine.lintProbes(slide).slice(0, 1), {
      parent,
      sizeOf: (node) => {
        where = node.closest(".ks-measure")?.parentElement ?? null;
        return { width: 1, height: 1 };
      },
    });
    expect(where).toBe(parent);
    parent.remove();
  });
});
