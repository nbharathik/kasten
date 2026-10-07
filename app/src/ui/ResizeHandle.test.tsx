import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BIG_STEP, ResizeHandle, STEP } from "./ResizeHandle";

afterEach(cleanup);

function Panel({ edge, onCommit }: { edge: "left" | "right"; onCommit: (width: number) => void }) {
  const [width, setWidth] = useState(240);
  return (
    <div style={{ width }} data-testid="panel">
      <ResizeHandle label="Resize the panel" edge={edge} width={width} min={200} max={440} initial={240} onChange={setWidth} onCommit={onCommit} />
    </div>
  );
}

const handle = () => screen.getByRole("separator", { name: "Resize the panel" });
const width = () => Number(handle().getAttribute("aria-valuenow"));

describe("ResizeHandle", () => {
  it("follows a drag within its limits, and keeps the width when the pointer lets go", () => {
    const onCommit = vi.fn();
    render(<Panel edge="right" onCommit={onCommit} />);
    fireEvent.pointerDown(handle(), { button: 0, clientX: 240, pointerId: 1 });
    expect(document.body.classList.contains("kasten-resizing")).toBe(true);
    fireEvent.pointerMove(handle(), { clientX: 300, pointerId: 1 });
    expect(width()).toBe(300);
    expect(screen.getByTestId("panel").style.width).toBe("300px");
    fireEvent.pointerMove(handle(), { clientX: 900, pointerId: 1 });
    expect(width()).toBe(440);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle(), { clientX: 900, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith(440);
    expect(document.body.classList.contains("kasten-resizing")).toBe(false);
    // A move with no drag going on changes nothing.
    fireEvent.pointerMove(handle(), { clientX: 100, pointerId: 1 });
    expect(width()).toBe(440);
  });

  it("widens a panel on its left edge as the pointer moves left", () => {
    render(<Panel edge="left" onCommit={() => {}} />);
    fireEvent.pointerDown(handle(), { button: 0, clientX: 800, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 750, pointerId: 1 });
    expect(width()).toBe(290);
    fireEvent.pointerUp(handle(), { pointerId: 1 });
  });

  it("steps with the arrow keys, jumps with Home and End, and resets on a double-click", () => {
    const onCommit = vi.fn();
    render(<Panel edge="right" onCommit={onCommit} />);
    fireEvent.keyDown(handle(), { key: "ArrowRight" });
    expect(width()).toBe(240 + STEP);
    // A big step back would go below the minimum, which holds.
    fireEvent.keyDown(handle(), { key: "ArrowLeft", shiftKey: true });
    expect(240 + STEP - BIG_STEP).toBeLessThan(200);
    expect(width()).toBe(200);
    fireEvent.keyDown(handle(), { key: "Home" });
    expect(width()).toBe(200);
    fireEvent.keyDown(handle(), { key: "End" });
    expect(width()).toBe(440);
    fireEvent.doubleClick(handle());
    expect(width()).toBe(240);
    expect(onCommit.mock.calls.map(([w]) => w)).toEqual([256, 200, 200, 440, 240]);
  });
});
