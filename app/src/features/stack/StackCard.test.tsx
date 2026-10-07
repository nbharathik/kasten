import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { loadNotePage } from "../workspace/page/LazyNotePage";

import { usePeek } from "../peek/store";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { derive } from "../workspace/store-layout";
import { useWorkspace } from "../workspace/store";
import { focusedPane, initialLayout } from "../workspace/tabs";
import { AppShell } from "../../shell/AppShell";

beforeAll(async () => { await loadNotePage(); }, 60_000);

const SEED = {
  "library/plan.md": "---\ntitle: Plan\n---\nThe plan, with [[Other]] in it.\n",
  "library/notes.md": "---\ntitle: Notes\n---\nSome notes.\n",
  "library/other.md": "---\ntitle: Other\n---\nAnother page.\n",
};

beforeEach(() => {
  localStorage.clear();
  useWorkspace.setState({ ...derive(initialLayout()), notes: [], recent: [], stack: [], stackOpen: false });
  usePeek.setState({ peek: null });
});
afterEach(cleanup);

describe("a quick-glance card", () => {
  it("opens a link followed inside it in a new tab, keeping the page that was open", async () => {
    render(<AppShell connect={async () => ({ client: new MemoryVault(SEED) })} />);
    await screen.findByRole("navigation", { name: "Sidebar" });
    await act(async () => useWorkspace.getState().openPath("library/notes.md"));
    await act(async () => useWorkspace.getState().openInStack("library/plan.md"));
    const card = await screen.findByRole("article", { name: "Plan" });
    const link = await vi.waitFor(() => card.querySelector<HTMLElement>(".kasten-mention") ?? Promise.reject(new Error("no link yet")), { timeout: 10_000 });
    await act(async () => link.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    const { layout, place } = useWorkspace.getState();
    expect(place.path).toBe("library/other.md");
    expect(focusedPane(layout).tabs.map((tab) => tab.place.path)).toEqual(["library/notes.md", "library/other.md"]);
  });
});
