// The move handle is a way to start the controller's own move, so a drag from it must come to exactly what a drag on the block comes to.

import { describe, expect, it } from "vitest";

import { newDeck } from "../../test/engine.ts";
import { shape, textBox } from "../factory.ts";
import { MemoryHost } from "../memory-host.ts";
import { EditorSession } from "../session/session.ts";
import { EditorUi } from "../ui-state.ts";
import { CanvasController, type PointerInfo, type Target } from "./controller.ts";

const at = (x: number, y: number, extra: Partial<PointerInfo> = {}): PointerInfo => ({ x, y, shift: false, alt: false, mod: false, button: 0, detail: 1, ...extra });

async function setup(snap = false) {
  const session = new EditorSession(await newDeck("Talk"), new MemoryHost(), { saveDelay: 60_000 });
  const ui = new EditorUi();
  if (!snap) ui.toggleSnap();
  const controller = new CanvasController(session, ui, () => 1);
  session.slides.add({ layout: "blank" });
  const [a, b] = session.elements.insert([shape("rect", { x: 100, y: 100, w: 200, h: 100 }), shape("ellipse", { x: 500, y: 300, w: 120, h: 120 })]) as [string, string];
  session.select([]);
  return { session, ui, controller, a, b };
}

const SURFACE: Target = { kind: "surface" };
const drag = (c: CanvasController, from: [number, number], to: [number, number], target: Target = SURFACE, mods: Partial<PointerInfo> = {}) => {
  c.down(at(...from, mods), target);
  for (let i = 1; i <= 4; i++) c.move(at(from[0] + ((to[0] - from[0]) * i) / 4, from[1] + ((to[1] - from[1]) * i) / 4, mods));
  c.up(at(...to, mods));
};
const find = (s: EditorSession, id: string) => s.slide.elements.find((e) => e.id === id)!;

describe("a drag from the move handle", () => {
  it("moves the selected block as far as a drag on the block does, with the pointer nowhere near it", async () => {
    const { session, controller, a } = await setup();
    session.select([a]);
    // The handle is out beyond the top left corner (100, 100); the pointer travels (50, 30).
    drag(controller, [70, 70], [120, 100], { kind: "move", id: null });
    expect(find(session, a)).toMatchObject({ x: 150, y: 130, w: 200, h: 100 });
    session.undo();
    drag(controller, [150, 150], [200, 180]);
    expect(find(session, a)).toMatchObject({ x: 150, y: 130 });
  });

  it("is one step of undo, and changes nothing until it ends", async () => {
    const { session, controller, a } = await setup();
    session.select([a]);
    const revision = session.state.revision;
    controller.down(at(70, 70), { kind: "move", id: null });
    controller.move(at(100, 90));
    controller.move(at(130, 110));
    expect(controller.preview.overrides.get(a)).toMatchObject({ x: 160, y: 140 });
    expect(find(session, a)).toMatchObject({ x: 100, y: 100 });
    controller.up(at(130, 110));
    expect(session.state.revision).toBe(revision + 1);
    expect(session.state.undoLabel).toBe("transform_elements");
    session.undo();
    expect(find(session, a)).toMatchObject({ x: 100, y: 100 });
  });

  it("snaps to the others and shows the guides, as the block's own drag does", async () => {
    const { session, controller, a } = await setup(true);
    session.select([a]);
    controller.down(at(70, 70), { kind: "move", id: null });
    // 505 would leave the left edge 5 short of the other shape's (500): it lands on it.
    controller.move(at(70 + 405, 70 + 60));
    expect(controller.preview.guides.length).toBeGreaterThan(0);
    expect(controller.preview.overrides.get(a)?.x).toBe(500);
    controller.up(at(70 + 405, 70 + 60));
    expect(find(session, a).x).toBe(500);
  });

  it("locks to one direction with shift, and holding shift does not touch the selection", async () => {
    const { session, controller, a, b } = await setup();
    session.select([a]);
    drag(controller, [70, 70], [170, 80], { kind: "move", id: null }, { shift: true });
    expect(find(session, a)).toMatchObject({ x: 200, y: 100 });
    expect(session.state.selection).toEqual([a]);
    expect(find(session, b)).toMatchObject({ x: 500, y: 300 });
  });

  it("moves a selection of several together, and a mere press leaves it as it was", async () => {
    const { session, controller, a, b } = await setup();
    session.select([a, b]);
    controller.down(at(70, 70), { kind: "move", id: null });
    controller.up(at(70, 70));
    expect(session.state.selection).toEqual([a, b]);
    drag(controller, [70, 70], [90, 100], { kind: "move", id: null });
    expect(find(session, a)).toMatchObject({ x: 120, y: 130 });
    expect(find(session, b)).toMatchObject({ x: 520, y: 330 });
    expect(session.state.undoLabel).toBe("transform_elements");
    session.undo();
    expect(find(session, a)).toMatchObject({ x: 100, y: 100 });
    expect(find(session, b)).toMatchObject({ x: 500, y: 300 });
  });

  it("is put back by Escape", async () => {
    const { session, controller, a } = await setup();
    session.select([a]);
    controller.down(at(70, 70), { kind: "move", id: null });
    controller.move(at(170, 170));
    expect(controller.cancel()).toBe(true);
    expect(controller.preview.overrides.size).toBe(0);
    controller.up(at(170, 170));
    expect(find(session, a)).toMatchObject({ x: 100, y: 100 });
  });

  it("says what it is in the preview, and nothing once it is over", async () => {
    const { session, controller, a } = await setup();
    session.select([a]);
    expect(controller.preview.gesture).toBeNull();
    controller.down(at(70, 70), { kind: "move", id: null });
    expect(controller.preview.gesture).toBe("grab");
    controller.move(at(170, 170));
    expect(controller.preview.gesture).toBe("grab");
    controller.up(at(170, 170));
    expect(controller.preview.gesture).toBeNull();
    // A drag on the block itself, which is now at 200, 200, is a move and not a grab.
    controller.down(at(250, 250), SURFACE);
    controller.move(at(300, 300));
    expect(controller.preview.gesture).toBe("move");
    controller.up(at(300, 300));
  });
});

