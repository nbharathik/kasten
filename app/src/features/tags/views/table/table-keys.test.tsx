import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWorkspace } from "../../../workspace/store";
import { NOTES, cellOf, headers, openTable, propsOf, taskYaml, titles } from "./testing";

afterEach(cleanup);

// Rows by title: Book flights, Plan budget, Write intro.
const open = () => openTable({ "tags/task.yaml": taskYaml("{name: Keys, type: table, columns: [status, summary, urgent]}"), ...NOTES });
const FLIGHTS = "library/flights.md";

/** The active cell as [row title, column name], or null. */
function active(grid: HTMLElement): [string, string] | null {
  const cell = grid.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!cell) return null;
  const row = cell.closest('[role="row"]')!;
  const cells = [...row.querySelectorAll('[role="gridcell"], [role="rowheader"]')];
  const title = row.querySelector(".kasten-table-title")?.textContent ?? "";
  return [title, headers(grid)[cells.indexOf(cell)]!];
}

/** Presses a key on the grid; true when the table left it to others. */
const press = (grid: HTMLElement, key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(grid, { key, ...init });

describe("the table from the keyboard", () => {
  it("moves the active cell with arrows, Home, End and Tab", async () => {
    const { grid } = await open();
    grid.focus();
    expect(active(grid)).toBeNull();
    press(grid, "ArrowDown");
    expect(active(grid)).toEqual(["Book flights", "Title"]);
    press(grid, "ArrowRight");
    press(grid, "ArrowRight");
    expect(active(grid)).toEqual(["Book flights", "summary"]);
    press(grid, "ArrowDown");
    expect(active(grid)).toEqual(["Plan budget", "summary"]);
    press(grid, "End");
    expect(active(grid)).toEqual(["Plan budget", "urgent"]);
    press(grid, "Home");
    expect(active(grid)).toEqual(["Plan budget", "Title"]);
    press(grid, "Tab", { shiftKey: true });
    expect(active(grid)).toEqual(["Book flights", "urgent"]);
    press(grid, "Tab");
    expect(active(grid)).toEqual(["Plan budget", "Title"]);
    press(grid, "ArrowUp");
    press(grid, "ArrowUp");
    expect(active(grid)).toEqual(["Book flights", "Title"]);
    // The grid points assistive technology at the active cell.
    expect(document.getElementById(grid.getAttribute("aria-activedescendant")!)?.textContent).toContain("Book flights");
    // Shift+Tab past the first cell leaves the grid the usual way; Tab past
    // the last goes on to the table's foot, not the header's buttons.
    expect(press(grid, "Tab", { shiftKey: true })).toBe(true);
    press(grid, "PageDown");
    press(grid, "End");
    expect(active(grid)).toEqual(["Write intro", "urgent"]);
    expect(press(grid, "Tab")).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "New row" }));
    // Escape lets go of the cell.
    grid.focus();
    expect(press(grid, "Escape")).toBe(false);
    expect(active(grid)).toBeNull();
  });

  it("edits with Enter or by typing; Escape leaves the value, Enter saves it", async () => {
    const { vault, grid } = await open();
    grid.focus();
    press(grid, "ArrowDown");
    press(grid, "ArrowRight");
    press(grid, "ArrowRight");
    press(grid, "Enter");
    const input = screen.getByRole("textbox", { name: "summary of Book flights" }) as HTMLInputElement;
    expect(input.value).toBe("Window seats");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Changed my mind" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement).toBe(grid);
    expect(within(grid).queryByRole("textbox")).toBeNull();
    expect(active(grid)).toEqual(["Book flights", "summary"]);

    // A character typed on a text cell starts editing with it.
    press(grid, "A");
    const typed = screen.getByRole("textbox", { name: "summary of Book flights" }) as HTMLInputElement;
    expect(typed.value).toBe("A");
    fireEvent.change(typed, { target: { value: "Aisle" } });
    await act(async () => fireEvent.keyDown(typed, { key: "Enter" }));
    await expect.poll(async () => (await propsOf(vault, FLIGHTS)).summary).toBe("Aisle");
    expect(document.activeElement).toBe(grid);
    expect(active(grid)).toEqual(["Book flights", "summary"]);
  });

  it("saves and moves on with Tab from an editor", async () => {
    const { vault, grid } = await open();
    grid.focus();
    press(grid, "ArrowDown");
    press(grid, "End");
    press(grid, "ArrowLeft");
    press(grid, "F2");
    const input = screen.getByRole("textbox", { name: "summary of Book flights" });
    fireEvent.change(input, { target: { value: "Tabbed" } });
    await act(async () => fireEvent.keyDown(input, { key: "Tab" }));
    await expect.poll(async () => (await propsOf(vault, FLIGHTS)).summary).toBe("Tabbed");
    expect(active(grid)).toEqual(["Book flights", "urgent"]);
    expect(document.activeElement).toBe(grid);
  });

  it("ticks with Space, opens options with Enter, clears with Backspace", async () => {
    const { vault, grid } = await open();
    grid.focus();
    press(grid, "ArrowDown");
    press(grid, "End");
    await act(async () => press(grid, " "));
    await expect.poll(async () => (await propsOf(vault, FLIGHTS)).urgent).toBe(true);

    press(grid, "Home");
    press(grid, "ArrowRight");
    press(grid, "Enter");
    const find = screen.getByRole("textbox", { name: "Find an option for status of Book flights" });
    expect(document.activeElement).toBe(find);
    fireEvent.keyDown(find, { key: "ArrowDown" });
    fireEvent.keyDown(find, { key: "ArrowDown" });
    await act(async () => fireEvent.keyDown(find, { key: "Enter" }));
    await expect.poll(async () => (await propsOf(vault, FLIGHTS)).status).toBe("Done");
    expect(document.activeElement).toBe(grid);

    await act(async () => press(grid, "Backspace"));
    await expect.poll(async () => (await propsOf(vault, FLIGHTS)).status).toBeUndefined();

    // Typing on a select finds an option.
    press(grid, "d");
    expect((screen.getByRole("textbox", { name: /Find an option/ }) as HTMLInputElement).value).toBe("d");
  });

  it("keeps the active cell on its note when an edit sorts it elsewhere", async () => {
    const view = "{name: Keys, type: table, columns: [status, summary], sort: [{key: status, dir: asc}]}";
    const { vault, grid } = await openTable({ "tags/task.yaml": taskYaml(view), ...NOTES });
    expect(titles(grid)).toEqual(["Book flights", "Write intro", "Plan budget"]);
    grid.focus();
    press(grid, "ArrowDown");
    press(grid, "ArrowRight");
    press(grid, "Enter");
    const find = screen.getByRole("textbox", { name: /Find an option/ });
    fireEvent.change(find, { target: { value: "done" } });
    await act(async () => fireEvent.keyDown(find, { key: "Enter" }));
    await expect.poll(() => titles(grid)).toEqual(["Write intro", "Book flights", "Plan budget"]);
    expect(active(grid)).toEqual(["Book flights", "status"]);
    // So keys act on the note edited, not the one that slid under its row.
    await act(async () => press(grid, "Backspace"));
    await expect.poll(async () => (await propsOf(vault, FLIGHTS)).status).toBeUndefined();
    expect((await propsOf(vault, "library/intro.md")).status).toBe("Doing");
  });

  it("gives the keys back to the grid when an edit takes the note out of the view", async () => {
    const ui = "---\ntitle: Polish UI\ntags: [task]\nprops:\n  labels: [ui]\n---\nU\n";
    const view = "{name: UI, type: table, filter: [{key: labels, op: is, value: ui}]}";
    const { grid } = await openTable({ "tags/task.yaml": taskYaml(view), ...NOTES, "library/ui.md": ui });
    expect(titles(grid)).toEqual(["Polish UI"]);
    fireEvent.click(cellOf(grid, "Polish UI", "labels"));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: /Find an option/ }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove ui" })));
    await expect.poll(() => titles(grid)).toEqual([]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(grid);
  });

  it("peeks at the note with Enter on its title, Ctrl+Enter opens a tab", async () => {
    const { grid } = await open();
    const openPath = vi.fn();
    const real = useWorkspace.getState().openPath;
    useWorkspace.setState({ openPath });
    try {
      grid.focus();
      press(grid, "ArrowDown");
      press(grid, "Enter");
      press(grid, "Enter", { ctrlKey: true });
      expect(openPath.mock.calls).toEqual([
        [FLIGHTS, "peek"],
        [FLIGHTS, "tab"],
      ]);
    } finally {
      useWorkspace.setState({ openPath: real });
    }
  });

  it("leaves keys with Ctrl, Cmd or Alt to the window's shortcuts", async () => {
    const { grid } = await open();
    grid.focus();
    press(grid, "ArrowDown");
    press(grid, "ArrowRight");
    // Not prevented: the window's shortcut handler still sees them.
    expect(press(grid, "k", { ctrlKey: true })).toBe(true);
    expect(press(grid, "n", { metaKey: true })).toBe(true);
    expect(press(grid, "ArrowLeft", { altKey: true })).toBe(true);
    expect(press(grid, "Tab", { ctrlKey: true })).toBe(true);
    expect(press(grid, "PageDown", { ctrlKey: true })).toBe(true);
    expect(active(grid)).toEqual(["Book flights", "status"]);
    // In an editor too.
    press(grid, "Enter");
    expect(fireEvent.keyDown(screen.getByRole("textbox", { name: /Find an option/ }), { key: "k", ctrlKey: true })).toBe(true);
  });
});
