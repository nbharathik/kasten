import { readFile } from "node:fs/promises";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { DeckEngine, type Element, type Theme, citationOrder, closestReference, expandComposite, loadSlides, referenceList, referencesVersion, setReferences, subscribeReferences } from "./index.ts";

beforeAll(async () => {
  await loadSlides(await readFile(new URL("../pkg/slides_wasm_bg.wasm", import.meta.url)));
});

afterEach(() => setReferences(null));

const BIB = `
@inproceedings{vaswani2017attention, title={Attention is all you need}, author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki}, booktitle={Advances in Neural Information Processing Systems}, year={2017}}
@article{lecun2015deep, title={Deep learning}, author={LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey}, journal={Nature}, year={2015}}
`;

function citation(id: string, keys: string[], at: { x: number; y: number }, format?: string): Record<string, unknown> {
  return { type: "citation", id, x: at.x, y: at.y, w: 700, h: 30, keys, ...(format ? { format } : {}) };
}

/** A deck of three slides that cite works, the last with a list. */
function cited(): { engine: DeckEngine; slides: string[] } {
  const engine = DeckEngine.create("Cited", "Light", 3);
  const slides = [1, 2, 3].map(() => engine.apply("add_slide", { layout: "blank" }).output.slide);
  engine.apply("add_elements", { slide: slides[0]!, elements: [citation("c1", ["lecun2015deep"], { x: 64, y: 480 }, "numbered")] as never });
  engine.apply("add_elements", { slide: slides[1]!, elements: [citation("c2", ["vaswani2017attention", "lecun2015deep"], { x: 64, y: 480 }, "numbered")] as never });
  engine.apply("add_elements", { slide: slides[2]!, elements: [citation("refs", [], { x: 64, y: 100 }, "list")] as never });
  return { engine, slides };
}

const words = (group: Element | null): string[] => (group?.type === "group" ? (group.children[0]?.type === "text" ? group.children[0].text.paragraphs.map((p) => p.runs.map((r) => r.t).join("")) : []) : []);

describe("the page's bibliography", () => {
  it("is nothing until the host gives one, then lists its works in the order written", () => {
    expect(referenceList()).toBeNull();
    setReferences(BIB);
    const works = referenceList();
    expect(works?.map((w) => w.key)).toEqual(["vaswani2017attention", "lecun2015deep"]);
    expect(works?.[0]).toMatchObject({ kind: "inproceedings", title: "Attention is all you need", year: "2017", short: "Vaswani et al., 2017 (NeurIPS)" });
    expect(works?.[1]?.authors).toEqual(["Yann LeCun", "Yoshua Bengio", "Geoffrey Hinton"]);
    setReferences("");
    expect(referenceList()).toEqual([]);
    setReferences(null);
    expect(referenceList()).toBeNull();
  });

  it("says which key a mistyped one was probably meant to be", () => {
    expect(closestReference("vaswani2017")).toBeNull();
    setReferences(BIB);
    expect(closestReference("vaswani2017")).toBe("vaswani2017attention");
    expect(closestReference("lecun2016deep")).toBe("lecun2015deep");
    expect(closestReference("smith2001")).toBeNull();
  });

  it("tells whoever is drawing that it changed", () => {
    const seen: number[] = [];
    const stop = subscribeReferences(() => seen.push(referencesVersion()));
    const before = referencesVersion();
    setReferences(BIB);
    setReferences(null);
    stop();
    setReferences(BIB);
    expect(seen).toEqual([before + 1, before + 2]);
  });
});

describe("a citation drawn from it", () => {
  let theme: Theme;
  beforeAll(() => {
    theme = DeckEngine.create("t", "Light", 1).deck.theme;
  });
  const element = { type: "citation", id: "c", x: 64, y: 480, w: 700, h: 30, keys: ["vaswani2017attention", "nobody2000"] } as unknown as Element;

  it("says who wrote the work, marks a key it does not have, and shows plain keys when there is no bibliography", () => {
    expect(words(expandComposite(theme, "blank", element))).toEqual(["(vaswani2017attention; nobody2000)"]);
    setReferences(BIB);
    expect(words(expandComposite(theme, "blank", element))).toEqual(["Vaswani et al., 2017 (NeurIPS); nobody2000?"]);
  });

  it("is drawn again when the bibliography or the deck's numbering changes, and not before", () => {
    const numbered = { ...element, format: "numbered" } as unknown as Element;
    const plain = expandComposite(theme, "blank", numbered);
    expect(words(plain)).toEqual(["[1][2]"]);
    expect(expandComposite(theme, "blank", numbered)).toBe(plain);
    const order = ["nobody2000", "x", "vaswani2017attention"];
    const renumbered = expandComposite(theme, "blank", numbered, order);
    expect(words(renumbered)).toEqual(["[3][1]"]);
    expect(expandComposite(theme, "blank", numbered, [...order])).toBe(renumbered);
    expect(expandComposite(theme, "blank", numbered, ["vaswani2017attention"])).not.toBe(renumbered);
    setReferences(BIB);
    const written = expandComposite(theme, "blank", numbered, order);
    expect(written).not.toBe(renumbered);
    expect(words(written)).toEqual(["[3][nobody2000?]"]);
  });

  it("leaves a composite that is not a citation to the same memory it always had", () => {
    const chat = { type: "chat", id: "m", x: 0, y: 0, w: 300, h: 200, messages: [{ role: "user", text: "Hi" }] } as unknown as Element;
    const first = expandComposite(theme, "blank", chat);
    setReferences(BIB);
    expect(expandComposite(theme, "blank", chat)).toBe(first);
  });
});

