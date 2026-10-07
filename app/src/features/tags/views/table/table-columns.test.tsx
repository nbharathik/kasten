import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NOTES, count, headers, openTable, savedView, taskYaml, titles } from "./testing";

afterEach(cleanup);

const open = (view?: string) => openTable({ "tags/task.yaml": taskYaml(view), ...NOTES });

/** Opens a column's menu from its header. */
function columnMenu(name: string) {
  const header = screen.getAllByRole("columnheader").find((h) => h.querySelector(".kasten-table-th-label")?.textContent === name)!;
  fireEvent.click(within(header).getByRole("button"));
  return screen.getByRole("menu", { name: `${name} column` });
}

describe("table columns", () => {
  it("shows the title, then every property of the tag in order, and counts the notes", async () => {
    const { grid } = await open();
    expect(headers(grid)).toEqual(["Title", "status", "due", "points", "urgent", "summary", "link", "labels", "blocks"]);
    expect(titles(grid).sort()).toEqual(["Book flights", "Plan budget", "Write intro"]);
    expect(grid.getAttribute("aria-rowcount")).toBe("4");
    expect(count()).toBe("3 notes");
  });

  it("shows the view's columns in their order, skipping keys the tag lacks", async () => {
    const { grid } = await open("{name: All, type: table, columns: [points, nope, status, updated]}");
    expect(headers(grid)).toEqual(["Title", "points", "status", "Updated"]);
  });

  it("hides, moves and shows columns, saving the view in the tag's YAML", async () => {
    const { vault, grid } = await open("{name: All, type: table, columns: [status, due, points], sort: [{key: points, dir: desc}]}");
    const due = columnMenu("due");
    await act(async () => fireEvent.click(within(due).getByRole("menuitem", { name: /Hide/ })));
    await expect.poll(async () => (await savedView(vault)).columns).toEqual(["status", "points"]);
    expect(headers(grid)).toEqual(["Title", "status", "points"]);
    // The rest of the view is kept.
    expect((await savedView(vault)).sort).toEqual([{ key: "points", dir: "desc" }]);

    const status = columnMenu("status");
    await act(async () => fireEvent.click(within(status).getByRole("menuitem", { name: "Move right" })));
    await expect.poll(async () => (await savedView(vault)).columns).toEqual(["points", "status"]);
    expect(within(columnMenu("points")).getByRole("menuitem", { name: "Move left" }).hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "Show a property" }));
    const plus = screen.getByRole("menu", { name: "Show a property" });
    expect(within(plus).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["due", "urgent", "summary", "link", "labels", "blocks", "Created", "Updated", "Edited"]);
    await act(async () => fireEvent.click(within(plus).getByRole("menuitem", { name: "due" })));
    await expect.poll(async () => (await savedView(vault)).columns).toEqual(["points", "status", "due"]);
    expect(headers(grid)).toEqual(["Title", "points", "status", "due"]);
    // Keys go back to the "+" button.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show a property" }));
  });

  it("sorts by a column from its header, replacing the view's sorts", async () => {
    const { vault, grid } = await open("{name: All, type: table, sort: [{key: status, dir: asc}]}");
    expect(titles(grid)).toEqual(["Book flights", "Write intro", "Plan budget"]);
    const points = columnMenu("points");
    await act(async () => fireEvent.click(within(points).getByRole("menuitem", { name: "Sort ascending" })));
    await expect.poll(async () => (await savedView(vault)).sort).toEqual([{ key: "points", dir: "asc" }]);
    // Points 3, then 5, then none (empty values last).
    expect(titles(grid)).toEqual(["Write intro", "Book flights", "Plan budget"]);
    expect(screen.getAllByRole("columnheader")[3]!.getAttribute("aria-sort")).toBe("ascending");
    const again = columnMenu("points");
    await act(async () => fireEvent.click(within(again).getByRole("menuitem", { name: "Sort descending" })));
    await expect.poll(() => titles(grid)).toEqual(["Book flights", "Write intro", "Plan budget"]);
    expect(screen.getAllByRole("columnheader")[3]!.getAttribute("aria-sort")).toBe("descending");
    const title = columnMenu("Title");
    await act(async () => fireEvent.click(within(title).getByRole("menuitem", { name: "Sort ascending" })));
    await expect.poll(() => titles(grid)).toEqual(["Book flights", "Plan budget", "Write intro"]);
    // The title can be sorted, but not hidden or moved.
    expect(within(columnMenu("Title")).queryByRole("menuitem", { name: /Hide/ })).toBeNull();
  });

  it("resizes a column by dragging its edge, saving the width once", async () => {
    const { vault, grid } = await open("{name: All, type: table, columns: [status, due]}");
    const save = vi.spyOn(vault, "setTagViews");
    const edge = screen.getByRole("separator", { name: "Width of status" });
    const before = Number(edge.getAttribute("aria-valuenow"));
    fireEvent.pointerDown(edge, { button: 0, clientX: 400 });
    for (const x of [410, 430, 460]) fireEvent.pointerMove(window, { clientX: x });
    await act(() => new Promise((done) => requestAnimationFrame(() => done(undefined))));
    // While dragging, only the grid's column template changes, once a frame.
    expect(grid.style.getPropertyValue("--kasten-table-cols")).toContain(`${before + 60}px`);
    expect(save).not.toHaveBeenCalled();
    await act(async () => fireEvent.pointerUp(window, { clientX: 460 }));
    await expect.poll(async () => (await savedView(vault)).widths).toEqual({ status: before + 60 });
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("separator", { name: "Width of status" }).getAttribute("aria-valuenow")).toBe(String(before + 60));
  });

  it("widens a column from the keyboard, saving after a pause", async () => {
    const { vault } = await open("{name: All, type: table, columns: [status], widths: {status: 200}}");
    const edge = screen.getByRole("separator", { name: "Width of status" });
    fireEvent.keyDown(edge, { key: "ArrowRight" });
    fireEvent.keyDown(edge, { key: "ArrowRight", shiftKey: true });
    await expect.poll(async () => (await savedView(vault)).widths, { timeout: 2000 }).toEqual({ status: 260 });
  });

  it("saves the widths of two columns widened from the keyboard one after another", async () => {
    const { vault } = await open("{name: All, type: table, columns: [status, due], widths: {status: 200, due: 150}}");
    fireEvent.keyDown(screen.getByRole("separator", { name: "Width of status" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("separator", { name: "Width of due" }), { key: "ArrowLeft" });
    await expect.poll(async () => (await savedView(vault)).widths, { timeout: 2000 }).toEqual({ status: 210, due: 140 });
  });

  it("says when a tag has no notes, or none pass the view's filters", async () => {
    const { grid } = await openTable({ "tags/task.yaml": taskYaml() });
    expect(within(grid).getByText(/No notes carry this tag yet/)).toBeTruthy();
    expect(count()).toBe("0 notes");
    cleanup();
    const filtered = await open("{name: All, type: table, filter: [{key: status, op: is, value: Blocked}]}");
    expect(within(filtered.grid).getByText(/No notes match this view’s filters/)).toBeTruthy();
  });
});
