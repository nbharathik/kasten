import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";

import { DeckEngine, SlidesError, builtInThemes, loadSlides, operationSpecs, supportedFormatVersion } from "./index.ts";
import { OP_NAMES } from "./generated/ops.ts";

beforeAll(async () => {
  await loadSlides(await readFile(new URL("../pkg/slides_wasm_bg.wasm", import.meta.url)));
});

/** Sorted keys, so two decks compare by content. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v)));
}

const saved = (engine: DeckEngine): unknown => plain(JSON.parse(engine.save()));

describe("the engine", () => {
  it("makes a deck and reports the format version", () => {
    expect(supportedFormatVersion()).toBe(1);
    const engine = DeckEngine.create("Talk", "Light", 1);
    expect(engine.deck.title).toBe("Talk");
    expect(engine.deck.slides).toHaveLength(1);
    expect(builtInThemes()).toContain("Lecture");
  });

  it("keeps its plain copy of the deck in step with the engine through every change", () => {
    const engine = DeckEngine.create("Talk", "Light", 2);
    const seen: number[] = [];
    engine.subscribe((deck) => seen.push(deck.slides.length));
    const added = engine.apply("add_slide", { layout: "title-body", content: { title: "Results", body: "- a\n- b" } });
    expect(added.output.slide).toMatch(/^s-/);
    expect(plain(engine.deck)).toEqual(saved(engine));
    engine.apply("set_notes", { slide: added.output.slide, notes: "hello" });
    expect(plain(engine.deck)).toEqual(saved(engine));
    engine.undo();
    engine.undo();
    expect(engine.deck.slides).toHaveLength(1);
    expect(plain(engine.deck)).toEqual(saved(engine));
    engine.redo();
    expect(engine.deck.slides).toHaveLength(2);
    expect(plain(engine.deck)).toEqual(saved(engine));
    expect(seen).toEqual([2, 2, 2, 1, 2]);
    expect(engine.canUndo && engine.canRedo).toBe(true);
    expect(engine.undoLabel).toBe("add_slide");
  });

  it("shares every slide that did not change", () => {
    const engine = DeckEngine.create("Talk", "Light", 3);
    const second = engine.apply("add_slide", { layout: "blank" }).output.slide;
    const [first, other] = engine.deck.slides;
    engine.apply("set_notes", { slide: second, notes: "changed" });
    expect(engine.deck.slides[0]).toBe(first);
    expect(engine.deck.slides[1]).not.toBe(other);
    expect(engine.deck.slides[1]?.notes).toBe("changed");
  });

  it("throws a SlidesError with its kind, and changes nothing", () => {
    const engine = DeckEngine.create("Talk", "Light", 4);
    const before = engine.save();
    let thrown: unknown;
    try {
      engine.apply("add_slide", { layout: "nope" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SlidesError);
    expect((thrown as SlidesError).kind).toBe("badInput");
    expect((thrown as SlidesError).message).toContain("title-body");
    expect(engine.save()).toBe(before);
    expect(engine.canUndo).toBe(false);
  });

  it("applies a batch as one step", () => {
    const engine = DeckEngine.create("Talk", "Light", 5);
    const first = engine.deck.slides[0]?.id ?? "";
    engine.applyBatch([
      ["set_title", { title: "Batch" }],
      ["set_notes", { slide: first, notes: "n" }],
    ]);
    expect(engine.deck.title).toBe("Batch");
    expect(engine.deck.slides[0]?.notes).toBe("n");
    engine.undo();
    expect(engine.deck.title).toBe("Talk");
    expect(engine.deck.slides[0]?.notes ?? "").toBe("");
    expect(engine.canUndo).toBe(false);
  });

  it("opens the text it saved", () => {
    const engine = DeckEngine.create("Talk", "Serif", 6);
    engine.apply("add_slide", { layout: "quote", content: { quote: "Be brief." } });
    const again = DeckEngine.open(engine.save(), 7);
    expect(plain(again.deck)).toEqual(plain(engine.deck));
    expect(() => DeckEngine.open("{}", 8)).toThrowError(SlidesError);
  });

  it("keeps the fields a newer build wrote, in every kind of object, through a save and a change that has nothing to do with them", async () => {
    const text = await readFile(new URL("../../../fixtures/decks/unknown-fields-deep.deck", import.meta.url), "utf8");
    const planted = (s: string): number => s.match(/"future/g)?.length ?? 0;
    expect(planted(text)).toBeGreaterThan(40);
    const engine = DeckEngine.open(text, 9);
    expect(engine.save()).toBe(text);
    // The copy the editor reads holds them too, so a value it hands back to an operation keeps them.
    expect(planted(JSON.stringify(engine.deck))).toBe(planted(text));
    engine.apply("set_title", { title: "Another title" });
    expect(planted(engine.save())).toBe(planted(text));
    engine.undo();
    expect(engine.save()).toBe(text);
  });

  it("describes every operation, matching the generated list", () => {
    const specs = operationSpecs();
    expect(specs.map((s) => s.name)).toEqual([...OP_NAMES]);
    expect(specs.every((s) => s.about.length > 20)).toBe(true);
  });
});