describe("a drag from the handle of a block that is not selected", () => {
  it("selects the block and moves it, in one drag", async () => {
    const { session, controller, a, b } = await setup();
    session.select([b]);
    drag(controller, [70, 70], [120, 100], { kind: "move", id: a });
    expect(session.state.selection).toEqual([a]);
    expect(find(session, a)).toMatchObject({ x: 150, y: 130 });
    expect(find(session, b)).toMatchObject({ x: 500, y: 300 });
  });

  it("selects it even when the press is only a click", async () => {
    const { session, controller, a } = await setup();
    controller.down(at(70, 70), { kind: "move", id: a });
    controller.up(at(70, 70));
    expect(session.state.selection).toEqual([a]);
    expect(find(session, a)).toMatchObject({ x: 100, y: 100 });
  });

  it("does nothing for a block that is locked or gone", async () => {
    const { session, controller, a } = await setup();
    session.elements.lock(true, [a]);
    const revision = session.state.revision;
    drag(controller, [70, 70], [120, 100], { kind: "move", id: a });
    drag(controller, [70, 70], [120, 100], { kind: "move", id: "nothing" });
    expect(controller.busy).toBe(false);
    expect(session.state.revision).toBe(revision);
    expect(session.state.selection).toEqual([]);
  });
});

describe("the move handle while text is being edited", () => {
  it("moves the box and leaves it open, with the same box being edited", async () => {
    const { session, controller } = await setup();
    const [box] = session.elements.insert([textBox({ x: 100, y: 300, w: 300, h: 80 }, "Hello brave world")]) as [string];
    session.startEditing(box);
    drag(controller, [70, 270], [170, 300], { kind: "move", id: null });
    expect(find(session, box)).toMatchObject({ x: 200, y: 330 });
    expect(session.state.editing).toBe(box);
    expect(session.state.selection).toEqual([box]);
    // The words are as they were: moving a box does not touch what is in it.
    expect(JSON.stringify(find(session, box))).toContain("Hello brave world");
  });

  it("closes the box being edited when it is another block's handle that is pressed", async () => {
    const { session, controller, a } = await setup();
    const [box] = session.elements.insert([textBox({ x: 100, y: 300, w: 300, h: 80 }, "Hello")]) as [string];
    session.startEditing(box);
    controller.down(at(70, 70), { kind: "move", id: a });
    expect(session.state.editing).toBeNull();
    expect(session.state.selection).toEqual([a]);
    controller.up(at(70, 70));
  });
});

describe("the move handle with a drawing tool in hand", () => {
  it("does nothing: the press is left to the tool", async () => {
    const { session, controller, a } = await setup();
    session.select([a]);
    session.setTool("shape:rect");
    controller.down(at(70, 70), { kind: "move", id: null });
    expect(controller.busy).toBe(false);
  });
});
