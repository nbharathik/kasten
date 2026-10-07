// The right panel in split view: each pane's panel keeps its own
// tab and width, and never takes more than its share of a narrow page.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useShell } from "../../lib/store";
import { AppShell } from "../../shell/AppShell";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { derive } from "../workspace/store-layout";
import { useWorkspace } from "../workspace/store";
import { initialLayout } from "../workspace/tabs";
import { PANEL_SHARE, PANEL_WIDTH, usePanel } from "./panel-store";

const SEED = {
  "library/plan.md": "---\ntitle: Plan\n---\n## Goals\n",
  "library/notes.md": "---\ntitle: Notes\n---\nSome notes.\n",
};

beforeEach(() => {
  localStorage.clear();
  useWorkspace.setState({ client: null, ready: false, notes: [], ...derive(initialLayout()), stack: [], stackOpen: false, recent: [], toasts: [] });
  useShell.setState({ panels: [] });
  usePanel.setState({ tab: "details", width: PANEL_WIDTH.initial, tabs: {}, widths: {} });
});
afterEach(cleanup);

async function twoPanels() {
  render(<AppShell connect={async () => ({ client: new MemoryVault(SEED) })} />);
  await screen.findByRole("navigation", { name: "Sidebar" });
  act(() => useWorkspace.getState().openPath("library/plan.md"));
  act(() => useWorkspace.getState().splitRight({ view: "page", path: "library/notes.md" }));
  const panes = await screen.findAllByRole("region", { name: "Pane" });
  const panels = [];
  for (const pane of panes) {
    fireEvent.click(await within(pane).findByRole("button", { name: "Outline and details" }, { timeout: 20_000 }));
    panels.push(await within(pane).findByRole("complementary", { name: "Page details" }, { timeout: 20_000 }));
  }
  return panels as [HTMLElement, HTMLElement];
}

const selected = (panel: HTMLElement) => within(panel).getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")?.textContent;

describe("the right panel in split view", () => {
  it("keeps each pane's tab and width its own", async () => {
    const [left, right] = await twoPanels();
    fireEvent.click(within(right).getByRole("tab", { name: "History" }));
    expect(selected(right)).toBe("History");
    expect(selected(left)).toBe("Details");

    const handle = within(right).getByRole("separator", { name: "Resize the panel" });
    fireEvent.pointerDown(handle, { button: 0, clientX: 1000 });
    fireEvent.pointerMove(window, { clientX: 920 });
    fireEvent.pointerUp(window, { clientX: 920 });
    expect(right.style.width).toBe(`${PANEL_WIDTH.initial + 80}px`);
    expect(left.style.width).toBe(`${PANEL_WIDTH.initial}px`);
    // A panel opened now starts from the last ones chosen.
    expect(usePanel.getState()).toMatchObject({ tab: "history", width: PANEL_WIDTH.initial + 80 });
  }, 60_000);

  it("takes at most its share of a narrow page, keeping the width asked for", async () => {
    const [left] = await twoPanels();
    expect(left.style.maxWidth).toBe(`${PANEL_SHARE * 100}%`);
    // The page is 600 px wide here: the panel shows 270 px of the 400 asked for.
    Object.defineProperty(left.parentElement!, "clientWidth", { configurable: true, value: 600 });
    const handle = within(left).getByRole("separator", { name: "Resize the panel" });
    act(() => usePanel.getState().setWidth(useShell.getState().panels[0]!, 400, true));
    // Wider than what shows keeps the 400; narrower starts from the 270 shown.
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(left.style.width).toBe("400px");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(left.style.width).toBe(`${600 * PANEL_SHARE - 16}px`);
  }, 60_000);
});
