// Select all in each place of the editor: the key, the Edit menu and the right-click menus do the same thing, and a field keeps its own.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { openDeck } from "../filmstrip/test-support.ts";
import { bar, click, fakeTextBox, row } from "../menus/testing.ts";
import { Workspace } from "../SlidesEditor.tsx";

afterEach(cleanup);

// The search dialog watches the size of its list.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

const ctrlA = { key: "a", code: "KeyA", ctrlKey: true };

async function open(slides = 3) {
  const made = await openDeck({ slides });
  render(<Workspace session={made.session} ui={made.ui} />);
  return made;
}

const list = () => screen.getByRole("listbox", { name: "Slides" });
const stage = () => screen.getByRole("application", { name: "Slide" });
const notes = () => screen.getByRole("textbox", { name: "Speaker notes for this slide" }) as HTMLTextAreaElement;
const selected = () => window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "";

/** Edit, Select all, from the menu bar. */
function fromEditMenu(): void {
  click(bar("Edit"));
  fireEvent.click(row(/^Select all/));
}

describe("Ctrl+A", () => {
  it("selects the elements of the slide when the focus is on it", async () => {
    const { session } = await open();
    stage().focus();
    expect(fireEvent.keyDown(stage(), ctrlA)).toBe(false);
    expect(session.state.selection.length).toBe(session.slide.elements.filter((e) => !e.locked).length);
    expect(session.state.selection.length).toBeGreaterThan(0);
  });

  it("selects the slides in the filmstrip, and only there", async () => {
    const { session } = await open(4);
    list().focus();
    fireEvent.keyDown(list(), ctrlA);
    expect(session.state.slideSelection).toHaveLength(4);
    expect(session.state.selection).toEqual([]);
  });

  it("is left to a field: the notes, the deck's name and the search box of a dialog select their own text", async () => {
    const { session, ui } = await open();
    const before = session.state.selection;
    for (const field of [notes(), screen.getByRole("textbox", { name: "Deck title" })]) {
      field.focus();
      // Not prevented: the browser goes on to select the field's text.
      expect(fireEvent.keyDown(field, ctrlA), (field as HTMLInputElement).ariaLabel ?? "field").toBe(true);
    }
    act(() => ui.openDialog("find"));
    const search = within(screen.getByRole("dialog")).getAllByRole("textbox")[0]!;
    expect(fireEvent.keyDown(search, ctrlA)).toBe(true);
    expect(session.state.selection).toBe(before);
    expect(session.state.slideSelection).toHaveLength(1);
  });
});

describe("Edit, Select all", () => {
  it("selects the elements of the slide when that is where the person was", async () => {
    const { session } = await open();
    stage().focus();
    fromEditMenu();
    expect(session.state.selection.length).toBeGreaterThan(0);
  });

  it("selects the slides when the person was in the filmstrip", async () => {
    const { session } = await open(4);
    list().focus();
    fromEditMenu();
    expect(session.state.slideSelection).toHaveLength(4);
    expect(session.state.selection).toEqual([]);
  });

  it("selects the text of the notes when the person was typing in them", async () => {
    const { session } = await open();
    act(() => session.slides.setNotes("Speak slowly, then pause", session.state.slideId));
    notes().focus();
    fromEditMenu();
    expect(notes().selectionStart).toBe(0);
    expect(notes().selectionEnd).toBe("Speak slowly, then pause".length);
    expect(session.state.selection).toEqual([]);
  });

  it("selects the text of a field in the filmstrip (a section's name) rather than the slides", async () => {
    const { session } = await open(3);
    const field = document.createElement("input");
    field.value = "Section one";
    document.querySelector(".ks-filmstrip")!.appendChild(field);
    field.focus();
    fromEditMenu();
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, "Section one".length]);
    expect(session.state.slideSelection).toHaveLength(1);
    field.remove();
  });

  it("asks the text box for its words when one is open", async () => {
    const { ui } = await open();
    const box = fakeTextBox();
    act(() => ui.setText(box));
    fromEditMenu();
    expect(box.selectAll).toHaveBeenCalledTimes(1);
  });

  it("selects the text of a panel when the person was in one", async () => {
    const { ui } = await open();
    act(() => ui.openPanel("steps"));
    const panel = document.querySelector<HTMLElement>(".ks-side-panel")!;
    const inside = panel.querySelector<HTMLElement>("[role=tabpanel]")!;
    inside.tabIndex = -1;
    inside.focus();
    expect(document.activeElement).toBe(inside);
    fromEditMenu();
    expect(selected()).toBe(panel.textContent?.replace(/\s+/g, " ").trim());
    expect(selected().length).toBeGreaterThan(0);
  });
});

