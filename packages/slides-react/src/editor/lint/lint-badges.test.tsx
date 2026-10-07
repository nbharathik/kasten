// The badges that flag problems on the filmstrip's slides are off until the person turns them on (View, Lint badges);
// the choice is kept in this browser. Lint itself, and the Lint dialog, are not touched by it.

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newDeck } from "../../test/engine.ts";
import { Filmstrip } from "../filmstrip/Filmstrip.tsx";
import { MemoryHost } from "../memory-host.ts";
import { MenuBar } from "../menus/MenuBar.tsx";
import { bar, click, openEditor, row } from "../menus/testing.ts";
import { EditorSession } from "../session/session.ts";
import { LINT_BADGES_KEY } from "../ui-prefs.ts";
import { EditorUi } from "../ui-state.ts";
import { lintOf } from "./service.ts";
import { offEdge } from "./test-kit.ts";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the setting", () => {
  it("is off to begin with, switches, and is kept for the next window in this browser", () => {
    expect(new EditorUi().state.lintBadges).toBe(false);
    const ui = new EditorUi();
    ui.setLintBadges(true);
    expect(ui.state.lintBadges).toBe(true);
    expect(localStorage.getItem(LINT_BADGES_KEY)).toBe("1");
    expect(new EditorUi().state.lintBadges).toBe(true);
    ui.toggleLintBadges();
    expect(ui.state.lintBadges).toBe(false);
    expect(localStorage.getItem(LINT_BADGES_KEY)).toBe("0");
    expect(new EditorUi().state.lintBadges).toBe(false);
  });

  it("does not tell its watchers when it is set to what it is", () => {
    const ui = new EditorUi();
    const seen = vi.fn();
    ui.subscribe(seen);
    ui.setLintBadges(false);
    expect(seen).not.toHaveBeenCalled();
  });

  it("copes with browser storage that is missing, full or refused", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    const ui = new EditorUi();
    expect(ui.state.lintBadges).toBe(false);
    expect(() => ui.setLintBadges(true)).not.toThrow();
    expect(ui.state.lintBadges).toBe(true);
  });

  it("ignores a stored value it does not know", () => {
    localStorage.setItem(LINT_BADGES_KEY, "maybe");
    expect(new EditorUi().state.lintBadges).toBe(false);
  });
});

describe("View, Lint badges", () => {
  it("is a checkable item that is unchecked at first, and switches the badges", async () => {
    const { session, ui } = await openEditor();
    render(<MenuBar session={session} ui={ui} />);
    click(bar("View"));
    expect(row(/^Lint badges/).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(row(/^Lint badges/));
    expect(ui.state.lintBadges).toBe(true);
    expect(localStorage.getItem(LINT_BADGES_KEY)).toBe("1");
    click(bar("View"));
    expect(row(/^Lint badges/).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(row(/^Lint badges/));
    expect(ui.state.lintBadges).toBe(false);
  });

  it("leaves the Lint command in the Tools menu as it was", async () => {
    const { session, ui } = await openEditor();
    render(<MenuBar session={session} ui={ui} />);
    click(bar("Tools"));
    fireEvent.click(row(/^Lint$/));
    expect(ui.state.dialog).toBe("lint");
    expect(ui.state.lintBadges).toBe(false);
  });
});

describe("the badges on the filmstrip", () => {
  /** A finished cover and two blank slides; the second has a box hanging off the edge, which lint calls an error. */
  async function troubled() {
    const engine = await newDeck("Lint");
    const cover = engine.deck.slides[0]!;
    engine.apply("set_text", { slide: cover.id, id: cover.elements.find((e) => e.placeholder === "subtitle")!.id, markdown: "A subtitle" });
    for (let i = 0; i < 2; i++) engine.apply("add_slide", { layout: "blank" });
    const session = new EditorSession(engine, new MemoryHost(), { saveDelay: 60_000 });
    const bad = session.deck.slides[1]!.id;
    session.core.apply("add_elements", { slide: bad, elements: [offEdge("wide")] });
    return { session, ui: new EditorUi(), bad };
  }

  const badges = () => document.querySelectorAll(".ks-lint-badge");

  it("are not drawn, and lint does no work in the background, until they are turned on", async () => {
    const { session, ui } = await troubled();
    render(<Filmstrip session={session} ui={ui} />);
    const lint = lintOf(session);
    expect(lint.background).toBe(false);
    // The quiet period and the idle time would both have passed by now.
    await act(async () => void (await new Promise<void>((resolve) => setTimeout(resolve, 700))));
    expect(badges()).toHaveLength(0);
    expect(lint.stats.slidesChecked).toBe(0);
    lint.dispose();
  });

  it("appear when they are turned on, on the slide that has the problem, and go when they are turned off", async () => {
    const { session, ui, bad } = await troubled();
    render(<Filmstrip session={session} ui={ui} />);
    const lint = lintOf(session);
    act(() => ui.setLintBadges(true));
    expect(lint.background).toBe(true);
    await waitFor(() => expect(badges()).toHaveLength(1), { timeout: 5000 });
    expect(badges()[0]!.closest("[data-slide]")?.getAttribute("data-slide")).toBe(bad);
    expect(badges()[0]!.className).toContain("is-error");

    act(() => ui.setLintBadges(false));
    expect(badges()).toHaveLength(0);
    expect(lint.background).toBe(false);
    lint.dispose();
  });

  it("start on when the person turned them on in this browser before", async () => {
    localStorage.setItem(LINT_BADGES_KEY, "1");
    const { session, ui } = await troubled();
    render(<Filmstrip session={session} ui={ui} />);
    const lint = lintOf(session);
    expect(lint.background).toBe(true);
    await waitFor(() => expect(badges()).toHaveLength(1), { timeout: 5000 });
    lint.dispose();
  });

  it("stop the background work when the filmstrip goes away", async () => {
    const { session, ui } = await troubled();
    ui.setLintBadges(true);
    const view = render(<Filmstrip session={session} ui={ui} />);
    const lint = lintOf(session);
    expect(lint.background).toBe(true);
    view.unmount();
    expect(lint.background).toBe(false);
    lint.dispose();
  });

  it("do not stop the Lint dialog from listing the problems it is asked for", async () => {
    const { session, ui } = await troubled();
    render(<Filmstrip session={session} ui={ui} />);
    const lint = lintOf(session);
    await lint.checkAll();
    expect(lint.getSnapshot().issues.size).toBe(1);
    expect(badges()).toHaveLength(0);
    expect(screen.queryByRole("img", { name: /problem/ })).toBeNull();
    lint.dispose();
  });
});
