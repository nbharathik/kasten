import type { Element, StepState } from "@kasten-slides/wasm";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { dispatchKey, runCommand } from "../../commands/index.ts";
import { shape, textBox } from "../../factory.ts";
import { type Kit, edit, mount } from "../format/test-kit.tsx";

afterEach(cleanup);

const named = (element: Element, name: string): Element => ({ ...element, name }) as Element;
const boxes = (): Element[] => [
  named(shape("rect", { x: 60, y: 200, w: 100, h: 50 }), "A"),
  named(shape("rect", { x: 300, y: 200, w: 100, h: 50 }), "B"),
  named(shape("rect", { x: 540, y: 200, w: 100, h: 50 }), "C"),
];
const byName = (kit: Kit, name: string) => kit.session.slide.elements.find((e) => e.name === name) as Element;
const entries = (kit: Kit, name: string) => (byName(kit, name).stepStates ?? {}) as Record<string, StepState>;
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("the build buttons", () => {
  it("act on the selected elements and leave the others alone, and say so", async () => {
    const kit = await mount({ panel: "steps", elements: boxes(), select: [0, 2] });
    expect(screen.getByText(/Applies to the 2 selected elements/)).toBeTruthy();
    fireEvent.click(button("Reveal one by one"));
    expect(entries(kit, "A")).toEqual({ 0: "hidden", 1: "normal" });
    expect(entries(kit, "C")).toEqual({ 0: "hidden", 2: "normal" });
    expect(entries(kit, "B")).toEqual({});
    expect(kit.session.slide.steps).toBe(2);
    expect(screen.getByText("2 steps.")).toBeTruthy();
    edit(() => kit.session.undo());
    expect(entries(kit, "A")).toEqual({});
    expect(kit.session.slide.steps ?? 0).toBe(0);
  });

  it("act on everything but the title when nothing is selected", async () => {
    const kit = await mount({ panel: "steps", select: [] });
    edit(() => void kit.session.slides.add({ layout: "title-only", content: { title: "Heading" } }));
    const title = kit.session.slide.elements.find((e) => e.placeholder === "title") as Element;
    edit(() => void kit.session.elements.insert(boxes()));
    edit(() => kit.session.select([]));
    expect(screen.getByText(/Applies to all 3 elements but the title/)).toBeTruthy();
    fireEvent.click(button("Walk through"));
    expect(entries(kit, "A")).toEqual({ 1: "highlighted", 2: "dimmed" });
    expect(entries(kit, "B")).toEqual({ 1: "dimmed", 2: "highlighted", 3: "dimmed" });
    expect(entries(kit, "C")).toEqual({ 1: "dimmed", 3: "highlighted" });
    expect(kit.session.slide.elements.find((e) => e.id === title.id)?.stepStates ?? {}).toEqual({});
  });

  it("keep the spotlight for two or more elements and clear steps for anything with steps", async () => {
    const kit = await mount({ panel: "steps", elements: boxes(), select: [1] });
    expect(button("Spotlight").disabled).toBe(true);
    edit(() => kit.session.select([byName(kit, "A").id, byName(kit, "B").id]));
    expect(button("Spotlight").disabled).toBe(false);
    fireEvent.click(button("Spotlight"));
    expect(entries(kit, "A")).toEqual({ 2: "dimmed" });
    expect(entries(kit, "B")).toEqual({ 1: "dimmed", 2: "normal" });
    edit(() => kit.session.select([]));
    fireEvent.click(button("Clear steps"));
    expect(entries(kit, "A")).toEqual({});
    expect(entries(kit, "B")).toEqual({});
    expect(kit.session.slide.steps ?? 0).toBe(0);
  });

  it("are all off on a slide with nothing to build", async () => {
    await mount({ panel: "steps" });
    for (const name of ["Reveal one by one", "Walk through", "Spotlight", "Clear steps"]) expect(button(name).disabled).toBe(true);
    expect(screen.getByText(/Nothing on this slide to build yet/)).toBeTruthy();
  });
});

