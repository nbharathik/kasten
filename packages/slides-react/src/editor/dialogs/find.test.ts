import type { DeckEngine, Element, Paragraph, Text } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { newDeck } from "../../test/engine.ts";
import { type FindMatch, compareAt, findAll, occurrences, sameMatch } from "./find.ts";

const words = (...paragraphs: Paragraph[]): Text => ({ paragraphs });
const p = (...runs: Paragraph["runs"]): Paragraph => ({ runs });
const box = { x: 10, y: 10, w: 200, h: 60 };

const textBox = (text: Text, at = box): Element => ({ type: "text", id: "", ...at, text }) as Element;
const shape = (text: Text): Element => ({ type: "shape", id: "", shape: "rect", ...box, text }) as Element;

/** A deck of `n` blank slides. */
async function deckOf(n: number): Promise<{ engine: DeckEngine; slides: string[] }> {
  const engine = await newDeck("Find");
  for (let i = 1; i < n; i++) engine.apply("add_slide", { layout: "blank" });
  // The first slide is a title slide with two empty slots: clear them so the tests hold only what they put there.
  const first = engine.deck.slides[0]!;
  engine.apply("delete_elements", { slide: first.id, ids: first.elements.map((e) => e.id) });
  return { engine, slides: engine.deck.slides.map((s) => s.id) };
}

const add = (engine: DeckEngine, slide: string, ...elements: Element[]) => engine.apply("add_elements", { slide, elements }).output.ids;

describe("occurrences", () => {
  it("finds every place, left to right, without overlapping", () => {
    expect(occurrences("a cat and a Cat", "cat")).toEqual([2, 12]);
    expect(occurrences("aaaa", "aa")).toEqual([0, 2]);
    expect(occurrences("aaa", "aa")).toEqual([0]);
  });

  it("finds nothing for an empty phrase", () => {
    expect(occurrences("anything", "")).toEqual([]);
  });

  it("ignores case unless asked not to, and only for ASCII letters", () => {
    expect(occurrences("Cat CAT cat", "cat")).toEqual([0, 4, 8]);
    expect(occurrences("Cat CAT cat", "cat", { caseSensitive: true })).toEqual([8]);
    // Beyond ASCII, a letter matches only itself.
    expect(occurrences("École école", "école")).toEqual([6]);
  });

  it("matches whole words only, with letters and digits around a match spoiling it", () => {
    expect(occurrences("cat concat cats cat.", "cat", { wholeWord: true })).toEqual([0, 16]);
    expect(occurrences("cat2 2cat (cat)", "cat", { wholeWord: true })).toEqual([11]);
    expect(occurrences("naïve cat", "cat", { wholeWord: true })).toEqual([6]);
    expect(occurrences("écat cat", "cat", { wholeWord: true })).toEqual([5]);
  });

  it("looks again just after a match that stood in a word", () => {
    // "aa" at 0 is followed by a letter; the engine goes on one place at a time.
    expect(occurrences("aaa aa", "aa", { wholeWord: true })).toEqual([4]);
  });

  it("handles letters outside the basic plane", () => {
    expect(occurrences("😀 cat 😀cat", "cat", { wholeWord: true })).toEqual([3, 9]);
  });
});

