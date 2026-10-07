import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";

import { DeckEngine, SlidesError, loadSlides, setReferences } from "./index.ts";
import type { Measures } from "./index.ts";

beforeAll(async () => {
  await loadSlides(await readFile(new URL("../pkg/slides_wasm_bg.wasm", import.meta.url)));
});

/** A deck with a blank slide that has one text box hanging off the right edge. */
function brokenDeck(): { engine: DeckEngine; slide: string } {
  const engine = DeckEngine.create("Lint", "Light", 5);
  const slide = engine.apply("add_slide", { layout: "blank" }).output.slide;
  engine.apply("add_elements", {
    slide,
    elements: [{ type: "text", id: "wide", x: 800, y: 100, w: 400, h: 60, text: { paragraphs: [{ runs: [{ t: "Off the edge" }] }] } }],
  });
  return { engine, slide };
}

describe("lint through the engine", () => {
  it("finds what is wrong with a slide and names the rules it could not check", () => {
    const { engine, slide } = brokenDeck();
    const report = engine.lintSlide(slide);
    expect(report.issues.map((i) => [i.rule, i.severity, i.element])).toEqual([["off-slide", "error", "wide"]]);
    expect(report.skipped.map((s) => s.rule)).toEqual(["text-overflow", "unresolved-citation"]);
    expect(report.issues[0]?.hint).toContain("bleed");
  });

  it("lists what to measure, and checks the sizes it is given against the boxes", () => {
    const { engine, slide } = brokenDeck();
    const probes = engine.lintProbes(slide);
    expect(probes).toHaveLength(1);
    expect(probes[0]).toMatchObject({ id: "wide", areaWidth: 400, areaHeight: 60 });
    expect(probes[0]?.parts[0]?.text.paragraphs[0]?.runs[0]?.t).toBe("Off the edge");
    const measures: Measures = { slides: { [slide]: { wide: { textWidth: 80, textHeight: 200 } } } };
    const report = engine.lintSlide(slide, { measures, refs: [] });
    expect(report.issues.map((i) => i.rule)).toEqual(["text-overflow", "off-slide"]);
    expect(report.skipped).toEqual([]);
  });

  it("works out the sizes itself for a page that cannot lay the text out, and lint takes them as it takes measured ones", () => {
    const { engine, slide } = brokenDeck();
    const estimate = engine.lintEstimate(slide);
    expect(estimate.estimated).toBe(true);
    expect(estimate.slides[slide]?.wide?.textWidth).toBeGreaterThan(0);
    const report = engine.lintSlide(slide, { measures: estimate, refs: [] });
    expect(report.issues.map((i) => i.rule)).toEqual(["off-slide"]);
    expect(report.skipped).toEqual([]);
    expect(() => engine.lintEstimate("s-nowhere")).toThrowError(/s-nowhere/);
  });

  it("lists a citation as the slide draws it, the work of the page's bibliography and not its key, and estimates the same words", () => {
    const { engine, slide } = brokenDeck();
    engine.apply("add_elements", {
      slide,
      elements: [{ type: "citation", id: "cite", x: 64, y: 480, w: 700, h: 30, keys: ["vaswani2017attention"] }],
    });
    const words = (): string =>
      engine
        .lintProbes(slide)
        .filter((probe) => probe.id.startsWith("cite"))
        .flatMap((probe) => probe.parts.flatMap((part) => part.text.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.t).join(""))))
        .join(" ");
    try {
      const bare = engine.lintEstimate(slide);
      expect(words()).toContain("vaswani2017attention");
      setReferences(
        "@inproceedings{vaswani2017attention, title={Attention is all you need}, author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob}, booktitle={Advances in Neural Information Processing Systems}, year={2017}}",
      );
      expect(words()).toContain("Vaswani et al., 2017 (NeurIPS)");
      expect(words()).not.toContain("vaswani2017attention");
      expect(engine.lintEstimate(slide)).not.toEqual(bare);
    } finally {
      setReferences(null);
    }
  });

  it("lints the whole deck, slide by slide", () => {
    const { engine, slide } = brokenDeck();
    const report = engine.lintDeck();
    expect(report.issues.filter((i) => i.slide === slide).map((i) => i.rule)).toEqual(["off-slide"]);
    expect(report.issues.some((i) => i.slide !== slide)).toBe(true);
  });

  it("refuses a slide that is not there and measures that are not measures, by name", () => {
    const { engine } = brokenDeck();
    expect(() => engine.lintSlide("s-nowhere")).toThrowError(SlidesError);
    expect(() => engine.lintProbes("s-nowhere")).toThrowError(/s-nowhere/);
    const wrong = { slides: 5 } as unknown as Measures;
    expect(() => engine.lintDeck({ measures: wrong })).toThrowError(/measures/);
  });
});
