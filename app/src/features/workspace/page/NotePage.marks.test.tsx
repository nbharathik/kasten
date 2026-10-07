// A page shows an agent's writing with a margin and a badge, read from the
// vault when it opens; the badge's card accepts it, undoes the session or opens
// it in History.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AgentMark, Undone } from "../../../lib/vault/types";
import { MemoryVault } from "../preview/memory-vault";
import { useWorkspace } from "../store";
import { NotePage } from "./NotePage";

const PATH = "library/plan.md";
const TEXT = "---\ntitle: Plan\n---\nMine.\n\nAn agent's paragraph.\n";
const MARK: AgentMark = { start: 2, end: 3, session: "S1", client: "claude-code", commit: "c1", time: Date.now() - 60_000 };

/** The preview vault, with one agent paragraph in one note. */
class MarkedVault extends MemoryVault {
  accepted = false;
  undone: string[] = [];

  override async agentMarks(path = ""): Promise<AgentMark[]> {
    return path === PATH && !this.accepted ? [MARK] : [];
  }

  override async acceptAgentMarks(): Promise<void> {
    this.accepted = true;
  }

  override async undoSession(session = ""): Promise<Undone> {
    this.undone.push(session);
    return { reverted: ["c1"], conflict: null };
  }
}

let vault: MarkedVault;

async function open() {
  await useWorkspace.getState().connect({ client: vault });
  useWorkspace.getState().openPath(PATH);
  render(<NotePage client={vault} path={PATH} />);
  const editor = await screen.findByTestId("page-editor", {}, { timeout: 20_000 });
  await expect.poll(() => editor.querySelector(".kasten-agent-badge"), { timeout: 20_000 }).not.toBeNull();
  return editor;
}

const card = (label: string) => {
  const found = [...document.querySelectorAll<HTMLButtonElement>(".kasten-agent-card button")].find((b) => b.textContent === label);
  if (!found) throw new Error(`No “${label}” button`);
  return found;
};

const toasts = () => useWorkspace.getState().toasts.map((t) => t.text);

beforeEach(() => {
  localStorage.clear();
  vault = new MarkedVault({ [PATH]: TEXT });
});
afterEach(cleanup);

describe("agent marks on a page", () => {
  it("marks the agent's paragraph, and accepting clears it without touching the file", async () => {
    const editor = await open();
    expect([...editor.querySelectorAll(".kasten-agent-block")].map((n) => n.textContent)).toEqual(["An agent's paragraph."]);
    fireEvent.click(editor.querySelector(".kasten-agent-badge")!);
    await act(async () => fireEvent.click(card("Accept")));
    expect(vault.accepted).toBe(true);
    await expect.poll(() => editor.querySelector(".kasten-agent-block")).toBeNull();
    expect(toasts().some((t) => t.startsWith("Accepted"))).toBe(true);
    expect((await vault.read(PATH)).text).toBe(TEXT);
  });

  it("undoes the session once asked twice, and opens it in History", async () => {
    const editor = await open();
    fireEvent.click(editor.querySelector(".kasten-agent-badge")!);
    fireEvent.click(card("Undo this session"));
    expect(vault.undone).toEqual([]);
    await act(async () => fireEvent.click(card("Undo session")));
    expect(vault.undone).toEqual(["S1"]);
    expect(toasts()).toContain("Undid the session: 1 change reverted");

    const again = await screen.findByTestId("page-editor");
    await expect.poll(() => again.querySelector(".kasten-agent-badge"), { timeout: 20_000 }).not.toBeNull();
    fireEvent.click(again.querySelector(".kasten-agent-badge")!);
    act(() => card("See in History").click());
    expect(useWorkspace.getState().place).toEqual({ view: "history" });
  });
});
