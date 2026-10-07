import type { Deck, Slide } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import type { AgentOp, Proposal } from "../../../lib/vault/types";
import { deckDelta, deckTexts, deltaWords, isDeckProposal, slideTitle } from "./deck-changes";

const slide = (id: string, title: string, extra: Record<string, unknown> = {}): Slide =>
  ({ id, layout: "title-body", elements: [{ id: `e-${id}`, type: "text", placeholder: "title", text: { paragraphs: [{ runs: [{ t: title }] }] } }], ...extra }) as unknown as Slide;

const deck = (slides: Slide[], extra: Record<string, unknown> = {}): Deck => ({ format: "kasten-deck", formatVersion: 1, id: "d-1", title: "Talk", size: { w: 960, h: 540 }, slides, ...extra }) as unknown as Deck;

const proposal = (op: AgentOp, before: string | null = null): Proposal => ({
  id: "p1",
  created: "2026-09-29T10:00:00Z",
  session: "s1",
  client: "claude-code",
  status: "pending",
  op,
  target: { path: "library/talk.deck", title: "Talk" },
  reason: "",
  note: null,
  diff: "",
  before,
  after: null,
  decided: null,
  decidedBy: null,
});

const SIX = ["Intro", "Method", "Data", "Results", "Limits", "Thanks"].map((title, i) => slide(`s-${i}`, title));

describe("slideTitle", () => {
  it("is the title slot, else the first words, else the layout", () => {
    expect(slideTitle(slide("s-a", "  The   plan \n now "))).toBe("The plan now");
    const body = { id: "s-b", layout: "blank", elements: [{ id: "e", type: "shape", text: { paragraphs: [{ runs: [{ t: "First " }, { t: "words" }] }] } }] } as unknown as Slide;
    expect(slideTitle(body)).toBe("First words");
    expect(slideTitle({ id: "s-c", layout: "blank", elements: [] } as unknown as Slide)).toBe("blank");
    const long = slideTitle(slide("s-d", "word ".repeat(40)));
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(61);
  });
});

describe("deckDelta", () => {
  it("finds nothing between a deck and itself", () => {
    const delta = deckDelta(deck(SIX), deck(SIX));
    expect(delta).toMatchObject({ changes: [], reordered: false, settings: false, slidesBefore: 6, slidesAfter: 6 });
    expect(deltaWords(delta)).toBe("No slide differs");
  });

  it("lists removed, changed and added slides in deck order, a removed one where it stood", () => {
    const after = deck([SIX[0]!, slide("s-1", "Method, reworded"), SIX[3]!, slide("s-new", "Extra"), SIX[5]!]);
    const { changes, slidesBefore, slidesAfter } = deckDelta(deck(SIX), after);
    expect(changes.map((c) => `${c.kind}:${c.id}`)).toEqual(["changed:s-1", "removed:s-2", "removed:s-4", "added:s-new"]);
    expect([slidesBefore, slidesAfter]).toEqual([6, 5]);
    const method = changes.find((c) => c.id === "s-1")!;
    expect(method.title).toBe("Method, reworded");
    expect(method.before).toMatchObject({ number: 2 });
    expect(method.after).toMatchObject({ number: 2 });
    const data = changes.find((c) => c.id === "s-2")!;
    expect(data).toMatchObject({ kind: "removed", title: "Data", before: { number: 3 }, after: null });
    const extra = changes.find((c) => c.id === "s-new")!;
    expect(extra).toMatchObject({ kind: "added", before: null, after: { number: 4 } });
  });

  it("puts a removed first slide first", () => {
    const { changes } = deckDelta(deck(SIX), deck(SIX.slice(2)));
    expect(changes.map((c) => c.id)).toEqual(["s-0", "s-1"]);
    expect(changes.every((c) => c.kind === "removed")).toBe(true);
    expect(deltaWords(deckDelta(deck(SIX), deck(SIX.slice(2))))).toBe("2 slides removed");
  });

  it("notices another order and the deck's own settings", () => {
    const swapped = deckDelta(deck(SIX), deck([SIX[1]!, SIX[0]!, ...SIX.slice(2)]));
    expect(swapped).toMatchObject({ reordered: true, settings: false, changes: [] });
    expect(deltaWords(swapped)).toBe("new order");
    // Slides added or removed are not a new order.
    expect(deckDelta(deck(SIX), deck(SIX.slice(0, 5))).reordered).toBe(false);
    const retitled = deckDelta(deck(SIX), deck(SIX, { title: "Talk 2" }));
    expect(retitled.settings).toBe(true);
    expect(deltaWords(deckDelta(deck(SIX), deck([...SIX.slice(0, 4), slide("s-4", "Limits, more")], { title: "T" })))).toBe("1 slide removed, 1 slide changed, deck settings changed");
  });
});

describe("deckTexts", () => {
  it("has both versions of an edit, only the new deck of a creation and only the old one of a trash", () => {
    const edit = proposal({ kind: "edit_deck", path: "library/talk.deck", tool: "add_slide", summary: "add slide", base: "OLD", text: "NEW", sent: 10 });
    expect(deckTexts(edit)).toEqual({ before: "OLD", after: "NEW" });
    expect(deckTexts(proposal({ kind: "create_deck", title: "Talk", tool: "create_deck", text: "NEW", sent: 1 }))).toEqual({ before: null, after: "NEW" });
    expect(deckTexts(proposal({ kind: "trash", path: "library/talk.deck" }, "OLD"))).toEqual({ before: "OLD", after: null });
    expect(deckTexts(proposal({ kind: "trash", path: "library/talk.deck" }))).toBeNull();
    expect(deckTexts(proposal({ kind: "trash", path: "library/note.md" }, "text"))).toBeNull();
    expect(deckTexts(proposal({ kind: "append", path: "a.md", markdown: "x" }))).toBeNull();
    expect(isDeckProposal(edit)).toBe(true);
    expect(isDeckProposal(proposal({ kind: "append", path: "a.md", markdown: "x" }))).toBe(false);
    // An op stored without its texts (hand-written) is drawn as words.
    expect(isDeckProposal(proposal({ kind: "edit_deck", path: "library/talk.deck" }))).toBe(false);
  });
});
