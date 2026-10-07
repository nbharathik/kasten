// A board's field that goes away while written in keeps what it holds.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LineEditor, StickyEditor } from "./editors";

afterEach(cleanup);

describe("writing on the board", () => {
  it("saves a sticky's text when the field goes away before it was left", () => {
    const onDone = vi.fn();
    const view = render(<StickyEditor text="Idea" onDone={onDone} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Sticky text" }), { target: { value: "Idea, grown" } });
    view.unmount();
    expect(onDone).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledWith("Idea, grown");
  });

  it("saves a label once, whether left or taken away", () => {
    const onDone = vi.fn();
    const view = render(<LineEditor text="Plan" label="Section label" onDone={onDone} />);
    const field = screen.getByRole("textbox", { name: "Section label" });
    fireEvent.change(field, { target: { value: "Plan B" } });
    fireEvent.blur(field);
    view.unmount();
    expect(onDone.mock.calls).toEqual([["Plan B"]]);
  });

  it("saves nothing for a field left as it was", () => {
    const onDone = vi.fn();
    render(<StickyEditor text="Idea" onDone={onDone} />).unmount();
    expect(onDone).not.toHaveBeenCalled();
  });
});
