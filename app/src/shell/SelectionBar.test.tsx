// Pages picked in the sidebar, from anywhere, go together: into a page, to
// a project or to the trash. Shift+click picks a run of rows, and Escape
// ends picking.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../features/workspace/preview/memory-vault";
import { useWorkspace } from "../features/workspace/store";
import { derive } from "../features/workspace/store-layout";
import { initialLayout } from "../features/workspace/tabs";
import { useShell } from "../lib/store";
import { AppShell } from "./AppShell";
import { useSidebarSelection } from "./selection";

const SEED = {
  "library/alpha.md": "---\nid: 01K5Y2WE1C0MEPAGE00000000A\ntitle: Alpha\n---\nA.\n",
  "library/beta.md": "---\nid: 01K5Y2WE1C0MEPAGE00000000B\ntitle: Beta\n---\nB.\n",
  "library/gamma.md": "---\nid: 01K5Y2WE1C0MEPAGE00000000C\ntitle: Gamma\n---\nC.\n",
  "projects/demo/_project.md": "---\ntitle: Demo project\ntype: project\n---\n",
  "projects/demo/pages/roadmap.md": "---\nid: 01K5Y2WE1C0MEPAGE00000000R\ntitle: Roadmap\n---\nR.\n",
};

let vault: MemoryVault;

async function sidebar() {
  render(<AppShell connect={async () => ({ client: vault })} />);
  const nav = await screen.findByRole("navigation", { name: "Sidebar" });
  await within(nav).findByRole("button", { name: "More for Alpha" });
  return nav;
}

async function select(nav: HTMLElement, title: string) {
  await act(async () => fireEvent.click(within(nav).getByRole("button", { name: `More for ${title}` })));
  await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Select" })));
}

/** Opens the project's rows, unless an earlier test left them open. */
async function openProject(nav: HTMLElement) {
  const expand = within(nav).queryByRole("button", { name: "Expand Demo project" });
  if (expand) await act(async () => fireEvent.click(expand));
}

const row = (nav: HTMLElement, title: string) => within(nav).getAllByRole("button", { name: new RegExp(`^${title}$`) }).find((b) => b.hasAttribute("data-row-title"))!;

beforeEach(() => {
  localStorage.clear();
  vault = new MemoryVault(SEED);
  useSidebarSelection.getState().clear();
  useWorkspace.setState({ client: null, ready: false, notes: [], ...derive(initialLayout()), recent: [], toasts: [] });
  useShell.setState({ sidebarOpen: true, focusMode: false, paletteOpen: false, panels: [] });
});
afterEach(cleanup);

describe("picking pages in the sidebar", () => {
  it("takes pages from a project and from Pages to the trash together", async () => {
    const nav = await sidebar();
    await select(nav, "Alpha");
    const bar = within(nav).getByRole("toolbar", { name: "Picked pages" });
    expect(bar.textContent).toContain("1 page");
    // A click on another row picks it rather than opening it.
    await openProject(nav);
    await act(async () => fireEvent.click(row(nav, "Roadmap")));
    expect(bar.textContent).toContain("2 pages");
    expect(useWorkspace.getState().place.view).toBe("home");

    await act(async () => fireEvent.click(within(bar).getByRole("button", { name: "Move to Trash" })));
    await waitFor(async () => {
      const left = (await vault.list()).map((n) => n.path);
      expect(left).not.toContain("library/alpha.md");
      expect(left).not.toContain("projects/demo/pages/roadmap.md");
    });
    expect(within(nav).queryByRole("toolbar", { name: "Picked pages" })).toBeNull();
  });

  it("puts picked pages inside another page", async () => {
    const nav = await sidebar();
    await select(nav, "Alpha");
    await openProject(nav);
    await act(async () => fireEvent.click(row(nav, "Roadmap")));
    const bar = within(nav).getByRole("toolbar", { name: "Picked pages" });
    await act(async () => fireEvent.click(within(bar).getByRole("button", { name: "Put inside a page" })));
    const picker = within(bar).getByRole("dialog", { name: "Put inside" });
    await act(async () => fireEvent.click(within(picker).getByText("Gamma")));
    await waitFor(async () => {
      const inside = (await vault.list()).filter((n) => n.parent === "01K5Y2WE1C0MEPAGE00000000C").map((n) => n.title);
      expect(inside.sort()).toEqual(["Alpha", "Roadmap"]);
    });
  });

  it("picks a run of rows with Shift+click, and Escape ends picking", async () => {
    const nav = await sidebar();
    await select(nav, "Alpha");
    await act(async () => fireEvent.click(row(nav, "Gamma"), { shiftKey: true }));
    expect(useSidebarSelection.getState().picked.sort()).toEqual(["library/alpha.md", "library/beta.md", "library/gamma.md"]);
    expect(row(nav, "Beta").getAttribute("aria-pressed")).toBe("true");
    await act(async () => fireEvent.keyDown(document, { key: "Escape" }));
    expect(useSidebarSelection.getState().picked).toEqual([]);
    // Clicks open pages again.
    await act(async () => fireEvent.click(row(nav, "Beta")));
    await waitFor(() => expect(useWorkspace.getState().place.path).toBe("library/beta.md"));
  });
});
