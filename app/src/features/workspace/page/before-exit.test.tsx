// Switching vaults or installing an update a moment after typing keeps
// the typing: it is written and committed before the app restarts.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryVault } from "../preview/memory-vault";
import { useWorkspace } from "../store";
import { writeEverything } from "./before-exit";
import { NotePage } from "./NotePage";

const SEED = {
  "library/welcome.md": "---\nid: W\ntitle: Welcome\n---\nGetting around\n",
};

let vault: MemoryVault;

beforeEach(() => {
  localStorage.clear();
  vault = new MemoryVault(SEED);
});
afterEach(cleanup);

describe("writing everything before the app restarts", () => {
  it("keeps typing from 300 ms before, inside the save delay, and commits it", async () => {
    await useWorkspace.getState().connect({ client: vault });
    useWorkspace.getState().openPath("library/welcome.md");
    render(<NotePage client={vault} path="library/welcome.md" />);
    const editor = await screen.findByTestId("page-editor", {}, { timeout: 20_000 });
    await expect.poll(() => editor.textContent, { timeout: 20_000 }).toContain("Getting around");
    const commit = vi.spyOn(vault, "commitEdits");

    const line = editor.querySelector(".ProseMirror p")!.firstChild as Text;
    await act(async () => {
      line.data = "Getting around town";
      await new Promise((done) => setTimeout(done, 300));
    });
    // Nothing is written yet: the page waits for typing to pause.
    expect((await vault.read("library/welcome.md")).text).not.toContain("town");

    await act(() => writeEverything());
    expect((await vault.read("library/welcome.md")).text).toContain("Getting around town\n");
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("goes ahead with no vault open", async () => {
    await useWorkspace.getState().connect({ client: null });
    await expect(writeEverything()).resolves.toBeUndefined();
  });
});
