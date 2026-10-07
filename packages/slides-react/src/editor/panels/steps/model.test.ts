import type { DeckEngine, Element, Slide } from "@kasten-slides/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import { newDeck } from "../../../test/engine.ts";
import { shape, textBox } from "../../factory.ts";
import { STATES, type ElementRow, type ItemRow, cellName, cellOf, entryOf, labelOf, nextEntry, rowsOf } from "./model.ts";

let engine: DeckEngine;

beforeAll(async () => {
  engine = await newDeck("Steps", "Light");
});

const named = (element: Element, name: string): Element => ({ ...element, name }) as Element;

/** A blank slide holding the elements, and the slide as the deck has it. */
function slideWith(elements: Element[], layout = "blank"): { slide: Slide; ids: string[] } {
  const id = engine.apply("add_slide", { layout }).output.slide;
  const ids = engine.apply("add_elements", { slide: id, elements }).output.ids;
  return { slide: engine.deck.slides.find((s) => s.id === id) as Slide, ids };
}

const elementRows = (rows: ReturnType<typeof rowsOf>): ElementRow[] => rows.filter((r): r is ElementRow => r.kind === "element");

describe("the rows of the grid", () => {
  it("are the elements in reading order: rows from the top, each from the left", () => {
    const { slide } = slideWith([
      named(shape("rect", { x: 400, y: 300, w: 100, h: 50 }), "D"),
      named(shape("rect", { x: 60, y: 100, w: 100, h: 50 }), "A"),
      named(shape("rect", { x: 400, y: 105, w: 100, h: 50 }), "B"),
      named(shape("rect", { x: 60, y: 300, w: 100, h: 50 }), "C"),
    ]);
    expect(rowsOf(slide, engine.deck.theme, new Set()).map((r) => r.label)).toEqual(["A", "B", "C", "D"]);
  });

  it("show what a group holds only when it is open, indented, and select the group", () => {
    const { slide, ids } = slideWith([named(shape("rect", { x: 60, y: 100, w: 100, h: 50 }), "Left"), named(shape("rect", { x: 300, y: 100, w: 100, h: 50 }), "Right")]);
    const group = engine.apply("group_elements", { slide: slide.id, ids }).output.group;
    const grouped = engine.deck.slides.find((s) => s.id === slide.id) as Slide;
    const shut = rowsOf(grouped, engine.deck.theme, new Set());
    expect(shut.map((r) => r.label)).toEqual(["Group"]);
    expect((shut[0] as ElementRow).group).toBe(true);
    const open = rowsOf(grouped, engine.deck.theme, new Set([group]));
    expect(open.map((r) => [r.label, r.depth, r.top])).toEqual([
      ["Group", 0, group],
      ["Left", 1, group],
      ["Right", 1, group],
    ]);
  });

  it("are named by the layer name, else the start of the words, else what the element is", () => {
    const words = textBox({ x: 0, y: 0, w: 100, h: 40 }, "  The first line of a rather long paragraph that goes on and on ");
    expect(labelOf(named(shape("rect", { x: 0, y: 0, w: 1, h: 1 }), " Model "))).toBe("Model");
    expect(labelOf(words)).toBe("The first line of a rather lo…");
    expect(labelOf(shape("ellipse", { x: 0, y: 0, w: 1, h: 1 }))).toBe("Shape");
    expect(labelOf({ type: "line", id: "", x: 0, y: 0, w: 10, h: 0 } as Element)).toBe("Line");
  });

  it("include a row for each item of a list that builds line by line", () => {
    const list = {
      type: "text",
      id: "",
      x: 60,
      y: 100,
      w: 400,
      h: 200,
      text: { paragraphs: [{ runs: [{ t: "Heading" }] }, { list: "bullet", runs: [{ t: "one" }] }, { list: "bullet", runs: [{ t: "two" }] }] },
    } as Element;
    const { slide, ids } = slideWith([list]);
    expect(rowsOf(slide, engine.deck.theme, new Set()).map((r) => r.kind)).toEqual(["element"]);
    engine.apply("build_steps", { slide: slide.id, ids, recipe: "reveal" });
    const built = engine.deck.slides.find((s) => s.id === slide.id) as Slide;
    const rows = rowsOf(built, engine.deck.theme, new Set());
    expect(rows.map((r) => [r.kind, r.label, r.depth])).toEqual([
      ["element", "Heading", 0],
      ["item", "one", 1],
      ["item", "two", 1],
    ]);
    expect(rows.filter((r): r is ItemRow => r.kind === "item").map((r) => r.step)).toEqual([1, 2]);
    expect(cellOf(rows[1] as ItemRow, 0)).toEqual({ state: "hidden", set: false });
    expect(cellOf(rows[1] as ItemRow, 1)).toEqual({ state: "normal", set: true });
    expect(cellOf(rows[2] as ItemRow, 1)).toEqual({ state: "hidden", set: false });
  });
});

describe("a cell", () => {
  let slideId = "";
  beforeAll(() => {
    const made = slideWith([named(shape("rect", { x: 0, y: 0, w: 10, h: 10 }), "Model")]);
    slideId = made.slide.id;
    engine.apply("set_step_states", { slide: slideId, id: made.ids[0] as string, states: { "0": "dimmed", "2": "highlighted" } });
  });
  const row = () => elementRows(rowsOf(engine.deck.slides.find((s) => s.id === slideId) as Slide, engine.deck.theme, new Set()))[0] as ElementRow;

  it("holds the state at its step, and whether the element says so at that step or carries it on", () => {
    expect([0, 1, 2, 3].map((step) => cellOf(row(), step))).toEqual([
      { state: "dimmed", set: true },
      { state: "dimmed", set: false },
      { state: "highlighted", set: true },
      { state: "highlighted", set: false },
    ]);
    expect(entryOf(row(), 1)).toBeUndefined();
    expect(entryOf(row(), 2)).toBe("highlighted");
  });

  it("is said aloud with its layer, its step and where the state comes from", () => {
    expect(cellName(row(), 2, cellOf(row(), 2))).toBe("Model, step 2: highlighted, set here");
    expect(cellName(row(), 1, cellOf(row(), 1))).toBe("Model, step 1: dimmed, from before");
    expect(cellName(row(), 0, cellOf(row(), 0))).toBe("Model, step 0, as the slide appears: dimmed, set here");
  });
});

describe("the cycle a click goes through", () => {
  it("is hidden, dimmed, normal, highlighted and then the entry is taken away", () => {
    const seen: (string | null)[] = [];
    let entry: (typeof STATES)[number] | undefined;
    for (let click = 0; click < 6; click++) {
      const next = nextEntry(entry);
      seen.push(next);
      entry = next ?? undefined;
    }
    expect(seen).toEqual(["hidden", "dimmed", "normal", "highlighted", null, "hidden"]);
  });

  it("goes the other way with the shift key", () => {
    expect(nextEntry(undefined, -1)).toBe("highlighted");
    expect(nextEntry("hidden", -1)).toBeNull();
    expect(nextEntry("normal", -1)).toBe("dimmed");
  });
});
