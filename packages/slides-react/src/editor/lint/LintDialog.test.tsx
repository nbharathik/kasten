import type { DeckEngine, Element } from "@kasten-slides/wasm";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type Kit, mountDialogs } from "../dialogs/test-kit.tsx";
import { groupIssues } from "./LintDialog.tsx";
import * as measure from "./measure.ts";
import { lintOf } from "./service.ts";

let kit: Kit | null = null;
afterEach(() => {
  cleanup();
  if (kit) lintOf(kit.session).dispose();
  void kit?.session.dispose();
  kit = null;
});

const words = (t: string) => ({ paragraphs: [{ runs: [{ t }] }] });

/** A cover that is finished, a slide with a box off the edge, and a slide with a box near the edge and a picture with no description. */
function troubled(engine: DeckEngine): void {
  const cover = engine.deck.slides[0]!;
  engine.apply("set_text", { slide: cover.id, id: cover.elements.find((e) => e.placeholder === "subtitle")!.id, markdown: "A subtitle" });
  const second = engine.apply("add_slide", { layout: "blank" }).output.slide;
  engine.apply("add_elements", { slide: second, elements: [{ type: "text", id: "wide", x: 800, y: 100, w: 400, h: 60, text: words("Off the edge") } as Element] });
  const third = engine.apply("add_slide", { layout: "blank" }).output.slide;
  engine.apply("add_elements", {
    slide: third,
    elements: [
      { type: "text", id: "tight", x: 4, y: 100, w: 300, h: 60, text: words("Close to the edge") } as Element,
      { type: "image", id: "pic", src: "assets/x.png", x: 100, y: 300, w: 100, h: 100 } as Element,
    ],
  });
}

async function open(prepare?: (engine: DeckEngine) => void): Promise<Kit> {
  kit = await mountDialogs({ dialog: "lint", blank: false, ...(prepare ? { prepare } : {}) });
  return kit;
}

const dialog = () => screen.getByRole("dialog", { name: "Lint" });

