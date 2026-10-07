import type { DeckEngine, Element } from "@kasten-slides/wasm";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { findAll } from "./find.ts";
import { click, open, p, replaceField, status, type, words } from "./find-kit.tsx";
import { edit, mountDialogs } from "./test-kit.tsx";

afterEach(cleanup);

describe("Replace", () => {
  it("shows the first match before it changes anything, then replaces it and shows the next", async () => {
    const kit = await open();
    type("cat");
    fireEvent.change(replaceField(), { target: { value: "lynx" } });
    const before = kit.session.state.revision;
    click("Replace");
    expect(kit.session.state.revision).toBe(before);
    expect(status()).toBe("1 of 10");
    click("Replace");
    expect(kit.session.deck.slides[0]!.elements.find((e) => e.placeholder === "title")).toMatchObject({ text: { paragraphs: [{ runs: [{ t: "lynxs and dogs" }] }] } });
    expect(kit.session.state.revision).toBe(before + 1);
    // The title is done with; the next is the subtitle's, first of the nine left.
    expect(status()).toBe("1 of 9");
    expect(kit.errors).toEqual([]);
  });

  it("keeps the look of the words: only the run with the match changes", async () => {
    const kit = await open();
    type("cat");
    fireEvent.change(replaceField(), { target: { value: "lynx" } });
    click("Find next");
    click("Find next");
    expect(status()).toBe("2 of 10");
    click("Replace");
    const subtitle = kit.session.deck.slides[0]!.elements.find((e) => e.placeholder === "subtitle");
    expect(subtitle).toMatchObject({ text: { paragraphs: [{ runs: [{ t: "About " }, { t: "lynx", b: true }, { t: " behaviour" }] }] } });
  });

  it("goes on past the words it put in, even if they hold what was looked for", async () => {
    const kit = await open();
    type("cat");
    fireEvent.change(replaceField(), { target: { value: "cats" } });
    click("Find next");
    click("Replace");
    click("Replace");
    click("Replace");
    const runs = (role: string) => JSON.stringify(kit.session.deck.slides[0]!.elements.find((e) => e.placeholder === role));
    // "Cat" became "cats", and "cats" was left as it was: one replacement for each place.
    expect(runs("title")).toContain("catss and dogs");
    expect(runs("subtitle")).toContain('"t":"cats"');
    expect(kit.session.deck.slides[0]!.notes).toBe("Remember the cats story.");
  });

  it("replaces in the notes, in a table cell and in a group", async () => {
    const kit = await open();
    type("story");
    fireEvent.change(replaceField(), { target: { value: "tale" } });
    click("Find next");
    click("Replace");
    expect(kit.session.deck.slides[0]!.notes).toBe("Remember the cat tale.");
    fireEvent.click(screen.getByLabelText("Match case"));
    type("Dog");
    fireEvent.change(replaceField(), { target: { value: "Wolf" } });
    click("Find next");
    expect(kit.session.state.selection).toEqual([kit.session.deck.slides[2]!.elements.find((e) => e.type === "table")?.id]);
    click("Replace");
    const table = kit.session.deck.slides[2]!.elements.find((e) => e.type === "table");
    expect(JSON.stringify(table)).toContain('"t":"Wolf"');
    expect(JSON.stringify(table)).not.toContain('"t":"Dog"');
    type("too");
    fireEvent.change(replaceField(), { target: { value: "also" } });
    click("Find next");
    click("Replace");
    expect(JSON.stringify(kit.session.deck.slides[2]!.elements.find((e) => e.type === "group"))).toContain("cat also");
    expect(kit.errors).toEqual([]);
  });

  it("undoes as one step each", async () => {
    const kit = await open();
    type("story");
    fireEvent.change(replaceField(), { target: { value: "tale" } });
    click("Find next");
    click("Replace");
    edit(() => kit.session.undo());
    expect(kit.session.deck.slides[0]!.notes).toBe("Remember the cat story.");
  });

  it("replaces everything with the engine, and says how many", async () => {
    const kit = await open();
    type("cat");
    fireEvent.change(replaceField(), { target: { value: "lynx" } });
    const before = kit.session.state.revision;
    click("Replace all");
    expect(status()).toBe("Replaced 10");
    expect(kit.session.state.revision).toBe(before + 1);
    expect(findAll(kit.session.deck, "cat")).toEqual([]);
    expect(kit.session.deck.slides[0]!.notes).toBe("Remember the lynx story.");
    expect(kit.session.deck.slides[1]!.elements.find((e) => e.placeholder === "body")).toMatchObject({ text: { paragraphs: [{ runs: [{ t: "The lynx sat. Conlynx is not lynx." }] }] } });
    // The message goes away when the search changes.
    type("lynx");
    expect(status()).toBe("10 matches");
    edit(() => kit.session.undo());
    expect(findAll(kit.session.deck, "cat")).toHaveLength(10);
  });

  it("replaces with the options that are set", async () => {
    const kit = await open();
    fireEvent.click(screen.getByLabelText("Whole word"));
    fireEvent.click(screen.getByLabelText("Also search notes"));
    type("cat");
    fireEvent.change(replaceField(), { target: { value: "lynx" } });
    click("Replace all");
    expect(status()).toBe("Replaced 6");
    expect(kit.session.deck.slides[0]!.notes).toBe("Remember the cat story.");
    expect(JSON.stringify(kit.session.deck.slides[1])).toContain("Concat");
  });

  it("replaces with nothing", async () => {
    const kit = await open();
    type(" behaviour");
    click("Replace all");
    expect(status()).toBe("Replaced 1");
    expect(JSON.stringify(kit.session.deck.slides[0]!.elements.find((e) => e.placeholder === "subtitle"))).toContain('"t":"About "');
  });
});

describe("Replace in a connector's label", () => {
  const withConnector = (engine: DeckEngine) => {
    const [slide] = engine.deck.slides.map((s) => s.id) as [string];
    const [a, b] = engine.apply("add_elements", {
      slide,
      elements: [
        { type: "shape", id: "", shape: "rect", x: 10, y: 200, w: 80, h: 40 } as Element,
        { type: "shape", id: "", shape: "rect", x: 300, y: 200, w: 80, h: 40 } as Element,
      ],
    }).output.ids;
    engine.apply("add_elements", {
      slide,
      elements: [
        { type: "connector", id: "", x: 0, y: 0, w: 0, h: 0, route: "straight", from: { el: a!, side: "right" }, to: { el: b!, side: "left" }, label: words(p({ t: "calls the " }, { t: "tool", i: true })) } as Element,
      ],
    });
  };

  it("changes the word in its run and keeps the look of the rest", async () => {
    const kit = await mountDialogs({ dialog: "find", blank: false, prepare: withConnector });
    type("tool");
    fireEvent.change(replaceField(), { target: { value: "function" } });
    click("Find next");
    expect(status()).toBe("1 of 1");
    click("Replace");
    const connector = kit.session.slide.elements.find((e) => e.type === "connector") as Extract<Element, { type: "connector" }>;
    expect(connector.label?.paragraphs[0]?.runs).toEqual([{ t: "calls the " }, { t: "function", i: true }]);
    expect(kit.errors).toEqual([]);
  });
});
