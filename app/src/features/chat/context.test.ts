import { describe, expect, it } from "vitest";

import type { NoteMeta } from "../../lib/vault/types";
import { boardChip, cardsChip, noteChip, searchChip, tagChip } from "./context";
import { applyEvent, newThread, startTurn, type Answer } from "./thread";
import { cardFrom, describeCall, transcript } from "./transcript";

const note = (path: string, title: string, words: number, extra: Partial<NoteMeta> = {}): NoteMeta => ({
  path,
  id: null,
  title,
  kind: "page",
  icon: null,
  cover: null,
  parent: null,
  project: null,
  tags: [],
  modified: 0,
  created: null,
  updated: null,
  excerpt: "",
  words,
  props: {},
  locked: false,
  ...extra,
});

const PLAN = note("library/plan.md", "Plan", 200);
const PAPER = note("library/paper.md", "Paper", 1000, { tags: ["paper"], props: { status: "Idea" } });
const DRAFT = note("library/draft.md", "Draft", 500, { tags: ["paper"], props: { status: "Drafting" } });

describe("context chips", () => {
  it("name what each stands for", () => {
    expect(noteChip(PLAN)).toEqual({ kind: "note", label: "Plan", ref: ["library/plan.md"] });
    expect(cardsChip([PLAN, PAPER])).toEqual({ kind: "cards", label: "2 cards", ref: ["library/plan.md", "library/paper.md"] });
    expect(cardsChip([DRAFT])).toMatchObject({ label: "Draft" });
    const pipeline = { name: "Pipeline", type: "kanban" as const, filter: [{ key: "status", op: "is" as const, value: "Idea" }] };
    expect(tagChip("paper", pipeline)).toEqual({ kind: "tag", label: "#paper · Pipeline", ref: ["paper", "Pipeline"] });
    expect(tagChip("paper", null)).toEqual({ kind: "tag", label: "#paper", ref: ["paper"] });
    expect(boardChip({ path: "boards/trip.canvas", title: "Trip" })).toEqual({ kind: "board", label: "Trip", ref: ["boards/trip.canvas"] });
    expect(searchChip(" hilltown ")).toEqual({ kind: "search", label: "“hilltown”", ref: ["hilltown"] });
  });
});

describe("transcripts and cards", () => {
  const names = { notes: [PLAN, note("inbox/hotel-ideas.md", "Hotel ideas", 20)], boards: [{ path: "boards/trip.canvas", title: "Trip", project: null, nodes: 2, modified: 0 }] };

  it("writes a heading per turn and a bullet per tool call", () => {
    let thread = startTurn(newThread({ context: [{ ...noteChip(PLAN) }, { ...boardChip({ path: "boards/trip.canvas", title: "Trip" }) }] }), "Plan the trip", "Claude", "model-small");
    const ev = (e: object) => ({ chat: thread.id, turn: "t1", ...e }) as never;
    thread = applyEvent(thread, ev({ kind: "text", text: "I'll add a card." }));
    thread = applyEvent(thread, ev({ kind: "tool", tool: { id: "k1", name: "create_note", input: { title: "Hotel ideas" } } }));
    thread = applyEvent(thread, ev({ kind: "toolResult", result: { id: "k1", ok: true, summary: "Created card “Hotel ideas”", paths: ["inbox/hotel-ideas.md"] } }));
    thread = applyEvent(thread, ev({ kind: "tool", tool: { id: "k2", name: "trash_note", input: {} } }));
    thread = applyEvent(thread, ev({ kind: "toolResult", result: { id: "k2", ok: false, summary: "The note is locked", paths: [] } }));
    thread = applyEvent(thread, ev({ kind: "text", text: "Done." }));
    thread = applyEvent(thread, ev({ kind: "done" }));
    const markdown = transcript(thread, names, new Date(2026, 8, 24, 14, 3));
    expect(markdown).toContain("- Model: Claude · model-small\n");
    expect(markdown).toContain(
      "## You\n\n*Context: [[Plan]], board “Trip”*\n\nPlan the trip\n\n## Claude\n\nI'll add a card.\n\n- Created card “Hotel ideas”: [[Hotel ideas]]\n- Failed: The note is locked\n\nDone.\n",
    );
    expect(describeCall("add_to_board", { title: "Trip" })).toBe("Add to board “Trip”");
  });

  it("makes a card from an answer's first heading or line", () => {
    const answer = (text: string): Answer => ({ id: "a", role: "assistant", turn: "t", provider: "Claude", model: "m", parts: [{ kind: "text", text }], status: "done", error: null, pinned: null });
    expect(cardFrom(answer("## Hilltown in three days\n\nDay one: temples."))).toEqual({ title: "Hilltown in three days", body: "## Hilltown in three days\n\nDay one: temples.\n" });
    expect(cardFrom(answer("**Short answer:** see [[Plan]] for the rest of it, which is long enough to be cut somewhere sensible")).title).toBe("Short answer: see Plan for the rest of it, which is long…");
    expect(cardFrom(answer("")).title).toBe("Chat answer");
  });
});
