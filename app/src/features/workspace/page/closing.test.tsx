// A page that closes the moment after typing keeps the typing: the editor's
// last 200 ms and a title never left are written, not dropped.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../preview/memory-vault";
import { useWorkspace } from "../store";
import { NotePage } from "./NotePage";

const SEED = {
  "library/welcome.md": "---\nid: W\ntitle: Welcome\n---\nGetting around\n",
};

let vault: MemoryVault;

async function open(path: string) {
  await useWorkspace.getState().connect({ client: vault });
  useWorkspace.getState().openPath(path);
  render(<NotePage client={vault} path={path} />);
  const editor = await screen.findByTestId("page-editor", {}, { timeout: 20_000 });
  await expect.poll(() => editor.textContent, { timeout: 20_000 }).toContain("Getting around");
  return editor;
}

const saved = async () => (await vault.list()).map((n) => n.path);
const textOf = async (path: string) => (await vault.read(path)).text;

beforeEach(() => {
  localStorage.clear();
  vault = new MemoryVault(SEED);
});
afterEach(cleanup);

describe("a page closed straight after typing", () => {
  it("writes the editor's last moments of typing", async () => {
    const editor = await open("library/welcome.md");
    const line = editor.querySelector(".ProseMirror p")!.firstChild as Text;
    await act(async () => {
      // What typing does: the editor reads the change from the page.
      line.data = "Getting around town";
      await Promise.resolve();
    });
    // Closed well within the editor's 200 ms pause.
    cleanup();
    await expect.poll(() => textOf("library/welcome.md")).toContain("Getting around town\n");
  });

  it("renames the page to a title typed and never left", async () => {
    await open("library/welcome.md");
    fireEvent.change(screen.getByRole("textbox", { name: "Page title" }), { target: { value: "Start here" } });
    cleanup();
    await expect.poll(saved).toContain("library/start-here.md");
    expect(await textOf("library/start-here.md")).toContain("title: Start here\n");
  });
});
