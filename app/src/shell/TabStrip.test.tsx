import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { derive } from "../features/workspace/store-layout";
import { useWorkspace } from "../features/workspace/store";
import { initialLayout } from "../features/workspace/tabs";
import { TabStrip } from "./TabStrip";

const pane = () => useWorkspace.getState().layout.panes[0]!;
const strip = () => <TabStrip pane={pane()} />;

beforeEach(() => {
  useWorkspace.setState({ ...derive(initialLayout()), notes: [], recent: [], stack: [], stackOpen: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the tab strip", () => {
  it("keeps the new-tab button out of the tabs that scroll", () => {
    render(strip());
    const tabs = screen.getByRole("tablist", { name: "Tabs" });
    expect(within(tabs).queryByRole("button", { name: "New tab" })).toBeNull();
    expect(screen.getByRole("button", { name: "New tab" })).toBeTruthy();
  });

  it("brings the tab shown into view, and fades an edge with more beyond it", () => {
    const shown = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    const view = render(strip());
    for (const view of ["inbox", "tasks", "calendar"] as const) act(() => useWorkspace.getState().openTab({ view }));
    const list = screen.getByRole("tablist", { name: "Tabs" });
    // Wider than it shows, scrolled to its start.
    Object.defineProperties(list, { scrollWidth: { value: 900, configurable: true }, clientWidth: { value: 300, configurable: true } });
    view.rerender(strip());
    expect(shown).toHaveBeenCalled();
    expect(shown.mock.contexts.at(-1)).toBe(screen.getByRole("tab", { name: /Calendar/ }));
    act(() => list.dispatchEvent(new Event("scroll")));
    expect(list.className).toContain("is-clipped-end");
    expect(list.className).not.toContain("is-clipped-start");
    Object.defineProperty(list, "scrollLeft", { value: 600, configurable: true });
    act(() => list.dispatchEvent(new Event("scroll")));
    expect(list.className).toContain("is-clipped-start");
    expect(list.className).not.toContain("is-clipped-end");
  });
});
