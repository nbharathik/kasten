import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useBoards } from "../../boards/store";
import { useTags } from "../../tags/store";
import { MemoryVault } from "../../workspace/preview/memory-vault";
import { useWorkspace } from "../../workspace/store";
import { noteAt } from "../../workspace/tree";
import { ChatDock } from "../ChatDock";
import { useChat } from "../store";
import { resetChat, scriptedChat, type Scripted } from "../test-kit";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

const SEED = {
  "library/plan.md": `---\ntitle: Plan\n---\n${words(800)}\n`,
  "library/paper.md": "---\ntitle: Paper\ntags: [paper]\nprops:\n  status: Idea\n---\nAn idea.\n",
  "library/draft.md": "---\ntitle: Draft\ntags: [paper]\nprops:\n  status: Drafting\n---\nA draft.\n",
  "tags/paper.yaml": "name: paper\nproperties:\n  - {key: status, type: select, options: [Idea, Drafting]}\nviews:\n  - {name: Pipeline, type: kanban, group_by: status}\n  - {name: Ideas, type: table, filter: [{key: status, op: is, value: Idea}]}\n",
};

let chat: Scripted;
let vault: MemoryVault;

async function showPanel() {
  await useWorkspace.getState().connect({ client: vault });
  useWorkspace.getState().openPath(noteAt(useWorkspace.getState().notes, "library/plan.md")!.path);
  render(<ChatDock />);
  return screen.findByRole("group", { name: "Context" });
}

const chipLabels = (chips: HTMLElement) => [...chips.querySelectorAll(".kasten-chat-chip-label")].map((c) => c.textContent);
const add = (item: RegExp) => {
  fireEvent.click(screen.getByRole("button", { name: "+ Context" }));
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
};

beforeEach(() => {
  localStorage.clear();
  vault = new MemoryVault(SEED);
  chat = scriptedChat();
  resetChat(chat);
  useBoards.setState({ list: [], loaded: false });
  useTags.setState({ schemas: null });
});
afterEach(cleanup);

describe("Context chips", () => {
  it("start with the open page, without a token count, and go with the message", async () => {
    const chips = await showPanel();
    expect(chipLabels(chips)).toEqual(["Plan"]);
    // No estimate: it could not be right for every model.
    expect(within(chips).queryByText(/tokens/)).toBeNull();
    fireEvent.click(within(chips).getByRole("button", { name: "Remove Plan" }));
    expect(chipLabels(chips)).toEqual([]);
    add(/This page/);
    expect(chipLabels(chips)).toEqual(["Plan"]);
    // Added once only.
    fireEvent.click(screen.getByRole("button", { name: "+ Context" }));
    expect((screen.getByRole("menuitem", { name: /This page/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "Summarise it" } });
    await act(async () => fireEvent.keyDown(box, { key: "Enter" }));
    expect(chat.requests[0]!.context).toEqual([{ kind: "note", label: "Plan", ref: ["library/plan.md"] }]);
  });

  it("add a board, a tag view, search results and another page", async () => {
    const board = await vault.createBoard("Trip", null);
    await vault.addToBoard(board, ["library/plan.md"]);
    const chips = await showPanel();

    add(/A board/);
    fireEvent.click(await screen.findByRole("option", { name: /Trip/ }));
    await expect.poll(() => chipLabels(chips)).toEqual(["Plan", "Trip"]);

    add(/A tag view/);
    fireEvent.click(await screen.findByRole("option", { name: /#paper/ }));
    fireEvent.click(await screen.findByRole("option", { name: /Ideas/ }));
    expect(chipLabels(chips)).toContain("#paper · Ideas");

    add(/Search results/);
    const search = screen.getByRole("dialog", { name: "Add search results" });
    fireEvent.change(within(search).getByRole("textbox", { name: "Search for" }), { target: { value: "draft" } });
    fireEvent.click(within(search).getByRole("button", { name: "Add results" }));
    expect(chipLabels(chips)).toContain("“draft”");

    add(/A page or card/);
    const find = screen.getByRole("textbox", { name: "Find a page or card" });
    fireEvent.change(find, { target: { value: "dra" } });
    fireEvent.keyDown(find, { key: "Enter" });
    await expect.poll(() => chipLabels(chips)).toEqual(["Plan", "Trip", "#paper · Ideas", "“draft”", "Draft"]);

    const id = useChat.getState().active!;
    expect(useChat.getState().threads[id]!.context.map((c) => [c.kind, c.ref])).toEqual([
      ["note", ["library/plan.md"]],
      ["board", [board]],
      ["tag", ["paper", "Ideas"]],
      ["search", ["draft"]],
      ["note", ["library/draft.md"]],
    ]);
  });
});
