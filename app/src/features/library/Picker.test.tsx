// The bulk bar's picker names the row the arrow keys are on, so a screen
// reader reads it out as the choice moves.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Picker } from "./Picker";

afterEach(cleanup);

describe("the picker", () => {
  it("points its field at the chosen row as the arrows move", () => {
    const within = { current: document.body };
    const onPick = vi.fn();
    const options = [
      { key: "a", label: "Alpha" },
      { key: "b", label: "Bravo" },
    ];
    render(<Picker label="Add tag" placeholder="Find a tag…" options={options} onPick={onPick} within={within} onClose={() => {}} />);
    const field = screen.getByRole("textbox", { name: "Add tag" });
    const chosen = () => document.getElementById(field.getAttribute("aria-activedescendant") ?? "");
    expect(document.getElementById(field.getAttribute("aria-controls")!)?.getAttribute("role")).toBe("listbox");
    expect(chosen()?.textContent).toContain("Alpha");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(chosen()?.textContent).toContain("Bravo");
    expect(chosen()?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith("b");
    fireEvent.change(field, { target: { value: "zulu" } });
    expect(field.hasAttribute("aria-activedescendant")).toBe(false);
  });
});
