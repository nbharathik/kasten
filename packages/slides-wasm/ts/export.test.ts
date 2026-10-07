import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";

import { DeckEngine, type Element, expandComposite, loadSlides, picturePaths, readingOrder } from "./index.ts";

beforeAll(async () => {
  await loadSlides(await readFile(new URL("../pkg/slides_wasm_bg.wasm", import.meta.url)));
});

/** A one-pixel PNG. */
const PIXEL = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

const names = (bytes: Uint8Array): string => new TextDecoder("latin1").decode(bytes);

function deckWithPicture(): DeckEngine {
  const engine = DeckEngine.create("Export", "Light", 7);
  const slide = engine.apply("add_slide", { layout: "blank" }).output.slide;
  engine.apply("set_notes", { slide, notes: "Say hello." });
  engine.apply("add_elements", { slide, elements: [{ type: "image", id: "e-pixel", src: "assets/pixel.png", x: 40, y: 40, w: 200, h: 120 }] });
  return engine;
}

describe("the PowerPoint export", () => {
  it("makes a file of native parts, with the notes and the picture", () => {
    const engine = deckWithPicture();
    const { bytes, warnings } = engine.exportPptx(new Map([["assets/pixel.png", PIXEL]]));
    expect(names(bytes.subarray(0, 2))).toBe("PK");
    const text = names(bytes);
    for (const part of ["ppt/presentation.xml", "ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/notesSlides/notesSlide2.xml", "ppt/media/image1.png"]) {
      expect(text, part).toContain(part);
    }
    expect(warnings).toEqual([]);
  });

  it("puts a grey box and a warning where a picture was not given", () => {
    const { bytes, warnings } = deckWithPicture().exportPptx();
    expect(names(bytes)).not.toContain("ppt/media/image1.png");
    expect(warnings.map((w) => w.message).join("\n")).toContain("assets/pixel.png");
  });

  it("leaves out the notes, and the hidden slides, when asked", () => {
    const engine = deckWithPicture();
    const slide = engine.deck.slides[1]!.id;
    engine.apply("set_slide_flags", { ids: [slide], hidden: true });
    const full = names(engine.exportPptx(new Map([["assets/pixel.png", PIXEL]])).bytes);
    const lean = names(engine.exportPptx(new Map([["assets/pixel.png", PIXEL]]), { notes: false, includeHidden: false }).bytes);
    expect(full).toContain("ppt/slides/slide2.xml");
    expect(lean).not.toContain("ppt/slides/slide2.xml");
    expect(lean).not.toContain("notesSlide");
  });

  it("finds the pictures a deck names", () => {
    expect(picturePaths(deckWithPicture().deck)).toEqual(["assets/pixel.png"]);
    expect(picturePaths(DeckEngine.create("None", "Light", 1).deck)).toEqual([]);
  });

  it("takes the same time however often it is asked: the same deck and pictures give the same bytes", () => {
    const engine = deckWithPicture();
    const pictures = new Map([["assets/pixel.png", PIXEL]]);
    expect(names(engine.exportPptx(pictures).bytes)).toBe(names(engine.exportPptx(pictures).bytes));
  });
});

describe("composites", () => {
  it("expand into the group of their parts, and only composites do", () => {
    const engine = DeckEngine.create("Composite", "Light", 9);
    const slide = engine.deck.slides[0]!.id;
    const added = engine.apply("add_elements", { slide, elements: [{ type: "code", id: "e-code", x: 40, y: 40, w: 400, h: 200, language: "python", code: "print(1)" }] });
    const [code] = added.output.ids;
    expect(code).toBe("e-code");
    const element = engine.deck.slides[0]!.elements.find((e) => e.id === "e-code")!;
    const group = expandComposite(engine.deck.theme, engine.deck.slides[0]!.layout, element);
    expect(group?.type).toBe("group");
    expect(group?.id).toBe("e-code");
    // Asked again about the same element, the answer is the same object.
    expect(expandComposite(engine.deck.theme, engine.deck.slides[0]!.layout, element)).toBe(group);
    const title = engine.deck.slides[0]!.elements[0]!;
    expect(expandComposite(engine.deck.theme, engine.deck.slides[0]!.layout, title)).toBeNull();
  });
});

describe("slides with steps", () => {
  /** A deck of a title slide and a slide of three boxes that appear one by one. */
  function stepped(): DeckEngine {
    const engine = DeckEngine.create("Steps", "Light", 5);
    const slide = engine.apply("add_slide", { layout: "title-only", content: { title: "ReAct" } }).output.slide;
    const box = (label: string, x: number): Element => ({ type: "shape", id: "", shape: "rect", x, y: 200, w: 200, h: 100, text: { paragraphs: [{ runs: [{ t: label }] }] } }) as Element;
    const ids = engine.apply("add_elements", { slide, elements: [box("one", 40), box("two", 300), box("three", 560)] }).output.ids;
    const built = engine.apply("build_steps", { slide, ids, recipe: "reveal" }).output;
    expect(built.steps).toBe(3);
    return engine;
  }

  const slideParts = (bytes: Uint8Array): number => [...names(bytes).matchAll(/ppt\/slides\/slide(\d+)\.xml/g)].reduce((most, m) => Math.max(most, Number(m[1])), 0);

  it("are a slide for each state in the file, unless the last is asked for", () => {
    const engine = stepped();
    expect(slideParts(engine.exportPptx().bytes)).toBe(1 + 4);
    expect(slideParts(engine.exportPptx(new Map(), { steps: "expand" }).bytes)).toBe(1 + 4);
    expect(slideParts(engine.exportPptx(new Map(), { steps: "final" }).bytes)).toBe(2);
  });

  it("carry notes on every page of the slide, where the marker says which state it is", () => {
    // Every slide names itself in its notes, so the title slide has a page of notes too.
    const text = names(stepped().exportPptx().bytes);
    for (const page of [1, 2, 3, 4, 5]) expect(text, `page ${page}`).toContain(`ppt/notesSlides/notesSlide${page}.xml`);
    expect(text).not.toContain("ppt/notesSlides/notesSlide6.xml");
    const last = names(stepped().exportPptx(new Map(), { steps: "final" }).bytes);
    expect(last).toContain("ppt/notesSlides/notesSlide2.xml");
    expect(last).not.toContain("ppt/notesSlides/notesSlide3.xml");
  });

  it("refuse a word for the steps option that is not one of the two", () => {
    expect(() => stepped().exportPptx(new Map(), { steps: "some" as never })).toThrow(/expand|final/);
  });

  it("read in the order the builds take them", () => {
    // Two boxes side by side at the top, a third under them, and one with no place.
    expect(readingOrder([{ x: 400, y: 300, w: 100, h: 50 }, { x: 60, y: 100, w: 100, h: 50 }, null, { x: 400, y: 100, w: 100, h: 50 }])).toEqual([1, 3, 0, 2]);
    expect(readingOrder([])).toEqual([]);
  });
});
