// A page's tags and properties under its title: hidden while it has none,
// shown with the same typed editors as the right panel, and added from the
// header's "Add property".

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useShell } from "../../../lib/store";
import { MemoryVault } from "../preview/memory-vault";
import { useWorkspace } from "../store";
import { NotePage } from "./NotePage";

const SEED = {
  "tags/paper.yaml": "name: paper\ncolor: blue\nproperties:\n  - {key: status, type: select, options: [Idea, Drafting]}\n  - {key: venue, type: text}\n",
  "library/draft.md": "---\ntitle: Draft\ntags: [paper]\nprops:\n  status: Idea\n  mood: calm\n---\nIntro.\n",
  "library/plain.md": "---\ntitle: Plain\n---\nNothing else.\n",
};

let vault: MemoryVault;
const text = async (path: string) => (await vault.read(path)).text;

async function open(path: string) {
  useWorkspace.setState({ place: { view: "home" }, back: [], forward: [], toasts: [] });
  await useWorkspace.getState().connect({ client: vault });
  useWorkspace.getState().openPath(path);
  useShell.setState({ panels: [] });
  render(<NotePage client={vault} path={path} />);
  const editor = await screen.findByTestId("page-editor", {}, { timeout: 20_000 });
  await expect.poll(() => editor.querySelector(".ProseMirror") !== null, { timeout: 20_000 }).toBe(true);
}

beforeEach(() => {
  localStorage.clear();
  vault = new MemoryVault(SEED);
});
afterEach(cleanup);

describe("properties under the title", () => {
  it("shows tags, the tag's typed properties and the others, and saves an edit", async () => {
    await open("library/draft.md");
    const props = screen.getByRole("region", { name: "Properties" });
    expect(within(props).getByRole("button", { name: "Remove tag paper" })).toBeTruthy();
    const status = (await within(props).findByRole("combobox", { name: "status" })) as HTMLSelectElement;
    expect(status.value).toBe("Idea");
    expect((within(props).getByLabelText("mood") as HTMLInputElement).value).toBe("calm");
    expect(screen.queryByRole("button", { name: /Add property/ })).toBeTruthy();

    await act(async () => fireEvent.change(status, { target: { value: "Drafting" } }));
    await expect.poll(() => text("library/draft.md")).toContain("status: Drafting");
  });

  it("stays hidden on a page without any, until Add property", async () => {
    await open("library/plain.md");
    expect(screen.queryByRole("region", { name: "Properties" })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Add property/ })));
    const props = screen.getByRole("region", { name: "Properties" });
    const form = within(props).getByRole("form", { name: "New property" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Property name" }), { target: { value: "source" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Property value" }), { target: { value: "Library" } });
    await act(async () => fireEvent.submit(form));
    await expect.poll(() => text("library/plain.md")).toMatch(/props:\n {2}source: Library\n/);
    expect((await within(screen.getByRole("region", { name: "Properties" })).findByLabelText("source")) as HTMLInputElement).toBeTruthy();
    expect(await text("library/plain.md")).toContain("Nothing else.\n");
  });

  it("goes away again when Add property is cancelled", async () => {
    await open("library/plain.md");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Add property/ })));
    fireEvent.click(within(screen.getByRole("form", { name: "New property" })).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("region", { name: "Properties" })).toBeNull();
  });
});
