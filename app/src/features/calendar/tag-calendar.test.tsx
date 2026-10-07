// A tag database's calendar shows the notes its view shows, in a month or a
// week of its own, whatever the main calendar was last left on.

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { useTags } from "../tags/store";
import { TagDatabase } from "../tags/TagDatabase";
import { cell, shownGrid, today } from "./test-kit";

const TASK = [
  "name: task",
  "properties:",
  "  - {key: status, type: select, options: [Todo, Done]}",
  "  - {key: due, type: date}",
  "views:",
  "  - {name: Open, type: calendar, date: due, filter: [{key: status, op: is_not, value: Done}]}",
  "",
].join("\n");

const task = (title: string, status: string, due: string) => `---\ntitle: ${title}\ntags: [task]\nprops:\n  status: ${status}\n  due: ${due}\n---\n`;

async function open(savedMode: string) {
  localStorage.clear();
  localStorage.setItem("kasten.calendar", savedMode);
  const vault = new MemoryVault({
    "tags/task.yaml": TASK,
    "library/ship.md": task("Ship", "Todo", today),
    "library/filed.md": task("Filed", "Done", today),
  });
  useTags.setState({ schemas: null });
  useWorkspace.setState({ place: { view: "tags", path: "#task" }, toasts: [] });
  await useWorkspace.getState().connect({ client: vault });
  render(<TagDatabase tag="task" />);
  await waitFor(() => expect(document.querySelector('.kasten-cal[aria-busy="false"]')).toBeTruthy(), { timeout: 8000 });
  await act(async () => {});
}

afterEach(cleanup);

describe("a tag database's calendar", () => {
  it("shows only the notes its view's filters let through", async () => {
    await open("month");
    await waitFor(() => expect(within(cell(today)).getByRole("button", { name: "Ship" })).toBeTruthy());
    expect(within(cell(today)).queryByRole("button", { name: "Filed" })).toBeNull();
  });

  it("shows a month when the main calendar was left on its agenda", async () => {
    await open("agenda");
    await waitFor(() => expect(within(cell(today)).getByRole("button", { name: "Ship" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Month" }).getAttribute("aria-pressed")).toBe("true");
    // The whole six-week grid, into next month, not this month's days alone.
    const grid = shownGrid();
    expect(cell(grid.at(-1)!.at(-1)!)).toBeTruthy();
    expect(cell(grid[0]![0]!)).toBeTruthy();
  });
});
