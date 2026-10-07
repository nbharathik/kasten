import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useShell } from "../../lib/store";
import { AppShell } from "../../shell/AppShell";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { derive } from "../workspace/store-layout";
import { initialLayout } from "../workspace/tabs";

const SEED = {
  "library/a.md": "---\ntitle: Spark\ntags: [idea]\n---\nA bright idea.\n",
  "library/b.md": "---\ntitle: Plain\n---\nNothing tagged.\n",
};

beforeEach(() => {
  localStorage.clear();
  useWorkspace.setState({ client: null, ready: false, notes: [], ...derive(initialLayout()), stack: [], stackOpen: false, recent: ["library/b.md"], toasts: [] });
  useShell.setState({ sidebarOpen: true, paletteOpen: false, gallery: null });
});
afterEach(cleanup);

describe("searching everything", () => {
  it("finds a tag in the palette and opens its database", async () => {
    render(<AppShell connect={async () => ({ client: new MemoryVault(SEED) })} />);
    await screen.findByRole("navigation", { name: "Sidebar" });
    act(() => useShell.getState().setPalette(true));
    const dialog = await screen.findByRole("dialog", { name: "Search and commands" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Search" }), { target: { value: "#ide" } });
    const options = within(dialog).getAllByRole("option");
    expect(options[0]!.textContent).toContain("#idea");
    await act(async () => fireEvent.keyDown(within(dialog).getByRole("textbox", { name: "Search" }), { key: "Enter" }));
    // The database's code loads when first opened; give it time on a busy machine.
    const notes = await screen.findByRole("grid", { name: "Notes tagged #idea" }, { timeout: 10_000 });
    expect(within(notes).getByText("Spark")).toBeTruthy();
    expect(within(notes).queryByText("Plain")).toBeNull();
  });

  it("finds a tag's cards in the Card Library with tag:", async () => {
    render(<AppShell connect={async () => ({ client: new MemoryVault(SEED) })} />);
    await screen.findByRole("navigation", { name: "Sidebar" });
    await act(async () => fireEvent.keyDown(window, { key: "F", ctrlKey: true, shiftKey: true }));
    const box = await screen.findByRole("searchbox");
    fireEvent.change(box, { target: { value: "tag:idea" } });
    const cards = await screen.findByRole("listbox", { name: "Cards" });
    await expect.poll(() => within(cards).queryByText("Plain")).toBeNull();
    expect(within(cards).getByText("Spark")).toBeTruthy();
  });

  it("Ctrl+Shift+F opens the Card Library with its search box ready", async () => {
    render(<AppShell connect={async () => ({ client: new MemoryVault(SEED) })} />);
    await screen.findByRole("navigation", { name: "Sidebar" });
    await act(async () => fireEvent.keyDown(window, { key: "F", ctrlKey: true, shiftKey: true }));
    const box = await screen.findByRole("searchbox");
    await expect.poll(() => document.activeElement).toBe(box);
  });
});
