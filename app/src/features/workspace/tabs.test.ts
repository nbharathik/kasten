import { describe, expect, it } from "vitest";

import {
  HOME,
  activeTab,
  closeTab,
  currentTab,
  cycleTab,
  focusedPane,
  forgetPath,
  goBack,
  goForward,
  initialLayout,
  moveTab,
  navigate,
  opensOwnTab,
  openTab,
  openTabs,
  closeRight,
  renamePath,
  reopenTab,
  resizePanes,
  selectTab,
  split,
  togglePin,
  type Layout,
  type Place,
} from "./tabs";

const page = (path: string): Place => ({ view: "page", path });
const places = (layout: Layout) => focusedPane(layout).tabs.map((t) => t.place.path ?? t.place.view);

describe("tabs", () => {
  it("navigates within a tab, with back and forward per tab", () => {
    let l = navigate(initialLayout(), page("a.md"));
    l = navigate(l, page("b.md"));
    expect(currentTab(l).back).toEqual([HOME, page("a.md")]);
    l = goBack(l);
    expect(currentTab(l).place).toEqual(page("a.md"));
    l = goForward(l);
    expect(currentTab(l).place).toEqual(page("b.md"));
    expect(navigate(l, page("b.md"))).toBe(l);
  });

  it("opens, selects, cycles, pins and moves tabs", () => {
    let l = navigate(initialLayout(), page("a.md"));
    l = openTab(l, page("b.md"));
    l = openTab(l, page("c.md"));
    expect(places(l)).toEqual(["a.md", "b.md", "c.md"]);
    // Opening what a tab already shows selects it.
    l = openTab(l, page("a.md"));
    expect(currentTab(l).place.path).toBe("a.md");
    expect(places(l)).toHaveLength(3);
    l = cycleTab(l, -1);
    expect(currentTab(l).place.path).toBe("c.md");
    const c = currentTab(l);
    l = togglePin(l, l.focus, c.id);
    expect(places(l)[0]).toBe("c.md");
    l = moveTab(l, l.focus, focusedPane(l).tabs[2]!.id, 0);
    expect(places(l)).toEqual(["b.md", "c.md", "a.md"]);
  });

  it("closes tabs, keeps pinned ones, and reopens the last closed", () => {
    let l = navigate(initialLayout(), page("a.md"));
    l = openTab(l, page("b.md"));
    const b = currentTab(l);
    l = closeTab(l, l.focus, b.id);
    expect(places(l)).toEqual(["a.md"]);
    l = reopenTab(l);
    expect(currentTab(l).place.path).toBe("b.md");
    l = togglePin(l, l.focus, currentTab(l).id);
    expect(closeTab(l, l.focus, currentTab(l).id)).toBe(l);
    // The only tab of the only pane goes home instead of closing.
    let single = navigate(initialLayout(), page("x.md"));
    single = closeTab(single, single.focus, currentTab(single).id);
    expect(currentTab(single).place).toEqual(HOME);
  });

  it("splits into at most three panes and closes empty ones", () => {
    let l = navigate(initialLayout(), page("a.md"));
    l = split(l, page("b.md"));
    l = split(l, page("c.md"));
    expect(l.panes).toHaveLength(3);
    expect(currentTab(l).place.path).toBe("c.md");
    // A fourth split opens a tab in the pane to the right (here the last).
    l = split(l, page("d.md"));
    expect(l.panes).toHaveLength(3);
    expect(places(l)).toEqual(["c.md", "d.md"]);
    const [first] = l.panes;
    l = selectTab(l, first!.id, activeTab(first!).id);
    expect(l.focus).toBe(first!.id);
    l = closeTab(l, first!.id, activeTab(first!).id);
    expect(l.panes).toHaveLength(2);
  });

  it("shares the width: a split halves its pane, a closed pane gives its width to its neighbour", () => {
    let l = navigate(initialLayout(), page("a.md"));
    l = split(l, page("b.md"));
    expect(l.panes.map((p) => p.size ?? 1)).toEqual([0.5, 0.5]);
    const [a, b] = l.panes;
    l = resizePanes(l, { [a!.id]: 0.7, [b!.id]: 0.3 });
    expect(l.panes.map((p) => p.size)).toEqual([0.7, 0.3]);
    // Nonsense stays out.
    expect(resizePanes(l, { [a!.id]: -1, [b!.id]: Number.NaN }).panes.map((p) => p.size)).toEqual([0.7, 0.3]);
    // The right one splits: its 0.3 becomes 0.15 and 0.15.
    l = split(l, page("c.md"));
    expect(l.panes.map((p) => p.size)).toEqual([0.7, 0.15, 0.15]);
    // Closing the middle one hands its width to the one on its left.
    l = closeTab(l, l.panes[1]!.id, activeTab(l.panes[1]!).id);
    expect(l.panes.map((p) => p.size)).toEqual([0.85, 0.15]);
  });

  it("knows which clicks get their own tab when pages open in new tabs", () => {
    const home = { view: "home" } as const;
    // A page, a board, a PDF or a tag database, from anywhere else.
    expect(opensOwnTab(home, page("a.md"))).toBe(true);
    expect(opensOwnTab(page("a.md"), page("b.md"))).toBe(true);
    expect(opensOwnTab({ view: "boards" }, { view: "boards", path: "b.canvas" })).toBe(true);
    // A view keeps the page it would have taken the place of.
    expect(opensOwnTab(page("a.md"), { view: "inbox" })).toBe(true);
    // Not the place already shown, a view after another view, the
    // journal's days, or a board inside the board open.
    expect(opensOwnTab(page("a.md"), page("a.md"))).toBe(false);
    expect(opensOwnTab(home, { view: "inbox" })).toBe(false);
    expect(opensOwnTab({ view: "journal" }, { view: "journal", path: "journal/2026/2026-09-24.md" })).toBe(false);
    expect(opensOwnTab({ view: "boards", path: "a.canvas" }, { view: "boards", path: "b.canvas" })).toBe(false);
  });

  it("follows renamed notes and forgets trashed ones", () => {
    let l = navigate(initialLayout(), page("a.md"));
    l = navigate(l, page("b.md"));
    l = split(l, page("a.md"));
    l = renamePath(l, "a.md", "z.md");
    expect(currentTab(l).place.path).toBe("z.md");
    expect(l.panes[0]!.tabs[0]!.back).toEqual([HOME, page("z.md")]);
    l = forgetPath(l, "z.md");
    expect(currentTab(l).place).toEqual(HOME);
    expect(l.panes[0]!.tabs[0]!.place.path).toBe("b.md");
  });

  it("opens many tabs at once, each once, pinned ones first", () => {
    let l = openTab(initialLayout(), page("a.md"));
    l = openTabs(l, [page("b.md"), page("a.md"), page("c.md"), page("b.md")], [page("c.md")]);
    expect(places(l)).toEqual(["c.md", "home", "a.md", "b.md"]);
    expect(focusedPane(l).tabs[0]!.pinned).toBe(true);
    expect(activeTab(focusedPane(l)).place).toEqual(page("b.md"));
    // Only places already open: the first of them is shown.
    expect(activeTab(focusedPane(openTabs(l, [page("a.md")]))).place).toEqual(page("a.md"));
    expect(openTabs(l, [])).toBe(l);
  });

  it("closes the unpinned tabs to the right", () => {
    let l = openTabs(initialLayout(), [page("a.md"), page("b.md"), page("c.md")], [page("c.md")]);
    const pane = focusedPane(l);
    const home = pane.tabs.find((t) => t.place.view === "home")!;
    l = closeRight(l, pane.id, home.id);
    expect(places(l)).toEqual(["c.md", "home"]);
    expect(l.closed.map((p) => p.path)).toEqual(["a.md", "b.md"]);
  });
});