describe("the items of a list", () => {
  const list = (): Element =>
    ({
      ...textBox({ x: 60, y: 100, w: 500, h: 300 }),
      name: "Points",
      text: { paragraphs: [{ runs: [{ t: "Heading" }] }, { list: "bullet", runs: [{ t: "first" }] }, { list: "bullet", runs: [{ t: "second" }] }, { list: "bullet", runs: [{ t: "third" }] }] },
    }) as Element;
  const steps = (kit: Kit) => (byName(kit, "Points") as Extract<Element, { type: "text" }>).text.paragraphs.map((p) => p.step ?? null);

  it("get a row each once the list builds, and a click moves the step an item appears at", async () => {
    const kit = await mount({ panel: "steps", elements: [list()], select: [0] });
    expect(screen.queryByRole("button", { name: /^first, step/ })).toBeNull();
    fireEvent.click(button("Reveal one by one"));
    expect(steps(kit)).toEqual([null, 1, 2, 3]);
    expect(button("first, step 1: shown, appears here")).toBeTruthy();
    expect(button("second, step 1: not there yet")).toBeTruthy();
    fireEvent.click(button("first, step 3: shown"));
    expect(steps(kit)).toEqual([null, 3, 2, 3]);
    fireEvent.click(button("first, step 3: shown, appears here"));
    expect(steps(kit), "the step it appears at, pressed again, puts it back from the start").toEqual([null, null, 2, 3]);
    edit(() => kit.session.undo());
    expect(steps(kit)).toEqual([null, 3, 2, 3]);
    fireEvent.click(button("third, step 0, as the slide appears: not there yet"));
    expect(steps(kit)).toEqual([null, 3, 2, null]);
  });

  it("raise the steps of the slide when an item is put later than the last", async () => {
    const kit = await mount({ panel: "steps", elements: [list()], select: [0] });
    fireEvent.click(button("Reveal one by one"));
    fireEvent.click(button("Add a step"));
    fireEvent.click(button("first, step 4: shown"));
    expect(steps(kit)).toEqual([null, 4, 2, 3]);
    expect(kit.session.slide.steps).toBe(4);
    edit(() => kit.session.undo());
    expect(steps(kit)).toEqual([null, 1, 2, 3]);
  });
});

describe("the step keys", () => {
  const press = (key: string, code: string) => new KeyboardEvent("keydown", { key, code, altKey: true, cancelable: true });

  it("step the preview forward and back, from the slide as it is styled and up to its ends", async () => {
    const kit = await mount({ panel: "steps", elements: boxes(), select: [] });
    const ctx = { session: kit.session, ui: kit.ui };
    expect(dispatchKey(press("]", "BracketRight"), ctx, "canvas"), "a slide with no steps has none to show").toBe(false);
    edit(() => kit.session.steps.setSteps(2));
    edit(() => void dispatchKey(press("]", "BracketRight"), ctx, "canvas"));
    expect(kit.ui.state.previewStep).toBe(0);
    edit(() => void dispatchKey(press("]", "BracketRight"), ctx, "canvas"));
    edit(() => void dispatchKey(press("]", "BracketRight"), ctx, "canvas"));
    edit(() => void dispatchKey(press("]", "BracketRight"), ctx, "canvas"));
    expect(kit.ui.state.previewStep, "stops at the last").toBe(2);
    edit(() => void dispatchKey(press("[", "BracketLeft"), ctx, "canvas"));
    expect(kit.ui.state.previewStep).toBe(1);
    edit(() => kit.ui.setPreviewStep(null));
    edit(() => void dispatchKey(press("[", "BracketLeft"), ctx, "canvas"));
    expect(kit.ui.state.previewStep, "going back from the styled slide shows the last").toBe(2);
    for (let i = 0; i < 5; i++) edit(() => void dispatchKey(press("[", "BracketLeft"), ctx, "canvas"));
    expect(kit.ui.state.previewStep).toBe(0);
  });

  it("are commands the menu can run, with the builds beside them", async () => {
    const kit = await mount({ panel: "steps", elements: boxes(), select: [0, 1] });
    const ctx = { session: kit.session, ui: kit.ui };
    await runCommand("steps.reveal", ctx);
    expect(kit.session.slide.steps).toBe(2);
    await runCommand("steps.next", ctx);
    expect(kit.ui.state.previewStep).toBe(0);
    await runCommand("steps.clear", ctx);
    expect(kit.session.slide.steps ?? 0).toBe(0);
  });
});