describe("Ctrl+A in a panel", () => {
  it("selects the text of the panel when the focus is in it and not in a field", async () => {
    const { ui, session } = await open();
    act(() => ui.openPanel("steps"));
    const panel = document.querySelector<HTMLElement>(".ks-side-panel")!;
    // A press on the panel's words leaves the focus on the panel itself.
    panel.focus();
    expect(document.activeElement).toBe(panel);
    expect(fireEvent.keyDown(panel, ctrlA)).toBe(false);
    expect(selected()).toBe(panel.textContent?.replace(/\s+/g, " ").trim());
    expect(session.state.selection).toEqual([]);
  });

  it("is a field's own inside the panel", async () => {
    const { ui } = await open();
    act(() => ui.openPanel("format"));
    const field = document.querySelector<HTMLElement>(".ks-side-panel input");
    if (!field) return;
    (field as HTMLInputElement).focus();
    expect(fireEvent.keyDown(field, ctrlA)).toBe(true);
  });
});

describe("Select all in the right-click menus", () => {
  it("is on the empty slide's menu, and selects the elements", async () => {
    const { session, ui } = await open();
    stage().focus();
    act(() => ui.openContextMenu({ kind: "canvas", x: 10, y: 10 }));
    fireEvent.click(row(/^Select all/));
    expect(session.state.selection.length).toBeGreaterThan(0);
  });

  it("is on a slide's menu in the filmstrip, and selects the slides", async () => {
    const { session, ui } = await open(4);
    list().focus();
    act(() => ui.openContextMenu({ kind: "slide", x: 10, y: 10 }));
    fireEvent.click(row(/^Select all slides/));
    expect(session.state.slideSelection).toHaveLength(4);
  });
});

describe("in the grid", () => {
  it("Edit, Select all and Ctrl+A select every slide, whatever had the focus before", async () => {
    const { session, ui } = await open(4);
    stage().focus();
    act(() => ui.setView("grid"));
    fromEditMenu();
    expect(session.state.slideSelection).toHaveLength(4);
    act(() => session.selectSlides([session.deck.slides[0]!.id]));
    list().focus();
    fireEvent.keyDown(list(), ctrlA);
    expect(session.state.slideSelection).toHaveLength(4);
  });
});

describe("the places that keep their own select all", () => {
  it("say what theirs does while they are shown, and are forgotten after", async () => {
    const { ui } = await openDeck({ slides: 1 });
    const slides = vi.fn();
    const off = ui.areas.register("slides", slides);
    expect(ui.areas.run("slides")).toBe(true);
    expect(slides).toHaveBeenCalledTimes(1);
    expect(ui.areas.run("outline")).toBe(false);
    // A newer one takes over, and the older one going away does not take that back.
    const newer = vi.fn();
    const offNewer = ui.areas.register("slides", newer);
    off();
    expect(ui.areas.run("slides")).toBe(true);
    expect(newer).toHaveBeenCalledTimes(1);
    offNewer();
    expect(ui.areas.run("slides")).toBe(false);
  });

  it("know where the focus last was, but not in a menu, and not on what has gone", async () => {
    const { ui } = await openDeck({ slides: 1 });
    const one = document.body.appendChild(document.createElement("button"));
    const menu = document.body.appendChild(document.createElement("div"));
    menu.className = "ks-popover";
    const inside = menu.appendChild(document.createElement("button"));
    ui.areas.noteFocus(one);
    ui.areas.noteFocus(inside);
    expect(ui.areas.focused).toBe(one);
    ui.areas.noteBlur(one, null);
    expect(ui.areas.focused).toBeNull();
    ui.areas.noteFocus(one);
    ui.areas.noteBlur(one, inside);
    expect(ui.areas.focused).toBe(one);
    one.remove();
    expect(ui.areas.focused).toBeNull();
    menu.remove();
  });
});
