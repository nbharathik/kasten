import type { Element, StepState } from "@kasten-slides/wasm";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { shape } from "../../factory.ts";
import { type Kit, edit, mount } from "../format/test-kit.tsx";

afterEach(cleanup);

const named = (element: Element, name: string): Element => ({ ...element, name }) as Element;

/** Three boxes, left to right, named A, B and C, on a blank slide. */
const three = (): Element[] => [
  named(shape("rect", { x: 300, y: 100, w: 100, h: 50 }), "B"),
  named(shape("rect", { x: 60, y: 100, w: 100, h: 50 }), "A"),
  named(shape("rect", { x: 540, y: 100, w: 100, h: 50 }), "C"),
];

const kitOf = (elements = three(), select: number[] = []) => mount({ panel: "steps", elements, select });

const cell = (layer: string, step: number) => screen.getByRole("button", { name: new RegExp(`^${layer}, step ${step}[,:]`) });
const head = (step: number) => screen.getByRole("button", { name: new RegExp(`^Show step ${step}\\b`) });
const layers = () => within(screen.getByRole("grid")).getAllByRole("rowheader").map((th) => th.textContent);
const idOf = (kit: Kit, name: string) => kit.session.slide.elements.find((e) => e.name === name)?.id as string;
const entries = (kit: Kit, name: string): Record<string, StepState> => (kit.session.slide.elements.find((e) => e.name === name)?.stepStates ?? {}) as Record<string, StepState>;

