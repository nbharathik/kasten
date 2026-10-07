// The table at 2,000 notes: only the rows in view are drawn, and an edit or
// a scroll redraws only the rows it touches. Cell renders are counted
// through the module every row draws its cells with.

import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CellProps } from "./Cell";
import { ROW_HEIGHT } from "./context";
import { cellOf, openTable, propsOf, taskYaml, titles } from "./testing";

const counter = vi.hoisted(() => ({ cells: 0 }));

vi.mock("./Cell", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./Cell")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    Cell: (props: CellProps) => {
      counter.cells++;
      return createElement(actual.Cell, props);
    },
  };
});

afterEach(cleanup);

const COLUMNS = 5;
const STATUSES = ["Todo", "Doing", "Done"];

/** A `task` tag with `n` notes, "Task 0" to "Task n-1" (sorted by title, numbers in order). */
function bigTag(n: number): Record<string, string> {
  const files: Record<string, string> = { "tags/task.yaml": taskYaml("{name: All, type: table, columns: [status, due, points, summary]}") };
  for (let i = 0; i < n; i++) {
    files[`library/t${String(i).padStart(4, "0")}.md`] = `---\ntitle: Task ${i}\ntags: [task]\nprops:\n  status: ${STATUSES[i % 3]}\n  points: ${i % 13}\n---\nBody ${i}\n`;
  }
  return files;
}

/** Makes jsdom report a 360px tall view scrolled to `top`, as a browser would. */
function scrollTo(grid: HTMLElement, top: number) {
  Object.defineProperty(grid, "clientHeight", { configurable: true, value: 360 });
  Object.defineProperty(grid, "scrollTop", { configurable: true, value: top });
  fireEvent.scroll(grid);
}

describe("a table of 2,000 notes", () => {
  it("draws only a window of rows, keeping the full height", async () => {
    const started = performance.now();
    const { grid } = await openTable(bigTag(2000));
    const opened = performance.now() - started;
    const rows = within(grid).getAllByRole("row").length - 1;
    expect(grid.getAttribute("aria-rowcount")).toBe("2001");
    expect(rows).toBeGreaterThan(10);
    expect(rows).toBeLessThan(60);
    const body = grid.querySelector<HTMLElement>(".kasten-table-body")!;
    expect(parseFloat(body.style.paddingTop) + rows * ROW_HEIGHT + parseFloat(body.style.paddingBottom)).toBe(2000 * ROW_HEIGHT);
    // jsdom is slow; a real window is many times quicker.
    expect(opened).toBeLessThan(20_000);
  });

  it("redraws only the edited row when a cell changes", async () => {
    const { vault, grid } = await openTable(bigTag(2000));
    counter.cells = 0;
    const started = performance.now();
    fireEvent.click(cellOf(grid, "Task 1", "status"));
    await act(async () => fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Done" })));
    await expect.poll(async () => (await propsOf(vault, "library/t0001.md")).status).toBe("Done");
    const took = performance.now() - started;
    // Opening the editor, closing it and taking in the saved note redraw
    // that one row three times; redrawing every row drawn would be hundreds.
    expect(counter.cells).toBeLessThanOrEqual(COLUMNS * 4);
    expect(took).toBeLessThan(10_000);
    expect(cellOf(grid, "Task 1", "status").textContent).toBe("Done");
  });

  it("comes back to where the table was scrolled", async () => {
    // jsdom keeps no scroll offsets; these keep what is set.
    const kept = new WeakMap<Element, number>();
    const real = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get() {
        return kept.get(this) ?? 0;
      },
      set(value: number) {
        kept.set(this, value);
      },
    });
    try {
      const first = await openTable(bigTag(300));
      first.grid.scrollTop = ROW_HEIGHT * 200;
      fireEvent.scroll(first.grid);
      cleanup();
      const again = await openTable(bigTag(300));
      expect(again.grid.scrollTop).toBe(ROW_HEIGHT * 200);
      expect(titles(again.grid)).toContain("Task 200");
    } finally {
      Object.defineProperty(Element.prototype, "scrollTop", real);
    }
  });

  it("draws the rows scrolled to, and only those newly in view", async () => {
    const { grid } = await openTable(bigTag(2000));
    scrollTo(grid, ROW_HEIGHT * 1000);
    await act(async () => {});
    expect(titles(grid)).toContain("Task 1000");
    expect(titles(grid)).not.toContain("Task 0");
    counter.cells = 0;
    scrollTo(grid, ROW_HEIGHT * 1010);
    await act(async () => {});
    expect(titles(grid)).toContain("Task 1010");
    // Ten rows came into view; the rows still in view were not redrawn.
    expect(counter.cells).toBeLessThanOrEqual(10 * COLUMNS);
  });
});
