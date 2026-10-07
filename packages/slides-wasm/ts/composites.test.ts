import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";

import { DeckEngine, expandComposite, loadSlides, operationSpecs } from "./index.ts";
import type { Element } from "./index.ts";

beforeAll(async () => {
  await loadSlides(await readFile(new URL("../pkg/slides_wasm_bg.wasm", import.meta.url)));
});

const BOX = { x: 64, y: 148, w: 832, h: 344 };

/** One composite of each kind, as an agent or the editor would add it. */
const SAMPLES: Record<string, Record<string, unknown>> = {
  code: { type: "code", language: "python", code: "def f(x):\n    return x + 1  # add one\n", lineNumbers: true },
  math: { type: "math", latex: "E = mc^2" },
  chat: { type: "chat", messages: [{ role: "user", text: "Hi" }, { role: "assistant", text: "Hello!" }] },
  "token-probs": { type: "token-probs", tokens: ["The", " cat"], next: [{ token: " sat", p: 0.6 }, { token: " ran", p: 0.4 }], chosen: 0 },
  "card-grid": { type: "card-grid", cards: [{ title: "One", body: "First" }, { title: "Two" }] },
  citation: { type: "citation", keys: ["a2020"], format: "short" },
  "step-label": { type: "step-label" },
  embed: { type: "embed", url: "https://example.com/demo", title: "Demo" },
  video: { type: "video", src: "assets/clip.mp4" },
};

const slideOf = (engine: DeckEngine, id: string) => engine.deck.slides.find((s) => s.id === id);

function deckWith(kind: string, extra: Record<string, unknown> = {}): { engine: DeckEngine; slide: string; element: Element } {
  const engine = DeckEngine.create("Composites", "Light", 21);
  const slide = engine.apply("add_slide", { layout: "blank" }).output.slide;
  const id = engine.apply("add_elements", { slide, elements: [{ id: "e-x", ...BOX, ...SAMPLES[kind], ...extra } as unknown as Element] }).output.ids[0]!;
  const element = slideOf(engine, slide)?.elements.find((e) => e.id === id);
  if (!element) throw new Error("the element is missing");
  return { engine, slide, element };
}

describe("composite elements through WebAssembly", () => {
  it("expands every kind to a group of primitives under the composite's own id", () => {
    for (const kind of Object.keys(SAMPLES)) {
      const { engine, element } = deckWith(kind);
      const group = expandComposite(engine.deck.theme, "blank", element);
      expect(group?.type, kind).toBe("group");
      if (group?.type !== "group") continue;
      expect(group.id).toBe("e-x");
      expect(group.children.length, kind).toBeGreaterThan(0);
      for (const part of group.children) {
        expect(part.id.startsWith("e-x."), `${kind}: ${part.id}`).toBe(true);
        expect(["text", "shape", "line", "image", "group"]).toContain(part.type);
      }
    }
  });

  it("colours code by its syntax and shrinks nothing that fits", () => {
    const { engine, element } = deckWith("code");
    const group = expandComposite(engine.deck.theme, "blank", element);
    const parts = group?.type === "group" ? group.children : [];
    const runs = parts.flatMap((p) => (p.type === "text" ? p.text.paragraphs.flatMap((para) => para.runs) : []));
    const colours = new Set(runs.map((r) => r.color));
    expect(colours.size).toBeGreaterThan(3);
    expect(runs.find((r) => r.t.includes("def"))?.color).not.toBe(runs.find((r) => r.t.includes("# add one"))?.color);
    expect(new Set(runs.map((r) => r.size))).toContain(16);
  });

  it("names the picture of a formula after the formula, the same every time", () => {
    const { engine, element } = deckWith("math");
    const once = expandComposite(engine.deck.theme, "blank", element);
    const again = expandComposite(engine.deck.theme, "blank", { ...element });
    const path = (g: Element | null) => (g?.type === "group" && g.children[0]?.type === "image" ? g.children[0].src : "");
    expect(path(once)).toMatch(/^math\/[0-9a-f]{16}\.png$/);
    expect(path(again)).toBe(path(once));
  });

  it("gives the slide the steps a code walkthrough needs, and one undo takes it back", () => {
    const engine = DeckEngine.create("Walk", "Light", 22);
    const slide = engine.apply("add_slide", { layout: "blank" }).output.slide;
    const before = engine.save();
    engine.apply("add_elements", { slide, elements: [{ id: "e-w", ...BOX, ...SAMPLES.code, focus: ["1", "2", "1-2"] } as unknown as Element] });
    expect(slideOf(engine, slide)?.steps).toBe(3);
    engine.undo();
    expect(engine.save()).toBe(before);
  });

  it("ungroups a composite to shapes in one undo step", () => {
    const { engine, slide } = deckWith("chat");
    expect(operationSpecs().map((s) => s.name)).toContain("expand_composite");
    const before = engine.save();
    const done = engine.apply("expand_composite", { slide, id: "e-x" });
    expect(done.output.group).toBe("e-x");
    expect(done.output.parts.length).toBeGreaterThan(1);
    const after = slideOf(engine, slide)?.elements.find((e) => e.id === "e-x");
    expect(after?.type).toBe("group");
    engine.undo();
    expect(engine.save()).toBe(before);
    expect(slideOf(engine, slide)?.elements.find((e) => e.id === "e-x")?.type).toBe("chat");
  });

  it("refuses to ungroup what is not a composite, saying what to use", () => {
    const engine = DeckEngine.create("Talk", "Light", 23);
    const slide = engine.deck.slides[0]!;
    const title = slide.elements[0]!;
    expect(() => engine.apply("expand_composite", { slide: slide.id, id: title.id })).toThrow(/not a composite/);
  });

  it("refuses to ungroup a formula, saying why and what to do, and changes nothing", () => {
    const { engine, slide } = deckWith("math");
    const before = engine.save();
    expect(() => engine.apply("expand_composite", { slide, id: "e-x" })).toThrow(/formula.*picture.*latex.*text box/s);
    expect(engine.save()).toBe(before);
  });

  it("marks the poster of a video and of a page as filling its box, so no one stretches it", () => {
    for (const [kind, extra] of [["video", { poster: "assets/still.png" }], ["embed", { poster: "assets/site.png" }]] as const) {
      const { engine, element } = deckWith(kind, extra);
      const group = expandComposite(engine.deck.theme, "blank", element);
      const first = group?.type === "group" ? group.children[0] : undefined;
      expect(first?.type, kind).toBe("image");
      expect((first as unknown as { fit?: string }).fit, kind).toBe("cover");
    }
  });

  it("colours the first code block in a fraction of a second, and later ones in milliseconds", () => {
    const { engine, element } = deckWith("code");
    const first = performance.now();
    expandComposite(engine.deck.theme, "blank", element);
    const cold = performance.now() - first;
    const again = { ...element, code: "x = 1\ny = 2\n" } as Element;
    const second = performance.now();
    expandComposite(engine.deck.theme, "blank", again);
    const warm = performance.now() - second;
    console.info(`first code block ${cold.toFixed(1)} ms, next ${warm.toFixed(1)} ms`);
    expect(cold).toBeLessThan(2000);
    expect(warm).toBeLessThan(200);
  });
});