describe("the grid", () => {
  it("lists the elements of the slide in reading order against the steps it has", async () => {
    const kit = await kitOf();
    expect(layers()).toEqual(["A", "B", "C"]);
    expect(within(screen.getByRole("grid")).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Layers", "0", ""]);
    edit(() => kit.session.steps.setSteps(3));
    expect(within(screen.getByRole("grid")).getAllByRole("columnheader").map((h) => h.textContent?.replace(/\s/g, ""))).toEqual(["Layers", "0", "1", "2", "3", ""]);
  });

  it("adds a step with the plus and takes the last away with the small cross", async () => {
    const kit = await kitOf();
    fireEvent.click(screen.getByRole("button", { name: "Add a step" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a step" }));
    expect(kit.session.slide.steps).toBe(2);
    expect(head(2)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove step 2" }));
    expect(kit.session.slide.steps).toBe(1);
    expect(screen.queryByRole("button", { name: "Remove step 2" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove step 1" }));
    expect(kit.session.slide.steps ?? 0).toBe(0);
    expect(screen.queryByRole("button", { name: /^Remove step/ })).toBeNull();
    // Each is a step of undo.
    edit(() => kit.session.undo());
    expect(kit.session.slide.steps).toBe(1);
  });

  it("changes a state on each click: hidden, dimmed, normal, highlighted, and then what came before", async () => {
    const kit = await kitOf();
    edit(() => kit.session.steps.setSteps(2));
    const seen: (StepState | undefined)[] = [];
    for (let click = 0; click < 5; click++) {
      fireEvent.click(cell("A", 1));
      seen.push(entries(kit, "A")["1"]);
    }
    expect(seen).toEqual(["hidden", "dimmed", "normal", "highlighted", undefined]);
    expect(entries(kit, "A")).toEqual({});
  });

  it("says in each cell what the element is like there and whether it says so or carries it on", async () => {
    const kit = await kitOf();
    edit(() => kit.session.steps.setState(idOf(kit, "B"), 1, "hidden"));
    edit(() => kit.session.steps.setSteps(3));
    expect(cell("B", 1).getAttribute("aria-label")).toBe("B, step 1: hidden, set here");
    expect(cell("B", 2).getAttribute("aria-label")).toBe("B, step 2: hidden, from before");
    expect(cell("A", 0).getAttribute("aria-label")).toBe("A, step 0, as the slide appears: normal, from before");
    expect(cell("B", 1).className).toContain("is-hidden");
    expect(cell("B", 1).className).toContain("is-set");
    expect(cell("B", 2).className).not.toContain("is-set");
  });

  it("offers all four states and the state from before on a right click", async () => {
    const kit = await kitOf();
    edit(() => kit.session.steps.setSteps(2));
    fireEvent.contextMenu(cell("C", 2), { clientX: 20, clientY: 20 });
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitemcheckbox").map((i) => i.textContent)).toEqual(["Hidden", "Dimmed", "Normal", "Highlighted"]);
    expect((within(menu).getByRole("menuitem", { name: "Same as before" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Highlighted" }));
    expect(entries(kit, "C")).toEqual({ 2: "highlighted" });
    fireEvent.contextMenu(cell("C", 2), { clientX: 20, clientY: 20 });
    expect(screen.getByRole("menuitemcheckbox", { name: "Highlighted" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Same as before" }));
    expect(entries(kit, "C")).toEqual({});
  });
});

describe("a code block that walks through its lines", () => {
  const code = (): Element =>
    ({ type: "code", id: "", x: 60, y: 200, w: 500, h: 200, language: "python", code: "a = 1\nb = 2\nc = 3", focus: ["1", "2", "3"], name: "Listing" }) as Element;

  it("keeps the last step it needs: the small cross for it is off", async () => {
    const kit = await kitOf([code()]);
    edit(() => kit.session.steps.setSteps(4));
    expect((screen.getByRole("button", { name: "Remove step 4" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Remove step 4" }));
    const last = screen.getByRole("button", { name: "Remove step 3" }) as HTMLButtonElement;
    expect(last.disabled).toBe(true);
    expect(last.title).toContain("code block");
    expect(kit.session.slide.steps).toBe(3);
  });
});

describe("with the keyboard", () => {
  it("is one stop for Tab, and the arrows walk the cells", async () => {
    await kitOf();
    edit(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Add a step" }));
    const stops = [...document.querySelectorAll<HTMLElement>("[data-cell]")].filter((el) => el.tabIndex === 0);
    expect(stops).toHaveLength(1);
    const first = screen.getByRole("button", { name: "A" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell("A", 0));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell("A", 1));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell("B", 1));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
    expect(document.activeElement).toBe(head(1));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add a step" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home", ctrlKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show step 0, as the slide appears" }));
    // Whatever cell has the focus is the one stop.
    expect([...document.querySelectorAll<HTMLElement>("[data-cell]")].filter((el) => el.tabIndex === 0)).toEqual([document.activeElement]);
  });

  it("changes a state with Space, goes back with Shift, and restores it with Delete", async () => {
    const kit = await kitOf();
    edit(() => kit.session.steps.setSteps(1));
    cell("A", 1).focus();
    fireEvent.click(cell("A", 1));
    fireEvent.click(cell("A", 1));
    expect(entries(kit, "A")).toEqual({ 1: "dimmed" });
    fireEvent.click(cell("A", 1), { shiftKey: true });
    expect(entries(kit, "A")).toEqual({ 1: "hidden" });
    fireEvent.keyDown(cell("A", 1), { key: "Delete" });
    expect(entries(kit, "A")).toEqual({});
    fireEvent.keyDown(cell("A", 1), { key: "F10", shiftKey: true });
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
  });

  it("leaves the keys of the slide alone: Delete in the grid does not delete the element", async () => {
    const kit = await kitOf(three(), [0]);
    edit(() => kit.session.steps.setSteps(1));
    const before = kit.session.slide.elements.length;
    fireEvent.keyDown(cell("A", 1), { key: "Backspace" });
    expect(kit.session.slide.elements).toHaveLength(before);
  });
});

describe("the preview", () => {
  it("shows a step when its heading is pressed, and the same heading again puts the slide back", async () => {
    const kit = await kitOf();
    edit(() => kit.session.steps.setSteps(3));
    fireEvent.click(head(2));
    expect(kit.ui.state.previewStep).toBe(2);
    expect(head(2).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(head(3));
    expect(kit.ui.state.previewStep).toBe(3);
    fireEvent.click(head(3));
    expect(kit.ui.state.previewStep).toBeNull();
  });

  it("follows the focus along the columns while it is on, and ends with Escape or with the tab", async () => {
    const kit = await kitOf();
    edit(() => kit.session.steps.setSteps(3));
    cell("A", 1).focus();
    expect(kit.ui.state.previewStep, "off until asked for").toBeNull();
    fireEvent.click(head(1));
    cell("A", 1).focus();
    fireEvent.keyDown(cell("A", 1), { key: "ArrowRight" });
    expect(kit.ui.state.previewStep).toBe(2);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(kit.ui.state.previewStep).toBe(3);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    expect(kit.ui.state.previewStep).toBe(3);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(kit.ui.state.previewStep).toBeNull();
    fireEvent.click(head(2));
    expect(kit.ui.state.previewStep).toBe(2);
    fireEvent.click(screen.getByRole("tab", { name: "Format options" }));
    expect(kit.ui.state.previewStep, "leaving the tab").toBeNull();
  });
});

describe("selecting", () => {
  it("selects the element of a row on the canvas, and the selection marks the rows", async () => {
    const kit = await kitOf();
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    expect(kit.session.state.selection).toEqual([idOf(kit, "B")]);
    fireEvent.click(screen.getByRole("button", { name: "C" }), { shiftKey: true });
    expect(new Set(kit.session.state.selection)).toEqual(new Set([idOf(kit, "B"), idOf(kit, "C")]));
    const marked = () => within(screen.getByRole("grid")).getAllByRole("row").filter((r) => r.getAttribute("aria-selected") === "true").map((r) => within(r).getByRole("rowheader").textContent);
    expect(marked()).toEqual(["B", "C"]);
    edit(() => kit.session.select([idOf(kit, "A")]));
    expect(marked()).toEqual(["A"]);
    edit(() => kit.session.select([]));
    expect(marked()).toEqual([]);
  });

  it("opens a group into its children, whose click selects the group", async () => {
    const kit = await kitOf();
    edit(() => kit.session.select([idOf(kit, "A"), idOf(kit, "B")]));
    edit(() => kit.session.elements.group());
    expect(layers()).toEqual(["Group", "C"]);
    fireEvent.click(screen.getByRole("button", { name: /^Show what Group holds/ }));
    expect(layers()).toEqual(["Group", "A", "B", "C"]);
    const group = kit.session.slide.elements.find((e) => e.type === "group") as Element;
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(kit.session.state.selection).toEqual([group.id]);
    fireEvent.click(cell("A", 0));
    fireEvent.click(screen.getByRole("button", { name: "Add a step" }));
    fireEvent.click(cell("A", 1));
    const inner = group.type === "group" ? (kit.session.slide.elements.find((e) => e.id === group.id) as Extract<Element, { type: "group" }>).children.find((c) => c.name === "A") : undefined;
    expect(inner?.stepStates).toEqual({ 0: "hidden", 1: "hidden" });
  });
});
