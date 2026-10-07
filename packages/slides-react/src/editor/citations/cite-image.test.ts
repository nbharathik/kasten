import type { Element } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { newDeck } from "../../test/engine.ts";
import { image } from "../factory.ts";
import { MemoryHost } from "../memory-host.ts";
import { EditorSession } from "../session/session.ts";
import { citeImage } from "./cite-image.ts";

type Cite = Extract<Element, { type: "citation" }>;

async function open() {
  const engine = await newDeck("Talk");
  const errors: string[] = [];
  const session = new EditorSession(engine, new MemoryHost(), { saveDelay: 60_000, onError: (message) => errors.push(message) });
  return { engine, session, errors };
}

const citations = (session: EditorSession, slideId = session.state.slideId): Cite[] =>
  (session.deck.slides.find((s) => s.id === slideId)?.elements ?? []).filter((e): e is Cite => e.type === "citation");

/** What placing a picture from the gallery does: the picture goes on the shown slide, then its paper is cited. */
function place(session: EditorSession, path: string, citationKey?: string): string | undefined {
  session.elements.insert([image(path, { x: 100, y: 100, w: 300, h: 200 })]);
  return citeImage(session, { citationKey });
}

describe("citing the paper of a picture that is placed on a slide", () => {
  it("makes the slide's footer citation with the paper's key", async () => {
    const { session, errors } = await open();
    const id = place(session, "assets/fig-1.png", "vaswani2017attention");
    const [footer] = citations(session);
    expect(citations(session)).toHaveLength(1);
    expect(footer).toMatchObject({ id, name: "citations", keys: ["vaswani2017attention"] });
    expect(errors).toEqual([]);
  });

  it("appends the key of the next picture to the footer that is there", async () => {
    const { session } = await open();
    place(session, "assets/fig-1.png", "vaswani2017attention");
    place(session, "assets/fig-2.png", "devlin2019bert");
    expect(citations(session)).toHaveLength(1);
    expect(citations(session)[0]!.keys).toEqual(["vaswani2017attention", "devlin2019bert"]);
  });

  it("cites a paper once, however many of its figures are on the slide, and adds no step of undo for the second", async () => {
    const { session, engine } = await open();
    const first = place(session, "assets/fig-1.png", "vaswani2017attention");
    session.elements.insert([image("assets/fig-2.png", { x: 420, y: 100, w: 300, h: 200 })]);
    const before = engine.undoLabel;
    const again = citeImage(session, { citationKey: "vaswani2017attention" });
    expect(again).toBe(first);
    expect(citations(session)[0]!.keys).toEqual(["vaswani2017attention"]);
    // The last thing done is still the picture put on the slide.
    expect(engine.undoLabel).toBe(before);
    expect(engine.undoLabel).toBe("add_elements");
  });

  it("keeps the picture selected: the footer is not what the person is working on", async () => {
    const { session } = await open();
    const [picture] = session.elements.insert([image("assets/fig-1.png", { x: 100, y: 100, w: 300, h: 200 })]);
    citeImage(session, { citationKey: "vaswani2017attention" });
    expect(session.state.selection).toEqual([picture]);
  });

  it("does nothing for a picture that comes from no paper", async () => {
    const { session, engine } = await open();
    session.elements.insert([image("assets/photo.png", { x: 100, y: 100, w: 300, h: 200 })]);
    const before = engine.undoLabel;
    expect(citeImage(session, {})).toBeUndefined();
    expect(citeImage(session, { citationKey: "" })).toBeUndefined();
    expect(citeImage(session, { citationKey: "   " })).toBeUndefined();
    expect(citations(session)).toEqual([]);
    expect(engine.undoLabel).toBe(before);
  });

  it("adds to a citation the person made by hand, wherever it is", async () => {
    const { session } = await open();
    const [own] = session.elements.insert([{ type: "citation", id: "", x: 64, y: 480, w: 400, h: 28, keys: ["own2020"] } as Element]);
    place(session, "assets/fig-1.png", "vaswani2017attention");
    expect(citations(session)).toHaveLength(1);
    expect(citations(session)[0]).toMatchObject({ id: own, keys: ["own2020", "vaswani2017attention"] });
  });

  it("cites on the slide that is shown, and on no other", async () => {
    const { session } = await open();
    const first = session.state.slideId;
    const second = session.slides.add({ layout: "blank" })!;
    expect(session.state.slideId).toBe(second);
    place(session, "assets/fig-1.png", "vaswani2017attention");
    expect(citations(session, second)).toHaveLength(1);
    expect(citations(session, first)).toEqual([]);
  });

  it("is one step of undo for the footer, and the picture stays until the next", async () => {
    const { session } = await open();
    place(session, "assets/fig-1.png", "vaswani2017attention");
    session.undo();
    expect(citations(session)).toEqual([]);
    expect(session.slide.elements.some((e) => e.type === "image")).toBe(true);
    session.undo();
    expect(session.slide.elements.some((e) => e.type === "image")).toBe(false);
  });

  it("says why when the key cannot be cited, and leaves the picture where it is", async () => {
    const { session, errors } = await open();
    expect(place(session, "assets/fig-1.png", "two words")).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/BibTeX key/);
    expect(citations(session)).toEqual([]);
    expect(session.slide.elements.some((e) => e.type === "image")).toBe(true);
  });
});
