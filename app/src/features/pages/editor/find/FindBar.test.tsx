// The find bar on a page: Mod+F in the page opens it on the selected text,
// counts and steps through matches, replaces them, and Escape closes it
// with the marks gone and the page saved as edited.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useShell } from "../../../../lib/store";
import { NotePage } from "../../../workspace/page/NotePage";
import { MemoryVault } from "../../../workspace/preview/memory-vault";
import { useWorkspace } from "../../../workspace/store";

const PATH = "library/trip.md";
let vault: MemoryVault;

beforeEach(async () => {
  localStorage.clear();
  vault = new MemoryVault({ [PATH]: "---\ntitle: Trip\n---\nPack the tent. Check the tent poles.\n\nThe Tent goes last.\n" });
  useWorkspace.setState({ place: { view: "home" }, back: [], forward: [], toasts: [] });
  await useWorkspace.getState().connect({ client: vault });
  useWorkspace.getState().openPath(PATH);
  useShell.setState({ panels: [] });
});
afterEach(cleanup);

async function open() {
  render(<NotePage client={vault} path={PATH} />);
  const editor = await screen.findByTestId("page-editor", {}, { timeout: 20_000 });
  await waitFor(() => expect(editor.querySelector(".ProseMirror")).not.toBeNull(), { timeout: 20_000 });
  const prose = editor.querySelector<HTMLElement>(".ProseMirror")!;
  prose.focus();
  return prose;
}

const press = (target: Element, init: KeyboardEventInit) => act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })));

describe("find in a page", () => {
  it("counts and steps through matches, and Escape closes with the marks gone", async () => {
    const prose = await open();
    await press(prose, { key: "f", code: "KeyF", ctrlKey: true });
    const bar = screen.getByRole("search", { name: "Find in page" });
    const field = within(bar).getByRole("textbox", { name: "Find in page" });
    expect(document.activeElement).toBe(field);
    await act(async () => fireEvent.change(field, { target: { value: "tent" } }));
    expect(bar.textContent).toContain("1 of 3");
    expect(prose.querySelectorAll(".kasten-find-match")).toHaveLength(3);
    await act(async () => fireEvent.keyDown(field, { key: "Enter" }));
    expect(bar.textContent).toContain("2 of 3");
    await act(async () => fireEvent.keyDown(field, { key: "Enter", shiftKey: true }));
    expect(bar.textContent).toContain("1 of 3");
    await act(async () => fireEvent.change(field, { target: { value: "tents" } }));
    expect(bar.textContent).toContain("No results");
    await act(async () => fireEvent.keyDown(field, { key: "Escape" }));
    expect(screen.queryByRole("search", { name: "Find in page" })).toBeNull();
    expect(prose.querySelectorAll(".kasten-find-match")).toHaveLength(0);
  });

  it("replaces every match with Mod+Alt+F, and the page saves it", async () => {
    const prose = await open();
    await press(prose, { key: "ƒ", code: "KeyF", ctrlKey: true, altKey: true });
    const bar = screen.getByRole("search", { name: "Find in page" });
    await act(async () => fireEvent.change(within(bar).getByRole("textbox", { name: "Find in page" }), { target: { value: "tent" } }));
    await act(async () => fireEvent.change(within(bar).getByRole("textbox", { name: "Replace with" }), { target: { value: "tarp" } }));
    await act(async () => fireEvent.click(within(bar).getByRole("button", { name: "Replace all" })));
    expect(bar.textContent).toContain("No results");
    await expect.poll(async () => (await vault.read(PATH)).text, { timeout: 5_000 }).toContain("\n---\nPack the tarp. Check the tarp poles.\n\nThe tarp goes last.\n");
  });

  it("leaves Mod+F alone when the keys belong to another page", async () => {
    await open();
    const other = document.createElement("input");
    document.body.append(other);
    other.focus();
    await press(other, { key: "f", code: "KeyF", ctrlKey: true });
    expect(screen.queryByRole("search", { name: "Find in page" })).toBeNull();
    other.remove();
  });
});
