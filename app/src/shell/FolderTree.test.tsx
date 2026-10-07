import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../features/workspace/preview/memory-vault";
import { derive } from "../features/workspace/store-layout";
import { useWorkspace } from "../features/workspace/store";
import { initialLayout } from "../features/workspace/tabs";
import { useShell } from "../lib/store";
import { AppShell } from "./AppShell";

// An Obsidian vault opened as it is: notes at the top and in folders.
const OBSIDIAN = {
  ".obsidian/app.json": "{}",
  "Welcome.md": "Start here.\n",
  "Areas/Work.md": "Plans.\n",
  "Areas/Health/Sleep.md": "Eight hours.\n",
  "Daily/2026-09-25.md": "A day.\n",
};

beforeEach(() => {
  localStorage.clear();
  useWorkspace.setState({ client: null, ready: false, notes: [], ...derive(initialLayout()), stack: [], stackOpen: false, recent: [], toasts: [] });
  useShell.setState({ sidebarOpen: true, focusMode: false, paletteOpen: false, shortcutsOpen: false, panels: [], sourceOpen: false });
});
afterEach(cleanup);

describe("Folders in the sidebar", () => {
  it("shows another app's folders as folders, and opens a note from one", async () => {
    const vault = new MemoryVault(OBSIDIAN);
    render(<AppShell connect={async () => ({ client: vault })} />);
    const sidebar = await screen.findByRole("navigation", { name: "Sidebar" });
    const folders = await within(sidebar).findByRole("region", { name: "Folders" });
    // Pages keeps the notes at the top of the vault; folders keep theirs.
    const pages = within(sidebar).getByRole("region", { name: "Pages" });
    expect(within(pages).getByRole("button", { name: "Welcome" })).toBeTruthy();
    expect(within(pages).queryByRole("button", { name: "Sleep" })).toBeNull();

    const areas = within(folders).getByRole("button", { name: /^Areas/ });
    expect(areas.getAttribute("aria-expanded")).toBe("false");
    expect(areas.textContent).toContain("2");
    fireEvent.click(areas);
    fireEvent.click(within(folders).getByRole("button", { name: /^Health/ }));
    fireEvent.click(within(folders).getByRole("button", { name: "Sleep" }));
    expect(useWorkspace.getState().place).toEqual({ view: "page", path: "Areas/Health/Sleep.md" });
    expect(within(folders).getByRole("button", { name: /^Daily/ })).toBeTruthy();
  });

  it("stays away when every note is in Kasten's own folders", async () => {
    const vault = new MemoryVault({ "library/plan.md": "---\ntitle: Plan\n---\nA plan.\n" });
    render(<AppShell connect={async () => ({ client: vault })} />);
    const sidebar = await screen.findByRole("navigation", { name: "Sidebar" });
    await within(sidebar).findByRole("button", { name: "Plan" });
    expect(within(sidebar).queryByRole("region", { name: "Folders" })).toBeNull();
  });
});
