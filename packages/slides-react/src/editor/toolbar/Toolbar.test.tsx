import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { shape } from "../factory.ts";
import { button, click, isDisabled, nextFrame, openEditor, row } from "../menus/testing.ts";
import { Toolbar } from "./Toolbar.tsx";

afterEach(cleanup);

async function setup() {
  const editor = await openEditor();
  render(<Toolbar session={editor.session} ui={editor.ui} />);
  return editor;
}

describe("the toolbar", () => {
  it("has its tools in order, and is a toolbar", async () => {
    await setup();
    const bar = screen.getByRole("toolbar");
    const names = within(bar)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    const order = ["Undo", "Redo", "Paint format", "Zoom", "Select", "Text box", "Image", "Shape", "Line", "Font", "Decrease font size", "Increase font size", "Bold", "Italic", "Underline", "Strikethrough", "Text colour", "Insert link", "Align", "Line spacing", "Bulleted list", "Numbered list", "Decrease indent", "Increase indent", "Clear formatting", "Background", "Layout", "Theme", "Transition"];
    const at = order.map((name) => names.findIndex((n) => n?.startsWith(name)));
    expect(at.every((i) => i >= 0), `${names.join(", ")}`).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("does not take the focus from a text box: its buttons are marked and the mouse leaves the focus", async () => {
    await setup();
    for (const b of within(screen.getByRole("toolbar")).getAllByRole("button")) expect(b.hasAttribute("data-ks-keep-focus"), b.getAttribute("aria-label") ?? "").toBe(true);
    const pressed = fireEvent.mouseDown(button("Select"));
    // fireEvent returns false when a handler called preventDefault, which is what keeps the focus where it is.
    expect(pressed).toBe(false);
  });
});

describe("undo, redo and zoom", () => {
  it("say what they would undo, and are on only when there is something to do", async () => {
    const { session } = await setup();
    expect(isDisabled(button(/^Undo/))).toBe(true);
    expect(isDisabled(button(/^Redo/))).toBe(true);
    act(() => void session.elements.insert([shape("rect", { x: 10, y: 10, w: 50, h: 50 })]));
    expect(button(/^Undo/).getAttribute("aria-label")).toBe("Undo Add elements");
    expect(button(/^Undo/).getAttribute("data-tip")).toMatch(/^Undo Add elements \((Ctrl\+Z|⌘Z)\)$/);
    click(button(/^Undo/));
    expect(session.slide.elements.some((e) => e.type === "shape")).toBe(false);
    expect(button(/^Redo/).getAttribute("aria-label")).toBe("Redo Add elements");
    click(button(/^Redo/));
    expect(session.slide.elements.some((e) => e.type === "shape")).toBe(true);
  });

  it("shows Fit, then the zoom picked from the menu, and checks it", async () => {
    const { ui } = await setup();
    expect(button("Zoom").textContent).toBe("Fit");
    click(button("Zoom"));
    expect(row(/^Fit/).getAttribute("aria-checked")).toBe("true");
    click(row("150%"));
    expect(ui.state.zoom).toBe(1.5);
    expect(button("Zoom").textContent).toBe("150%");
    click(button("Zoom"));
    expect(row("150%").getAttribute("aria-checked")).toBe("true");
    click(row(/^Fit/));
    expect(button("Zoom").textContent).toBe("Fit");
  });

  it("closes the menu on a second click on the button", async () => {
    await setup();
    click(button("Zoom"));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(button("Zoom"));
    click(button("Zoom"));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("what goes on the slide", () => {
  it("marks the tool in use, and arms the tools", async () => {
    const { session } = await setup();
    expect(button("Select").getAttribute("aria-pressed")).toBe("true");
    click(button("Text box"));
    expect(session.state.tool).toBe("text");
    expect(button("Text box").getAttribute("aria-pressed")).toBe("true");
    expect(button("Select").getAttribute("aria-pressed")).toBe("false");
    click(button("Select"));
    expect(session.state.tool).toBe("select");
  });

  it("arms a shape from the grid of outlines, grouped by title", async () => {
    const { session } = await setup();
    click(button("Shape"));
    const grid = screen.getByRole("dialog", { name: "Shapes" });
    for (const group of ["Shapes", "Arrows", "Callouts", "Flowchart"]) expect(within(grid).getByRole("group", { name: group })).toBeTruthy();
    // Each cell is a small drawing of the shape.
    expect(within(grid).getByRole("button", { name: "Oval" }).querySelector("path")?.getAttribute("d")).toMatch(/^M/);
    click(within(grid).getByRole("button", { name: "Oval" }));
    expect(session.state.tool).toBe("shape:ellipse");
    expect(screen.queryByRole("dialog", { name: "Shapes" })).toBeNull();
    expect(button("Shape").getAttribute("aria-pressed")).toBe("true");
    click(button("Shape"));
    expect(within(screen.getByRole("dialog", { name: "Shapes" })).getByRole("button", { name: "Oval" }).className).toContain("is-on");
  });

  it("moves between the shapes with the arrow keys, and closes on Escape", async () => {
    await setup();
    fireEvent.click(button("Shape"));
    await nextFrame();
    const grid = screen.getByRole("dialog", { name: "Shapes" });
    const first = within(grid).getByRole("button", { name: "Rectangle" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(within(grid).getByRole("button", { name: "Rounded rectangle" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Shapes" })).toBeNull();
  });

  it("arms a line, an arrow or a connector, and opens the image sources", async () => {
    const { session, ui } = await setup();
    click(button("Line"));
    click(row(/^Curved arrow connector/));
    expect(session.state.tool).toBe("arrow:curved");
    expect(button("Line").getAttribute("aria-pressed")).toBe("true");
    click(button("Image"));
    click(row(/^Image from the gallery/));
    expect(ui.state.galleryOpen).toBe(true);
  });
});

describe("the slide's own buttons", () => {
  it("change the layout, checking the one in use", async () => {
    const { session } = await setup();
    click(button("Layout"));
    expect(row("Title").getAttribute("aria-checked")).toBe("true");
    click(row("Two columns"));
    expect(session.slide.layout).toBe("two-columns");
    click(button("Layout"));
    expect(row("Two columns").getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByRole("menuitemcheckbox").length).toBe(session.deck.theme.layouts.length);
  });

  it("apply one of the four themes, or open the theme editor", async () => {
    const { session, ui } = await setup();
    click(button("Theme"));
    expect(["Light", "Dark", "Serif", "Lecture"].every((name) => row(name))).toBe(true);
    expect(row("Light").getAttribute("aria-checked")).toBe("true");
    click(row("Serif"));
    expect(session.deck.theme.name).toBe("Serif");
    click(button("Theme"));
    click(row(/^Edit theme/));
    expect(ui.state.dialog).toBe("theme");
  });

  it("open the background and transition dialogs", async () => {
    const { ui } = await setup();
    click(button("Background"));
    expect(ui.state.dialog).toBe("background");
    click(button("Transition"));
    expect(ui.state.dialog).toBe("transition");
  });
});

describe("tooltips", () => {
  it("come from the toolbar itself, with the keys, so a scrolling row cannot clip them", async () => {
    await setup();
    const bold = button("Bold");
    fireEvent.mouseOver(bold);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toMatch(/^Bold \((Ctrl\+B|⌘B)\)$/);
    fireEvent.mouseDown(bold);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("the keyboard", () => {
  it("goes from button to button with Left and Right, skipping what is off", async () => {
    await setup();
    button("Select").focus();
    fireEvent.keyDown(button("Select"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(button("Text box"));
    fireEvent.keyDown(button("Text box"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(button("Select"));
    // Undo and Redo are off, and so cannot be reached; the first button that can is Paint format's neighbour, the zoom.
    fireEvent.keyDown(button("Select"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(button("Zoom"));
  });

  it("opens a dropdown with the keyboard so that its first row is ready, and gives the focus back", async () => {
    await setup();
    button("Zoom").focus();
    // A click made by the keyboard has no detail.
    fireEvent.click(button("Zoom"));
    await nextFrame();
    expect(document.activeElement).toBe(row(/^Fit/));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(row("50%"));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button("Zoom"));
  });

  it("keeps a key pressed in an open dropdown from the editor's shortcuts", async () => {
    const { session } = await setup();
    act(() => void session.elements.insert([shape("rect", { x: 10, y: 10, w: 50, h: 50 })]));
    button("Zoom").focus();
    fireEvent.click(button("Zoom"));
    await nextFrame();
    const seen = vi.fn();
    document.body.addEventListener("keydown", seen);
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    document.body.removeEventListener("keydown", seen);
    expect(seen).not.toHaveBeenCalled();
    expect(session.slide.elements.some((e) => e.type === "shape")).toBe(true);
  });
});

describe("a window too narrow for the words on the slide buttons", () => {
  it("shows only their icons until the window is wide enough again", async () => {
    // jsdom has no layout: give the row a width, and something to tell it when that changes.
    let client = 900;
    const scroll = 1400;
    const watchers: (() => void)[] = [];
    const proto = HTMLElement.prototype;
    const widths = { client: Object.getOwnPropertyDescriptor(proto, "clientWidth"), scroll: Object.getOwnPropertyDescriptor(proto, "scrollWidth") };
    Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => client });
    Object.defineProperty(proto, "scrollWidth", { configurable: true, get: () => scroll });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          watchers.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      await setup();
      const bar = screen.getByRole("toolbar");
      expect(bar.classList.contains("is-compact")).toBe(true);
      client = 1500;
      await act(async () => watchers.forEach((watch) => watch()));
      expect(bar.classList.contains("is-compact")).toBe(false);
      client = 1200;
      await act(async () => watchers.forEach((watch) => watch()));
      expect(bar.classList.contains("is-compact")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      if (widths.client) Object.defineProperty(proto, "clientWidth", widths.client);
      else Reflect.deleteProperty(proto, "clientWidth");
      if (widths.scroll) Object.defineProperty(proto, "scrollWidth", widths.scroll);
      else Reflect.deleteProperty(proto, "scrollWidth");
    }
  });
});
