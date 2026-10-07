// @vitest-environment node
import type { Deck, Slide } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { newDeck } from "../../test/engine.ts";
import { ago, batchesOf, markedAmong, marksOf, pendingIn, shownMarks } from "./marks.ts";

/** A deck with two text boxes on its second slide, marked as an assistant's work. */
async function marked() {
  const engine = await newDeck("Marks");
  const slide = engine.apply("add_slide", { layout: "blank" }).output.slide;
  engine.apply("add_elements", {
    slide,
    elements: ["a", "b"].map((id, i) => ({ type: "text", id, x: 60 + i * 200, y: 100, w: 160, h: 60, text: { paragraphs: [{ runs: [{ t: id }] }] } })),
  });
  return { engine, slide };
}

/** The slide as an agent's tool leaves it: with the field the tools write. */
function withMarks(deck: Deck, slide: string, ids: string[]): Deck {
  return {
    ...deck,
    slides: deck.slides.map((s) => (s.id === slide ? ({ ...s, "x-agent": [{ at: 1_000, by: "claude-code", ids, session: "s1" }] } as Slide) : s)),
  };
}

describe("reading the marks on a slide", () => {
  it("finds the marked elements that are on the slide, and none on a slide without the field", async () => {
    const { engine, slide } = await marked();
    const deck = withMarks(engine.deck, slide, ["a", "gone"]);
    const shown = deck.slides.find((s) => s.id === slide)!;
    expect([...marksOf(shown).keys()]).toEqual(["a"]);
    expect(marksOf(engine.deck.slides[0]!).size).toBe(0);
    expect(pendingIn(deck)).toBe(1);
    expect(markedAmong(shown, ["a", "b"])).toEqual(["a"]);
    expect(marksOf(shown), "worked out once for a slide the engine did not change").toBe(marksOf(shown));
  });

  it("counts a field that is not a list of batches as no marks", async () => {
    const { engine, slide } = await marked();
    const odd = { ...engine.deck.slides.find((s) => s.id === slide)!, "x-agent": "by hand" } as unknown as Slide;
    expect(batchesOf(odd)).toEqual([]);
    expect(marksOf(odd).size).toBe(0);
    const partly = { ...odd, "x-agent": [7, { at: 1, by: "x", ids: ["a"] }] } as unknown as Slide;
    expect(batchesOf(partly)).toHaveLength(1);
  });

  it("shows the marks of a group's children on the group", async () => {
    const { engine, slide } = await marked();
    engine.apply("group_elements", { slide, ids: ["a", "b"] });
    const grouped = engine.deck.slides.find((s) => s.id === slide)!;
    const group = grouped.elements[0]!.id;
    const deck = withMarks(engine.deck, slide, ["b"]);
    const shown = shownMarks(deck.slides.find((s) => s.id === slide)!);
    expect([...shown.keys()]).toEqual([group]);
  });
});

describe("the words for when", () => {
  it("says how long ago in the biggest unit that fits", () => {
    const now = 10 * 86_400_000;
    expect(ago(now - 5_000, now)).toBe("just now");
    expect(ago(now - 3 * 60_000, now)).toBe("3 minutes ago");
    expect(ago(now - 3_600_000, now)).toBe("1 hour ago");
    expect(ago(now - 2 * 86_400_000, now)).toBe("2 days ago");
  });
});

describe("the engine and the marks", () => {
  it("takes a mark off an element an operation changes, and accepting takes off the rest, each one step of undo", async () => {
    const { engine, slide } = await marked();
    const opened = withMarks(engine.deck, slide, ["a", "b"]);
    const text = JSON.stringify(opened);
    const again = (await import("@kasten-slides/wasm")).DeckEngine.open(text);
    expect(pendingIn(again.deck)).toBe(2);
    again.apply("transform_elements", { slide, items: [{ id: "a", x: 300 }] });
    expect([...marksOf(again.deck.slides.find((s) => s.id === slide)!).keys()]).toEqual(["b"]);
    again.apply("accept_marks", { slide, ids: ["b"] });
    expect(pendingIn(again.deck)).toBe(0);
    again.undo();
    expect(pendingIn(again.deck)).toBe(1);
    again.undo();
    expect(pendingIn(again.deck)).toBe(2);
  });
});
