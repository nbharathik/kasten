// Selecting words in the text box that is open on the slide: a press in it belongs to the text, so the caret, a drag, a double click,
// a triple click and Shift with the arrows all work; a press anywhere else ends the edit.

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { newDeck } from "../../test/engine.ts";
import { textBox } from "../factory.ts";
import { MemoryHost } from "../memory-host.ts";
import { EditorSession } from "../session/session.ts";
import { EditorUi } from "../ui-state.ts";
import { SlideCanvas } from "./SlideCanvas.tsx";

afterEach(cleanup);

// The page reads pointer capture, which jsdom has no notion of.
beforeAll(() => {
  Object.assign(HTMLElement.prototype, { hasPointerCapture: () => false, setPointerCapture: () => {}, releasePointerCapture: () => {} });
});

async function open() {
  const session = new EditorSession(await newDeck("Talk"), new MemoryHost(), { saveDelay: 60_000 });
  const ui = new EditorUi();
  session.slides.add({ layout: "blank" });
  const [id] = session.elements.insert([textBox({ x: 100, y: 100, w: 400, h: 80 }, "Hello brave world")]) as [string];
  session.select([]);
  const view = render(<SlideCanvas session={session} ui={ui} />);
  act(() => session.startEditing(id));
  const editor = () => view.container.querySelector<HTMLElement>(".ks-text-layer .ProseMirror")!;
  return { session, ui, id, view, editor, stage: () => view.container.querySelector<HTMLElement>(".ks-stage")! };
}

describe("a press in the text box that is open", () => {
  it("leaves the focus in the text, so the caret is placed and the edit goes on", async () => {
    const { session, id, editor } = await open();
    expect(document.activeElement).toBe(editor());
    for (const detail of [1, 2, 3]) {
      // A click, then the second and third of a double and a triple click.
      fireEvent.pointerDown(editor(), { button: 0, detail });
      expect(document.activeElement, `press ${detail}`).toBe(editor());
      expect(session.state.editing, `press ${detail}`).toBe(id);
    }
  });

  it("is not the slide's: it is not a press on an element, so nothing is selected, dragged or deselected", async () => {
    const { session, id, editor } = await open();
    fireEvent.pointerDown(editor(), { button: 0, clientX: 150, clientY: 120 });
    fireEvent.pointerMove(editor(), { clientX: 300, clientY: 120 });
    fireEvent.pointerUp(editor(), { clientX: 300, clientY: 120 });
    expect(session.state.editing).toBe(id);
    expect(session.state.selection).toEqual([id]);
  });
});

describe("a press elsewhere on the slide", () => {
  it("ends the edit, and the slide has the focus again", async () => {
    const { session, editor, stage, view } = await open();
    const page = view.container.querySelector<HTMLElement>(".ks-page")!;
    expect(editor()).toBeTruthy();
    fireEvent.pointerDown(page, { button: 0, clientX: 5, clientY: 5 });
    expect(session.state.editing).toBeNull();
    expect(document.activeElement).toBe(stage());
  });
});
