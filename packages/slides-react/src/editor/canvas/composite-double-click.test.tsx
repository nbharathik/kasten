import type { Element } from "@kasten-slides/wasm";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { newDeck } from "../../test/engine.ts";
import { textBox } from "../factory.ts";
import { MemoryHost } from "../memory-host.ts";
import { frames } from "../panels/format/composites/frames.ts";
import { SidePanel } from "../panels/SidePanel.tsx";
import { EditorSession } from "../session/session.ts";
import { EditorUi } from "../ui-state.ts";
import { CanvasController, type PointerInfo } from "./controller.ts";

afterEach(cleanup);

const at = (x: number, y: number): PointerInfo => ({ x, y, shift: false, alt: false, mod: false, button: 0, detail: 2 });

async function setup(elements: Element[]) {
  const session = new EditorSession(await newDeck("Talk"), new MemoryHost(), { saveDelay: 60_000 });
  const ui = new EditorUi();
  const controller = new CanvasController(session, ui, () => 1);
  session.slides.add({ layout: "blank" });
  const ids = session.elements.insert(elements);
  session.select([]);
  return { session, ui, controller, ids };
}

const code = { type: "code", id: "", language: "python", code: "print(1)", x: 100, y: 100, w: 400, h: 200 } as unknown as Element;
const frame = { type: "math", id: "", latex: "x^2", x: 100, y: 350, w: 300, h: 100 } as unknown as Element;

describe("a double click on a composite", () => {
  it.each([
    ["code", code, { x: 200, y: 150 }],
    ["math", frame, { x: 200, y: 400 }],
  ] as const)("selects the %s, opens the format options, and asks for the caret in its main field", async (_kind, element, point) => {
    const { session, ui, controller, ids } = await setup([element]);
    controller.doubleClick(at(point.x, point.y));
    expect(session.state.selection).toEqual([ids[0]]);
    expect(ui.state.panel).toBe("format");
    expect(session.state.editing).toBeNull();
  });

  it("puts the caret there when the panel comes up", async () => {
    const { session, ui, controller } = await setup([code]);
    render(<SidePanel session={session} ui={ui} />);
    controller.doubleClick(at(200, 150));
    await frames(2);
    expect((document.activeElement as HTMLElement | null)?.getAttribute("aria-label")).toBe("Code");
  });

  it("still opens the words of a text box for editing, and does nothing on empty canvas", async () => {
    const { session, ui, controller, ids } = await setup([code, textBox({ x: 600, y: 100, w: 200, h: 60 }, "Hello")]);
    controller.doubleClick(at(650, 120));
    expect(session.state.editing).toBe(ids[1]);
    expect(ui.state.panel).toBeNull();
    session.stopEditing();
    controller.doubleClick(at(20, 500));
    expect(ui.state.panel).toBeNull();
  });

  it("does nothing while a drawing tool is armed", async () => {
    const { session, ui, controller } = await setup([code]);
    session.setTool("text");
    controller.doubleClick(at(200, 150));
    expect(ui.state.panel).toBeNull();
  });
});
