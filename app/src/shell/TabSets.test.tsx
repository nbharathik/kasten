import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { usePrefs } from "../features/workspace/prefs";
import { useWorkspace } from "../features/workspace/store";
import { derive } from "../features/workspace/store-layout";
import { focusedPane, initialLayout } from "../features/workspace/tabs";
import { TabSets } from "./TabSets";

const page = (path: string) => ({ view: "page" as const, path });
const pane = () => focusedPane(useWorkspace.getState().layout);
const openPaths = () => pane().tabs.map((t) => t.place.path ?? t.place.view);

beforeEach(() => {
  localStorage.clear();
  usePrefs.setState({ tabSets: [] });
  useWorkspace.setState({ ...derive(initialLayout()), recent: [] });
});
afterEach(cleanup);

describe("tab sets", () => {
  it("saves the tabs open here and opens them all again, pinned ones pinned", async () => {
    act(() => useWorkspace.getState().openTabs([page("library/a.md"), page("library/b.md")], [page("library/b.md")]));
    const { rerender } = render(<TabSets pane={pane()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tab sets" }));
    const menu = screen.getByRole("dialog", { name: "Tab sets" });
    const name = within(menu).getByRole("textbox", { name: "Name for the tabs open here" });
    expect(name.getAttribute("placeholder")).toBe("Name these 2 tabs…");
    fireEvent.change(name, { target: { value: "Reading" } });
    fireEvent.submit(name.closest("form")!);
    expect(usePrefs.getState().tabSets).toEqual([
      {
        name: "Reading",
        tabs: [
          { place: page("library/b.md"), pinned: true },
          { place: page("library/a.md"), pinned: false },
        ],
      },
    ]);
    expect(JSON.parse(localStorage.getItem("kasten.prefs")!).tabSets[0].name).toBe("Reading");

    // Close them all, then bring the set back.
    act(() => useWorkspace.setState({ ...derive(initialLayout()) }));
    rerender(<TabSets pane={pane()} />);
    await act(async () => fireEvent.click(within(screen.getByRole("dialog", { name: "Tab sets" })).getByRole("button", { name: /^Reading/ })));
    expect(openPaths()).toEqual(["library/b.md", "home", "library/a.md"]);
    expect(pane().tabs[0]!.pinned).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Tab sets" })).toBeNull();
  });
});