describe("findAll", () => {
  it("goes through the slides in order, and each slide's elements in the order they are stacked", async () => {
    const { engine, slides } = await deckOf(3);
    add(engine, slides[2]!, textBox(words(p({ t: "third cat" }))));
    const [top, under] = add(engine, slides[1]!, textBox(words(p({ t: "cat second" }))), textBox(words(p({ t: "cat first" }))));
    add(engine, slides[0]!, textBox(words(p({ t: "a cat" }))));
    const found = findAll(engine.deck, "cat");
    expect(found.map((m) => m.slide)).toEqual([slides[0], slides[1], slides[1], slides[2]]);
    expect(found.map((m) => m.element)).toEqual([expect.any(String), top, under, expect.any(String)]);
    expect(found.map((m) => m.index)).toEqual([2, 0, 0, 6]);
    // Strictly in order.
    for (let i = 1; i < found.length; i++) expect(compareAt(found[i - 1]!.at, found[i]!.at)).toBeLessThan(0);
  });

  it("tells where in the element a match is", async () => {
    const { engine, slides } = await deckOf(1);
    const [id] = add(engine, slides[0]!, textBox(words(p({ t: "one" }), p({ t: "two " }, { t: "cat", b: true }, { t: " cat" }))));
    const found = findAll(engine.deck, "cat");
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ slide: slides[0], element: id, index: 0, length: 3, spot: { id, part: "text", paragraph: 1, run: 1 } });
    expect(found[1]).toMatchObject({ index: 1, spot: { paragraph: 1, run: 2 } });
    expect(found[0]?.notes).toBeUndefined();
  });

  it("does not find a phrase that runs over two differently formatted runs", async () => {
    const { engine, slides } = await deckOf(1);
    add(engine, slides[0]!, textBox(words(p({ t: "he" }, { t: "llo", b: true }))));
    expect(findAll(engine.deck, "hello")).toEqual([]);
    expect(findAll(engine.deck, "llo")).toHaveLength(1);
  });

  it("reads text boxes, shapes, connector labels, table cells and group children", async () => {
    const { engine, slides } = await deckOf(1);
    const slide = slides[0]!;
    const [a, b] = add(engine, slide, textBox(words(p({ t: "cat in a box" }))), shape(words(p({ t: "cat in a shape" }))));
    const [connector] = add(engine, slide, { type: "connector", id: "", x: 0, y: 0, w: 0, h: 0, route: "straight", from: { el: a!, side: "right" }, to: { el: b!, side: "left" }, label: words(p({ t: "a cat label" })) } as Element);
    const [table] = add(engine, slide, {
      type: "table",
      id: "",
      ...box,
      columns: [100, 100],
      rows: [{ cells: [{ text: words(p({ t: "no" })) }, { text: words(p({ t: "cat cell" })) }] }, { cells: [{ text: words(p({ t: "cat again" })) }, { text: words(p({ t: "none" })) }] }],
    } as Element);
    const [g1, g2] = add(engine, slide, textBox(words(p({ t: "in group cat" })), { x: 300, y: 100, w: 100, h: 50 }), textBox(words(p({ t: "cat in group" })), { x: 420, y: 100, w: 100, h: 50 }));
    const group = engine.apply("group_elements", { slide, ids: [g1!, g2!] }).output.group;

    const found = findAll(engine.deck, "cat");
    expect(found.map((m) => [m.spot?.part, m.spot?.row, m.spot?.cell])).toEqual([
      ["text", undefined, undefined], // text box
      ["text", undefined, undefined], // shape
      ["label", undefined, undefined], // connector
      ["cell", 0, 1],
      ["cell", 1, 0],
      ["text", undefined, undefined], // in the group
      ["text", undefined, undefined], // and the other
    ]);
    expect(found.find((m) => m.spot?.part === "label")?.element).toBe(connector);
    expect(found.filter((m) => m.spot?.part === "cell").every((m) => m.element === table)).toBe(true);
    // Words in a group are found under the group, and the match says which child holds them.
    const grouped = found.slice(5);
    expect(grouped.map((m) => m.element)).toEqual([group, group]);
    expect(grouped.map((m) => m.spot?.id)).toEqual([g1, g2]);
  });

  it("looks in nested groups", async () => {
    const { engine, slides } = await deckOf(1);
    const slide = slides[0]!;
    const [a, b, c] = add(engine, slide, textBox(words(p({ t: "x cat" }))), textBox(words(p({ t: "y" })), { x: 300, y: 10, w: 50, h: 50 }), textBox(words(p({ t: "cat z" })), { x: 400, y: 10, w: 50, h: 50 }));
    const inner = engine.apply("group_elements", { slide, ids: [a!, b!] }).output.group;
    engine.apply("group_elements", { slide, ids: [inner, c!] });
    const found = findAll(engine.deck, "cat");
    expect(found.map((m) => m.spot?.id).sort()).toEqual([a, c].sort());
    // Both are under the one group that is on the slide.
    expect(new Set(found.map((m) => m.element)).size).toBe(1);
  });

  it("looks in the speaker notes after the elements of the slide, unless told not to", async () => {
    const { engine, slides } = await deckOf(2);
    add(engine, slides[0]!, textBox(words(p({ t: "cat" }))));
    engine.apply("set_notes", { slide: slides[0]!, notes: "notes about the cat, the Cat" });
    engine.apply("set_notes", { slide: slides[1]!, notes: "cat" });
    const found = findAll(engine.deck, "cat");
    expect(found.map((m) => [m.slide === slides[0] ? 0 : 1, Boolean(m.notes), m.index])).toEqual([
      [0, false, 0],
      [0, true, 16],
      [0, true, 25],
      [1, true, 0],
    ]);
    expect(found[1]).toMatchObject({ notes: true, length: 3 });
    expect(found[1]?.element).toBeUndefined();
    expect(findAll(engine.deck, "cat", { includeNotes: false })).toHaveLength(1);
    expect(findAll(engine.deck, "cat", { includeNotes: true, caseSensitive: true })).toHaveLength(3);
  });

  it("honours case and whole words across the deck", async () => {
    const { engine, slides } = await deckOf(1);
    add(engine, slides[0]!, textBox(words(p({ t: "cat Cat concat cats" }))));
    expect(findAll(engine.deck, "cat")).toHaveLength(4);
    expect(findAll(engine.deck, "cat", { caseSensitive: true })).toHaveLength(3);
    expect(findAll(engine.deck, "cat", { wholeWord: true })).toHaveLength(2);
    expect(findAll(engine.deck, "cat", { wholeWord: true, caseSensitive: true })).toHaveLength(1);
  });

  it("finds nothing for an empty phrase, and nothing on an empty deck", async () => {
    const { engine } = await deckOf(2);
    expect(findAll(engine.deck, "")).toEqual([]);
    expect(findAll(engine.deck, "cat")).toEqual([]);
  });

  it("counts the same as the engine's replace_all, so 'of 12' and 'Replaced 12' agree", async () => {
    const { engine, slides } = await deckOf(3);
    add(engine, slides[0]!, textBox(words(p({ t: "Cat concat cat" }), p({ t: "he" }, { t: "cat", i: true }))), shape(words(p({ t: "cats" }))));
    add(engine, slides[1]!, {
      type: "table",
      id: "",
      ...box,
      columns: [100],
      rows: [{ cells: [{ text: words(p({ t: "cat cat" })) }] }],
    } as Element);
    engine.apply("set_notes", { slide: slides[2]!, notes: "a cat\nand another Cat" });
    for (const options of [{}, { caseSensitive: true }, { wholeWord: true }, { includeNotes: false }, { caseSensitive: true, wholeWord: true, includeNotes: false }]) {
      const before = findAll(engine.deck, "cat", options).length;
      const done = engine.apply("replace_all", { find: "cat", replace: "dog", ...options });
      expect(before, JSON.stringify(options)).toBe(done.output.count);
      engine.undo();
    }
  });
});

describe("matches", () => {
  const match = (at: number[], slide = "s"): FindMatch => ({ slide, index: 0, length: 1, at });

  it("are told apart by where they are", () => {
    expect(sameMatch(match([0, 1, 0, 0, 2]), match([0, 1, 0, 0, 2]))).toBe(true);
    expect(sameMatch(match([0, 1, 0, 0, 2]), match([0, 1, 0, 0, 3]))).toBe(false);
    expect(sameMatch(match([0, 1]), match([0, 1], "other"))).toBe(false);
    expect(sameMatch(null, match([0]))).toBe(false);
  });

  it("are ordered by place, a shorter place coming first when it is the start of a longer", () => {
    expect(compareAt([1, 2, 3], [1, 2, 4])).toBeLessThan(0);
    expect(compareAt([2], [1, 9, 9])).toBeGreaterThan(0);
    expect(compareAt([1], [1, 0])).toBeLessThan(0);
    expect(compareAt([3, 4], [3, 4])).toBe(0);
  });
});
