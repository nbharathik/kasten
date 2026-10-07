import type { Slide } from "@kasten-slides/wasm";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentOp, Proposal } from "../../../lib/vault/types";

// The slides code is large and needs a browser to draw: the thumbnails and the engine are stand-ins here.
vi.mock("./SlideThumb", () => ({
  SlideThumb: ({ label, number }: { label: string; number: number }) => <div data-testid="thumb" data-number={number} aria-label={label} />,
}));
vi.mock("@kasten-slides/wasm", () => ({
  loadSlides: async () => undefined,
  DeckEngine: { open: (text: string) => ({ deck: JSON.parse(text) }) },
}));

import DeckChange from "./DeckChange";

afterEach(cleanup);

const slide = (id: string, title: string): Slide =>
  ({ id, layout: "title-body", elements: [{ id: `e-${id}`, type: "text", placeholder: "title", text: { paragraphs: [{ runs: [{ t: title }] }] } }] }) as unknown as Slide;

const deckOf = (slides: Slide[], extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ format: "kasten-deck", formatVersion: 1, id: "d-1", title: "Talk", size: { w: 960, h: 540 }, slides, ...extra });

/** A deck of slides whose ids are their titles', so the same title is the same slide. */
const text = (titles: string[], extra: Record<string, unknown> = {}): string => deckOf(titles.map((t) => slide(`s-${t.toLowerCase().replace(/\W+/g, "")}`, t)), extra);

const proposal = (op: AgentOp, diff: string, before: string | null = null): Proposal => ({
  id: "p1",
  created: "2026-09-29T10:00:00Z",
  session: "s1",
  client: "claude-code",
  status: "pending",
  op,
  target: { path: "library/talk.deck", title: "Talk" },
  reason: "Removes 4 slides in one change (the limit is 3)",
  note: null,
  diff,
  before,
  after: null,
  decided: null,
  decidedBy: null,
});

const SIX = ["Intro", "Method", "Data", "Results", "Limits", "Thanks"];

const edit = (base: string, next: string, diff = "Update elements: removes 4 slides"): Proposal =>
  proposal({ kind: "edit_deck", path: "library/talk.deck", tool: "update_elements", summary: "update elements", base, text: next, sent: 120 }, diff);

describe("a deck change as slides", () => {
  it("shows each slide a change touches, before and after, with what happened to it", async () => {
    render(<DeckChange proposal={edit(text(SIX), text(SIX.slice(4)))} />);
    const list = await screen.findByRole("list", { name: "Slides that change" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    // Four slides go: each has a picture before and a "Removed" where the after would be.
    expect(within(list).getAllByText("Removed", { selector: "span.font-medium" })).toHaveLength(4);
    expect(within(rows[0]!).getByLabelText("Before: slide 1, Intro")).toBeTruthy();
    expect(within(rows[0]!).getByText("Removed", { selector: "div" })).toBeTruthy();
    // The header says it in the core's words and in counts.
    expect(screen.getByText("Update elements: removes 4 slides")).toBeTruthy();
    expect(screen.getByText(/4 slides removed/)).toBeTruthy();
  });

  it("draws a changed slide on both sides and a new one only after", async () => {
    const before = deckOf([slide("s-0", "Intro"), slide("s-1", "Method")]);
    const after = deckOf([slide("s-0", "Intro"), slide("s-1", "Method, reworded"), slide("s-new", "Extra")]);
    render(<DeckChange proposal={edit(before, after, "Update elements: changes 1 slide, adds 1 slide")} />);
    const list = await screen.findByRole("list", { name: "Slides that change" });
    const [changed, added] = within(list).getAllByRole("listitem");
    expect(within(changed!).getByLabelText("Before: slide 2, Method, reworded")).toBeTruthy();
    expect(within(changed!).getByLabelText("After: slide 2, Method, reworded")).toBeTruthy();
    expect(within(added!).getByText("Not in the deck yet")).toBeTruthy();
    expect(within(added!).getByLabelText("After: slide 3, Extra")).toBeTruthy();
  });

  it("starts with six changed slides and shows the rest on request", async () => {
    const many = Array.from({ length: 10 }, (_, i) => `Slide ${i}`);
    render(<DeckChange proposal={edit(text(many), text([]), "Removes 10 slides")} />);
    const list = await screen.findByRole("list", { name: "Slides that change" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Show 4 more slides" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
  });

  it("says so when only the deck's own settings change", async () => {
    render(<DeckChange proposal={edit(text(SIX), text(SIX, { title: "Talk 2" }), "Changes the deck's own settings")} />);
    expect(await screen.findByText("No slide differs; only the deck itself changes.")).toBeTruthy();
    expect(screen.getByText("deck settings changed")).toBeTruthy();
  });

  it("shows the first slides of a new deck and of a deck for the trash", async () => {
    const made = proposal({ kind: "create_deck", title: "Talk", tool: "create_deck", text: text(SIX.concat(["Extra", "More"])), sent: 10 }, "Create the deck “Talk” with 8 slides");
    render(<DeckChange proposal={made} />);
    const list = await screen.findByRole("list", { name: "Slides of the deck" });
    expect(within(list).getAllByTestId("thumb")).toHaveLength(6);
    expect(screen.getByText("The new deck · 8 slides")).toBeTruthy();
    expect(screen.getByText("and 2 more slides")).toBeTruthy();
    cleanup();
    const trashed = proposal({ kind: "trash", path: "library/talk.deck" }, "Move the deck “Talk” to the trash", text(["Only"]));
    render(<DeckChange proposal={trashed} />);
    expect(await screen.findByText("The deck that would go to the trash · 1 slide")).toBeTruthy();
    expect(screen.getAllByTestId("thumb")).toHaveLength(1);
  });

  it("falls back to the core's words when the slides cannot be read", async () => {
    render(<DeckChange proposal={edit("not json", text(SIX), "Update elements: removes 4 slides")} />);
    expect(await screen.findByText(/could not be drawn here/)).toBeTruthy();
    expect(screen.getByText("Update elements: removes 4 slides")).toBeTruthy();
    expect(screen.queryAllByTestId("thumb")).toHaveLength(0);
  });
});
