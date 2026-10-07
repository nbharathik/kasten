import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";

import { DeckEngine, SlidesError, importPptx, loadSlides, planImport, renamePictures, similarRuns } from "./index.ts";

beforeAll(async () => {
  await loadSlides(await readFile(new URL("../pkg/slides_wasm_bg.wasm", import.meta.url)));
});

/** A real PNG, 3 by 2 pixels. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x02, 0x08, 0x02, 0x00, 0x00, 0x00, 0x12, 0x16, 0xf1, 0x4d, 0x00, 0x00, 0x00, 0x15, 0x49, 0x44, 0x41,
  0x54, 0x78, 0xda, 0x63, 0x94, 0xab, 0x38, 0xc1, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc4, 0x00, 0x03, 0x00, 0x18, 0x2e, 0x01, 0x62, 0x87, 0x96, 0x3e, 0xbf, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

/** A deck with a titled slide and a slide with a picture, sent to a file. */
function pptxOfATalk(): Uint8Array {
  const engine = DeckEngine.create("Talk", "Light", 4);
  engine.apply("add_slide", { layout: "title-body", content: { title: "Results", body: "- one\n- two" } });
  const slide = engine.apply("add_slide", { layout: "blank" }).output.slide;
  engine.apply("add_elements", { slide, elements: [{ type: "image", id: "e-pic", x: 100, y: 100, w: 300, h: 200, src: "assets/pic.png", alt: "A picture" }] });
  return engine.exportPptx(new Map([["assets/pic.png", PNG]])).bytes;
}

describe("importing a PowerPoint file", () => {
  it("reads a deck, its pictures and a report of what it did", () => {
    const imported = importPptx(pptxOfATalk(), { seed: 5, title: "From a file" });
    expect(imported.title).toBe("From a file");
    expect(imported.report.slides).toBe(3);
    expect(imported.report.pictures).toBe(1);
    expect(imported.report.warnings).toEqual([]);
    expect(imported.media).toHaveLength(1);
    const [picture] = imported.media;
    expect(picture?.path).toMatch(/^assets\/.*\.png$/);
    expect(picture?.bytes).toEqual(PNG);
    const opened = DeckEngine.open(imported.deck);
    expect(opened.deck.slides.map((s) => s.layout)).toEqual(["title", "title-body", "blank"]);
    const image = opened.deck.slides[2]?.elements.find((e) => e.type === "image");
    expect(image?.type === "image" && image.src).toBe(picture?.path);
  });

  it("is called what the person asked, else what the file calls itself, else the name it is given", () => {
    const bytes = pptxOfATalk();
    expect(importPptx(bytes, { name: "the-file" }).title).toBe("Talk");
    expect(importPptx(bytes, { title: "Asked", name: "the-file" }).title).toBe("Asked");
  });

  it("makes the same deck for the same seed and another for another", () => {
    const bytes = pptxOfATalk();
    expect(importPptx(bytes, { seed: 5 }).deck).toBe(importPptx(bytes, { seed: 5 }).deck);
    expect(importPptx(bytes, { seed: 6 }).deck).not.toBe(importPptx(bytes, { seed: 5 }).deck);
  });

  it("says why a file that is not a presentation cannot be read", () => {
    const refused = (): unknown => importPptx(new TextEncoder().encode("this is not a zip file"));
    expect(refused).toThrow(SlidesError);
    expect(refused).toThrow(/zip|presentation|PowerPoint/i);
    const old = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array<number>(600).fill(0)]);
    expect(() => importPptx(old)).toThrow(/\.ppt|older/);
  });

  it("changes the paths of pictures to the names the host gave them", () => {
    const imported = importPptx(pptxOfATalk());
    const from = imported.media[0]?.path ?? "";
    const text = renamePictures(imported.deck, new Map([[from, "assets/mine.png"]]));
    expect(text).not.toContain(from);
    expect(text).toContain("assets/mine.png");
    expect(DeckEngine.open(text).deck.slides).toHaveLength(3);
    expect(renamePictures(imported.deck, new Map())).toBe(imported.deck);
  });
});

