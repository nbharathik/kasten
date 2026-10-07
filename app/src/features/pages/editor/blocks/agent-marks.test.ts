// Agent marks in the page editor: the blocks
// over an agent's lines get a margin and one badge per mark, an edited
// block loses its mark at once, and the badge's card does what it says.

import type { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentMark } from "../../../../lib/vault/types";
import { createKastenCrepe } from "../crepe";
import { openNote } from "../session";
import { setAgentMarks, type AgentActions } from "./agent-marks";

// Lines: 0 "# Plan", 2 "My own paragraph.", 4 "An agent's paragraph.", 6 and 7 the list.
const BODY = "# Plan\n\nMy own paragraph.\n\nAn agent's paragraph.\n\n- first\n- second\n";
const MARK: AgentMark = { start: 4, end: 8, session: "S1", client: "claude-code", commit: "c1", time: Date.now() - 5 * 60_000 };

let crepe: Crepe;
let root: HTMLElement;
const actions = { accept: vi.fn(async () => {}), undo: vi.fn(async () => {}), history: vi.fn() } satisfies AgentActions;

beforeAll(async () => {
  root = document.createElement("div");
  document.body.append(root);
  crepe = await createKastenCrepe(root, { agent: actions });
});

afterAll(async () => {
  await crepe.destroy();
  root.remove();
});

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockClear();
  document.querySelector(".kasten-agent-card")?.remove();
});

const view = () => crepe.editor.ctx.get(editorViewCtx);
const marked = () => [...root.querySelectorAll(".kasten-agent-block")].map((n) => n.textContent ?? "");
const badges = () => [...root.querySelectorAll<HTMLButtonElement>(".kasten-agent-badge")];

function open(marks: AgentMark[] = [MARK]) {
  const note = openNote(crepe, BODY);
  setAgentMarks(view(), { blocks: note.blocks, marks });
  return note;
}

const button = (label: string) => {
  const found = [...document.querySelectorAll<HTMLButtonElement>(".kasten-agent-card button")].find((b) => b.textContent === label);
  if (!found) throw new Error(`No “${label}” button`);
  return found;
};

describe("agent marks in the page editor", () => {
  it("marks the blocks over an agent's lines, with one badge, and writes nothing", () => {
    const note = open();
    expect(marked()).toHaveLength(2);
    expect(marked()[0]).toBe("An agent's paragraph.");
    expect(marked()[1]).toContain("second");
    expect(badges()).toHaveLength(1);
    expect(badges()[0]!.textContent).toBe("claude-code");
    expect(badges()[0]!.querySelector(".kasten-agent-star svg")).toBeTruthy();
    expect(note.save()).toBe(BODY);
    setAgentMarks(view(), { marks: [] });
    expect(marked()).toEqual([]);
    expect(badges()).toEqual([]);
  });

  it("drops the mark of a block the person edits, and the badge moves on", () => {
    const note = open();
    let at = -1;
    view().state.doc.descendants((node, p) => {
      if (at < 0 && node.isText && node.text?.startsWith("An agent's")) at = p;
      return at < 0;
    });
    expect(at).toBeGreaterThan(0);
    view().dispatch(view().state.tr.insertText("Mine now. ", at));
    expect(marked()).toHaveLength(1);
    expect(marked()[0]).toContain("second");
    expect(badges()).toHaveLength(1);
    expect(note.save()).toContain("Mine now. An agent's paragraph.");
    // Undoing the edit brings the mark back.
    view().dispatch(view().state.tr.delete(at, at + "Mine now. ".length));
    expect(marked()).toHaveLength(2);
  });

  it("opens a card to accept, to undo the session after asking, or to see it in History", async () => {
    open();
    badges()[0]!.click();
    const card = document.querySelector(".kasten-agent-card");
    expect(card?.textContent).toContain("Written by claude-code");
    expect(card?.textContent).toContain("5 minutes ago");

    button("See in History").click();
    expect(actions.history).toHaveBeenCalledWith("S1");
    expect(document.querySelector(".kasten-agent-card")).toBeNull();

    badges()[0]!.click();
    button("Undo this session").click();
    expect(actions.undo).not.toHaveBeenCalled();
    expect(document.querySelector(".kasten-agent-card")?.textContent).toContain("Undo everything this session changed?");
    button("Undo session").click();
    await vi.waitFor(() => expect(document.querySelector(".kasten-agent-card")).toBeNull());
    expect(actions.undo).toHaveBeenCalledWith("S1");

    badges()[0]!.click();
    button("Accept").click();
    await vi.waitFor(() => expect(actions.accept).toHaveBeenCalledOnce());
  });

  it("says why when an action fails, and keeps the card", async () => {
    open();
    actions.accept.mockRejectedValueOnce(new Error("History is off"));
    badges()[0]!.click();
    button("Accept").click();
    await vi.waitFor(() => expect(document.querySelector(".kasten-agent-card-text")?.textContent).toBe("History is off"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".kasten-agent-card")).toBeNull();
  });
});