describe("the Lint dialog", () => {
  it("says so when there is nothing wrong", async () => {
    await open((engine) => {
      const cover = engine.deck.slides[0]!;
      engine.apply("set_text", { slide: cover.id, id: cover.elements.find((e) => e.placeholder === "subtitle")!.id, markdown: "A subtitle" });
    });
    expect(screen.getByText("Checking the slides…")).toBeTruthy();
    expect(await screen.findByText("No problems found.")).toBeTruthy();
    for (const name of [/^Errors\s*\d/, /^Warnings\s*\d/, /^Info\s*\d/]) expect(within(dialog()).getByRole("button", { name }).textContent).toContain("0");
  });

  it("lists the problems by slide, in the order of the deck, each with its fix", async () => {
    await open(troubled);
    await screen.findByText(/sticks out past the right edge/);
    const sections = within(dialog()).getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["Slide 2", "Slide 3"]);
    expect(within(sections[0]!).getByText("Slide 2")).toBeTruthy();
    expect(within(sections[0]!).getByText("Off the edge")).toBeTruthy();
    expect(within(sections[0]!).getByText("1 problem")).toBeTruthy();
    expect(within(sections[0]!).getByText("off-slide")).toBeTruthy();
    expect(within(sections[0]!).getByText(/Move it or make it smaller/)).toBeTruthy();
    expect(within(sections[1]!).getByText("2 problems")).toBeTruthy();
    expect(within(sections[1]!).getByText("margin")).toBeTruthy();
    expect(within(sections[1]!).getByText("missing-alt")).toBeTruthy();
    expect(within(dialog()).getByRole("button", { name: /^Errors\s*\d/ }).textContent).toContain("1");
    expect(within(dialog()).getByRole("button", { name: /^Warnings\s*\d/ }).textContent).toContain("1");
    expect(within(dialog()).getByRole("button", { name: /^Info\s*\d/ }).textContent).toContain("1");
    expect(within(dialog()).getByText(/^Not checked: unresolved-citation/)).toBeTruthy();
    // Nothing warns on its own: the note about estimated text sizes is only there when they are.
    expect(within(dialog()).queryByText(/Text sizes are estimated/)).toBeNull();
  });

  it("goes to the slide and selects the element when a problem is pressed, and closes", async () => {
    const k = await open(troubled);
    await screen.findByText(/sticks out past the right edge/);
    fireEvent.click(within(dialog()).getByRole("button", { name: /^Show on slide 2: .*sticks out past the right edge/ }));
    expect(k.session.state.slideId).toBe(k.session.deck.slides[1]!.id);
    expect(k.session.state.selection).toEqual(["wide"]);
    expect(k.ui.state.dialog).toBeNull();
  });

  it("keeps the words of a problem as text to select and copy: not inside a button, and the Show button is beside them", async () => {
    await open(troubled);
    const message = await screen.findByText(/sticks out past the right edge/);
    expect(message.closest("button")).toBeNull();
    expect(within(dialog()).getByText(/Move it or make it smaller/).closest("button")).toBeNull();
    expect(within(dialog()).getByText("off-slide").closest("button")).toBeNull();
    // Pressing the words does nothing but select them; the dialog stays.
    fireEvent.click(message);
    expect(dialog()).toBeTruthy();
  });

  it("goes to the slide when its name is pressed", async () => {
    const k = await open(troubled);
    await screen.findByText(/sticks out past the right edge/);
    fireEvent.click(within(within(dialog()).getByRole("region", { name: "Slide 3" })).getByText("Slide 3").closest("button")!);
    expect(k.session.state.slideId).toBe(k.session.deck.slides[2]!.id);
    expect(k.session.state.selection).toEqual([]);
  });

  it("shows only the severities that are switched on", async () => {
    await open(troubled);
    await screen.findByText(/sticks out past the right edge/);
    const errors = within(dialog()).getByRole("button", { name: /^Errors\s*\d/ });
    expect(errors.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(errors);
    expect(errors.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText(/sticks out past the right edge/)).toBeNull();
    expect(within(dialog()).getAllByRole("region").map((s) => s.getAttribute("aria-label"))).toEqual(["Slide 3"]);
    fireEvent.click(within(dialog()).getByRole("button", { name: /^Warnings\s*\d/ }));
    fireEvent.click(within(dialog()).getByRole("button", { name: /^Info\s*\d/ }));
    expect(screen.getByText("Nothing to show with these filters.")).toBeTruthy();
    fireEvent.click(errors);
    expect(screen.getByText(/sticks out past the right edge/)).toBeTruthy();
  });

  it("looks again at every slide when asked, and shows what it finds", async () => {
    const k = await open(troubled);
    await screen.findByText(/sticks out past the right edge/);
    // The first look at every slide is still going on while the first problems appear.
    const recheck = await within(dialog()).findByRole("button", { name: "Re-check" });
    const before = lintOf(k.session).stats.slidesChecked;
    act(() => {
      k.session.core.apply("add_elements", { slide: k.session.deck.slides[0]!.id, elements: [{ type: "text", id: "extra", x: 900, y: 10, w: 300, h: 40, text: words("More off the edge") } as Element] });
    });
    fireEvent.click(recheck);
    expect(within(dialog()).getByRole("button", { name: "Checking…" })).toHaveProperty("disabled", true);
    await screen.findByText(/"More off the edge" sticks out/);
    await waitFor(() => expect(within(dialog()).getByRole("button", { name: "Re-check" })).toHaveProperty("disabled", false));
    expect(lintOf(k.session).stats.slidesChecked - before).toBeGreaterThanOrEqual(3);
    expect(within(dialog()).getAllByRole("region").map((s) => s.getAttribute("aria-label"))).toEqual(["Slide 1", "Slide 2", "Slide 3"]);
  });

  it("is opened from the Tools menu command and closes with Escape", async () => {
    const k = await open(troubled);
    await screen.findByText(/sticks out past the right edge/);
    fireEvent.keyDown(dialog(), { key: "Escape" });
    expect(k.ui.state.dialog).toBeNull();
  });
});

describe("grouping problems by slide", () => {
  it("keeps the order of the deck, drops slides with nothing to show and honours the filter", () => {
    const slide = (id: string) => ({ id }) as never;
    const issue = (rule: string, severity: "error" | "warning" | "info") => ({ rule, severity, slide: "", message: rule });
    const issues = new Map([
      ["b", [issue("one", "error"), issue("two", "info")]],
      ["a", [issue("three", "warning")]],
    ]);
    const groups = groupIssues([slide("a"), slide("c"), slide("b")], issues, new Set(["error", "warning"] as const));
    expect(groups.map((g) => [g.number, g.issues.map((i) => i.rule)])).toEqual([
      [1, ["three"]],
      [3, ["one"]],
    ]);
  });
});

describe("the Lint dialog when the page cannot measure text", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says in one sentence that the text sizes are estimated, beside the other note, and lists the problems all the same", async () => {
    // The chunk that holds the code which lays text out did not arrive.
    vi.spyOn(measure, "measurerReady").mockReturnValue(false);
    vi.spyOn(measure, "loadMeasurer").mockRejectedValue(new Error("Failed to fetch dynamically imported module"));
    await open(troubled);
    await screen.findByText(/sticks out past the right edge/);
    const note = within(dialog()).getByText(/Text sizes are estimated/);
    expect(note.textContent).toContain("Text sizes are estimated: this page could not load what measures them.");
    expect(note.textContent).toMatch(/^Not checked: unresolved-citation/);
    expect(note.closest(".ks-dialog-foot")).not.toBeNull();
  });
});
