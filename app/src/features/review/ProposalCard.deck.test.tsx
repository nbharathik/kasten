import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentOp, Proposal } from "../../lib/vault/types";

// The slides code is large and needs a browser to draw: the thumbnails and the engine are stand-ins here.
vi.mock("./deck/SlideThumb", () => ({
  SlideThumb: ({ label }: { label: string }) => <div data-testid="thumb" aria-label={label} />,
}));
vi.mock("@kasten-slides/wasm", () => ({
  loadSlides: async () => undefined,
  DeckEngine: { open: (text: string) => ({ deck: JSON.parse(text) }) },
}));

import { ProposalCard } from "./ProposalCard";

afterEach(cleanup);

const deck = (titles: string[]): string =>
  JSON.stringify({
    format: "kasten-deck",
    formatVersion: 1,
    id: "d-1",
    title: "Tool use",
    size: { w: 960, h: 540 },
    slides: titles.map((t) => ({ id: `s-${t}`, layout: "title-body", elements: [{ id: `e-${t}`, type: "text", placeholder: "title", text: { paragraphs: [{ runs: [{ t }] }] } }] })),
  });

const proposal = (op: AgentOp, extra: Partial<Proposal> = {}): Proposal => ({
  id: "p1",
  created: new Date().toISOString(),
  session: "s1",
  client: "claude-code",
  status: "pending",
  op,
  target: { path: "library/tool-use.deck", title: "Tool use" },
  reason: "Removes 4 slides in one change (the limit is 3)",
  note: null,
  diff: "Update elements: removes 4 slides",
  before: null,
  after: null,
  decided: null,
  decidedBy: null,
  ...extra,
});

const props = (p: Proposal, onDecide = vi.fn(), onOpen = vi.fn()) => ({ proposal: p, state: {}, mode: "split" as const, note: undefined, onDecide, onOpen, onStep: vi.fn() });

describe("a deck proposal in the review queue", () => {
  it("shows the slides that change, why it waits, and can be accepted or rejected", async () => {
    const edit = proposal({ kind: "edit_deck", path: "library/tool-use.deck", tool: "update_elements", summary: "update elements", base: deck(["a", "b", "c", "d", "e"]), text: deck(["e"]), sent: 90 });
    const onDecide = vi.fn();
    render(<ProposalCard {...props(edit, onDecide)} />);
    expect(screen.getByRole("heading", { name: /Tool use/ })).toBeTruthy();
    expect(screen.getByText("Update elements")).toBeTruthy();
    expect(screen.getByText("Removes 4 slides in one change (the limit is 3)")).toBeTruthy();
    // The slides arrive once their code has loaded.
    expect(await screen.findAllByTestId("thumb")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /^Accept/ }));
    expect(onDecide).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByRole("button", { name: /^Reject/ }));
    expect(onDecide).toHaveBeenLastCalledWith("reject");
  });

  it("opens the deck from its title", () => {
    const edit = proposal({ kind: "edit_deck", path: "library/tool-use.deck", tool: "add_slide", summary: "add slide", base: deck(["a"]), text: deck(["a", "b"]), sent: 9 });
    const onOpen = vi.fn();
    render(<ProposalCard {...props(edit, vi.fn(), onOpen)} />);
    fireEvent.click(screen.getByRole("button", { name: /Tool use/ }));
    expect(onOpen).toHaveBeenCalledWith("library/tool-use.deck");
  });

  it("shows a deck for the trash as the deck it is, and says the move always waits", async () => {
    const trash = proposal({ kind: "trash", path: "library/tool-use.deck" }, { before: deck(["a", "b"]), reason: "Trashing a deck always waits for review", diff: "Move the deck “Tool use” to the trash" });
    render(<ProposalCard {...props(trash)} />);
    expect(screen.getByText("Move deck to trash")).toBeTruthy();
    expect(await screen.findAllByTestId("thumb")).toHaveLength(2);
    expect(screen.getByText("Trashing a deck always waits for review")).toBeTruthy();
  });

  it("names a new deck and draws its first slides", async () => {
    const made = proposal({ kind: "create_deck", title: "Q3 review", tool: "create_deck", text: deck(["a", "b", "c"]), sent: 50 }, { target: null, diff: "Create the deck “Q3 review” with 3 slides", reason: "This session changed 25 notes in the last 10 minutes" });
    render(<ProposalCard {...props(made)} />);
    expect(screen.getByText("New deck")).toBeTruthy();
    expect(screen.getByText("Create the deck “Q3 review”")).toBeTruthy();
    expect(await screen.findAllByTestId("thumb")).toHaveLength(3);
  });

  it("leaves a proposal for a note to the text diff", () => {
    const note = proposal({ kind: "append", path: "a.md", markdown: "x" }, { target: { path: "a.md", title: "A" }, before: "one\n", after: "one\ntwo\n", diff: "", reason: "Because" });
    render(<ProposalCard {...props(note)} />);
    expect(screen.queryByTestId("thumb")).toBeNull();
    expect(screen.getByRole("table", { name: "Changes to A" })).toBeTruthy();
  });
});