describe("the numbers of a deck", () => {
  it("count from the first slide, and the list prints every work in that order", () => {
    setReferences(BIB);
    const { engine } = cited();
    const order = citationOrder(engine.deck);
    expect(order).toEqual(["lecun2015deep", "vaswani2017attention"]);
    const slide = (n: number) => engine.deck.slides[n]!;
    expect(words(expandComposite(engine.deck.theme, "blank", slide(2).elements[0]!, order))).toEqual(["[2][1]"]);
    const list = words(expandComposite(engine.deck.theme, "blank", slide(3).elements[0]!, order));
    expect(list).toHaveLength(2);
    expect(list[0]).toMatch(/^\[1\] Y\. LeCun, Y\. Bengio, and G\. Hinton\. Deep learning\. Nature, 2015\.$/);
    expect(list[1]).toMatch(/^\[2\] A\. Vaswani, N\. Shazeer, and N\. Parmar\. Attention is all you need\./);
  });

  it("follow the slides when one is moved, and keep the same list while the works do not change", () => {
    const { engine, slides } = cited();
    const before = citationOrder(engine.deck);
    engine.apply("set_notes", { slide: slides[0]!, notes: "an edit that cites nothing new" });
    expect(citationOrder(engine.deck)).toBe(before);
    engine.apply("move_slides", { ids: [slides[1]!], to: 0 });
    expect(citationOrder(engine.deck)).toEqual(["vaswani2017attention", "lecun2015deep"]);
  });

  it("are the same numbers the engine works out from the deck itself", () => {
    const { engine, slides } = cited();
    // Two citations on one slide are read top to bottom and left to right, whatever their stacking; one is in a group.
    engine.apply("add_elements", {
      slide: slides[0]!,
      elements: [citation("low", ["low"], { x: 64, y: 400 }), citation("right", ["right"], { x: 500, y: 100 }), citation("left", ["left"], { x: 64, y: 100 }), citation("inner", ["inner"], { x: 64, y: 300 })] as never,
    });
    engine.apply("add_elements", { slide: slides[0]!, elements: [{ type: "text", id: "pad", x: 64, y: 330, w: 50, h: 20, text: { paragraphs: [{ runs: [{ t: "x" }] }] } }] });
    engine.apply("group_elements", { slide: slides[0]!, ids: ["inner", "pad"] });
    expect(citationOrder(engine.deck)).toEqual(engine.citationOrder());
    expect(engine.citationOrder()).toEqual(["left", "right", "inner", "low", "lecun2015deep", "vaswani2017attention"]);
  });
});

describe("lint against it", () => {
  it("checks keys against the page's bibliography when the call gives none, and says what it did not check when there is none", () => {
    const { engine } = cited();
    engine.apply("add_citation", { slide: engine.deck.slides[1]!.id, keys: ["vaswani2017"] });
    expect(engine.lintDeck().skipped.map((s) => s.rule)).toContain("unresolved-citation");
    setReferences(BIB);
    const report = engine.lintDeck();
    expect(report.skipped.map((s) => s.rule)).not.toContain("unresolved-citation");
    const bad = report.issues.filter((i) => i.rule === "unresolved-citation");
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ severity: "error" });
    expect(bad[0]?.message).toContain("vaswani2017attention");
    expect(engine.lintDeck({ refs: ["vaswani2017", "lecun2015deep", "vaswani2017attention"] }).issues.filter((i) => i.rule === "unresolved-citation")).toEqual([]);
  });
});

describe("the operations", () => {
  it("cite a work in the footer, once, in one step", () => {
    const engine = DeckEngine.create("Ops", "Light", 4);
    const slide = engine.apply("add_slide", { layout: "blank" }).output.slide;
    const first = engine.apply("add_citation", { slide, keys: ["a"] }).output;
    const second = engine.apply("add_citation", { slide, keys: ["a", "b"] }).output;
    expect(first).toMatchObject({ created: true, added: ["a"] });
    expect(second).toMatchObject({ created: false, added: ["b"], id: first.id });
    expect(engine.undoLabel).toBe("add_citation");
    engine.undo();
    expect(engine.deck.slides[1]?.elements.find((e) => e.id === first.id)).toMatchObject({ keys: ["a"] });
  });

  it("ungroup a citation into the words the editor shows", () => {
    setReferences(BIB);
    const engine = DeckEngine.create("Ops", "Light", 4);
    const slide = engine.apply("add_slide", { layout: "blank" }).output.slide;
    const { id } = engine.apply("add_citation", { slide, keys: ["vaswani2017attention"] }).output;
    engine.apply("expand_composite", { slide, id });
    const group = engine.deck.slides[1]?.elements.find((e) => e.id === id) ?? null;
    expect(words(group)).toEqual(["Vaswani et al., 2017 (NeurIPS)"]);
  });

  it("write a citation into the PowerPoint file as the editor draws it", () => {
    setReferences(BIB);
    const { engine } = cited();
    const file = engine.exportPptx();
    expect(file.bytes.length).toBeGreaterThan(1000);
    expect(file.warnings).toEqual([]);
  });
});
