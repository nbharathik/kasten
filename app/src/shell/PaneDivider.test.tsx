import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useWorkspace } from "../features/workspace/store";
import { derive } from "../features/workspace/store-layout";
import { initialLayout, split, type Layout } from "../features/workspace/tabs";
import { PaneDivider } from "./PaneDivider";

afterEach(cleanup);

let layout: Layout;
beforeEach(() => {
  localStorage.clear();
  layout = split(initialLayout({ view: "page", path: "a.md" }), { view: "page", path: "b.md" });
  useWorkspace.setState(derive(layout));
});

/** Two panes 600 px wide each, with the divider between them. */
function setup() {
  const [left, right] = layout.panes;
  render(
    <div>
      <section data-testid="left" />
      <PaneDivider left={left!} right={right!} />
      <section data-testid="right" />
    </div>,
  );
  for (const id of ["left", "right"]) screen.getByTestId(id).getBoundingClientRect = () => ({ width: 600 }) as DOMRect;
  return screen.getByRole("separator", { name: "Resize the panes" });
}

const sizes = () => useWorkspace.getState().layout.panes.map((p) => Number((p.size ?? 1).toFixed(4)));

describe("the line between panes", () => {
  it("moves with the pointer and keeps the new widths when let go", () => {
    const line = setup();
    fireEvent.pointerDown(line, { button: 0, clientX: 600, pointerId: 1 });
    fireEvent.pointerMove(line, { clientX: 720, pointerId: 1 });
    // The panes follow at once; the layout is kept on letting go.
    expect(screen.getByTestId("left").style.flexGrow).toBe(String(0.6));
    expect(sizes()).toEqual([0.5, 0.5]);
    fireEvent.pointerUp(line, { clientX: 720, pointerId: 1 });
    expect(sizes()).toEqual([0.6, 0.4]);
  });

  it("stops each pane at its narrowest", () => {
    const line = setup();
    fireEvent.pointerDown(line, { button: 0, clientX: 600, pointerId: 1 });
    fireEvent.pointerMove(line, { clientX: 1300, pointerId: 1 });
    fireEvent.pointerUp(line, { clientX: 1300, pointerId: 1 });
    // 1,200 px in all, the right pane kept at 280.
    expect(sizes()).toEqual([Number((920 / 1200).toFixed(4)), Number((280 / 1200).toFixed(4))]);
  });

  it("steps with the arrow keys and evens out on a double-click", () => {
    const line = setup();
    fireEvent.keyDown(line, { key: "ArrowLeft", shiftKey: true });
    expect(sizes()).toEqual([Number((536 / 1200).toFixed(4)), Number((664 / 1200).toFixed(4))]);
    fireEvent.doubleClick(line);
    expect(sizes()).toEqual([0.5, 0.5]);
  });
});