describe("putting an imported deck into the deck being edited", () => {
  const modes = ["add", "replace", "merge"] as const;

  it("is one step to undo, in every mode, and names the slides it made", () => {
    const imported = importPptx(pptxOfATalk(), { markers: true }).deck;
    for (const mode of modes) {
      const engine = DeckEngine.create("Mine", "Serif", 9);
      engine.apply("add_slide", { layout: "title-body", content: { title: "Mine" } });
      const before = engine.save();
      const plan = planImport(before, imported, mode);
      expect(plan.operations.length).toBeGreaterThan(0);
      engine.applyBatch(plan.operations);
      for (const id of plan.slides) expect(engine.deck.slides.some((s) => s.id === id)).toBe(true);
      expect(engine.deck.slides.length).toBeGreaterThanOrEqual(3);
      engine.undo();
      expect(engine.save()).toBe(before);
    }
  });

  it("keeps the deck's theme when slides are added and takes the file's when the deck is replaced", () => {
    const imported = importPptx(pptxOfATalk()).deck;
    const mine = DeckEngine.create("Mine", "Serif", 9);
    const existing = mine.save();
    mine.applyBatch(planImport(existing, imported, "add").operations);
    expect(mine.deck.theme.name).toBe("Serif");
    expect(mine.deck.slides).toHaveLength(4);
    const other = DeckEngine.create("Mine", "Serif", 9);
    other.applyBatch(planImport(existing, imported, "replace").operations);
    expect(other.deck.theme.name).toBe("Light");
    expect(other.deck.slides).toHaveLength(3);
  });

  it("adds after the slide named", () => {
    const imported = importPptx(pptxOfATalk()).deck;
    const engine = DeckEngine.create("Mine", "Light", 9);
    engine.apply("add_slide", { layout: "title-only", content: { title: "Last" } });
    const first = engine.deck.slides[0]?.id ?? "";
    engine.applyBatch(planImport(engine.save(), imported, "add", first).operations);
    expect(engine.deck.slides).toHaveLength(5);
    expect(engine.deck.slides[4]?.layout).toBe("title-only");
  });

  it("keeps the ids of a deck sent to a file and read back as a new version of itself", () => {
    const engine = DeckEngine.create("Talk", "Light", 4);
    engine.apply("add_slide", { layout: "title-body", content: { title: "Results", body: "- one\n- two" } });
    const bytes = engine.exportPptx().bytes;
    const before = engine.deck.slides.map((s) => [s.id, s.elements.map((e) => e.id)]);
    const version = importPptx(bytes, { markers: true }).deck;
    engine.applyBatch(planImport(engine.save(), version, "merge").operations);
    expect(engine.deck.slides.map((s) => [s.id, s.elements.map((e) => e.id)])).toEqual(before);
  });

  it("refuses a mode it does not know", () => {
    const text = DeckEngine.create("A", "Light", 1).save();
    // @ts-expect-error a mode that is not one of the three
    expect(() => planImport(text, text, "sideways")).toThrow(/sideways/);
  });
});

describe("runs of slides that repeat each other", () => {
  it("finds a build made by copying a slide and changing one box", () => {
    const engine = DeckEngine.create("Builds", "Light", 3);
    for (const word of ["a", "b", "c"]) {
      const slide = engine.apply("add_slide", { layout: "title-only", content: { title: "Same" } }).output.slide;
      const boxes = [0, 1, 2, 3, 4].map((i) => ({
        type: "text" as const,
        id: `e-box${i}`,
        x: 40 + i * 120,
        y: 200,
        w: 100,
        h: 40,
        text: { paragraphs: [{ runs: [{ t: i === 1 ? `changes ${word}` : `box ${i}` }] }] },
      }));
      engine.apply("add_elements", { slide, elements: boxes });
    }
    expect(similarRuns(engine.save())).toEqual([[1, 2, 3]]);
    const ids = engine.deck.slides.slice(1).map((s) => s.id);
    engine.apply("collapse_slides", { slides: ids });
    expect(engine.deck.slides).toHaveLength(2);
    expect(engine.deck.slides[1]?.steps).toBe(2);
  });
});
