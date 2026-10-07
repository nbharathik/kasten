import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { longDay } from "../../lib/dates";
import { useShell } from "../../lib/store";
import type { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { derive } from "../workspace/store-layout";
import { initialLayout } from "../workspace/tabs";
import { addDays, weekOf } from "./dates";
import { rangeLabel } from "./layout";
import { cell, openCalendar, shownGrid, TASK_YAML, today, transfer, TRAVEL_YAML } from "./test-kit";

const TRIP = "library/seaside.md";
const ID = `${TRIP}#start..end`;

const trip = (start: string, end: string, title = "Seaside trip") => `---\ntitle: ${title}\nicon: ✈️\ntags: [travel]\nprops:\n  status: Booked\n  start: ${start}\n  end: ${end}\n---\nPastéis de nata.\n`;

const seed = (start: string, end: string, extra: Record<string, string> = {}) => ({ "tags/task.yaml": TASK_YAML, "tags/travel.yaml": TRAVEL_YAML, [TRIP]: trip(start, end), ...extra });

/** Every piece of the trip's bar (one per week it touches). */
const bars = (id = ID) => [...document.querySelectorAll<HTMLElement>(".kasten-cal-bar")].filter((el) => el.dataset.chip === id);
const lit = () => [...document.querySelectorAll<HTMLElement>("[data-day].is-over")].map((el) => el.dataset.day);

let vault: MemoryVault;
const text = async () => (await vault.read(TRIP)).text;
const props = async () => (await vault.read(TRIP)).meta.props;
/** A message as Testing Library reads the page: the thin spaces a range's
 * dash comes with are plain spaces there. */
const said = (message: string) => message.replace(/\s+/g, " ");

beforeEach(() => {
  localStorage.clear();
  useWorkspace.setState({ client: null, ready: false, notes: [], ...derive(initialLayout()), stack: [], stackOpen: false, recent: [], toasts: [] });
  useShell.setState({ sidebarOpen: true, focusMode: false, paletteOpen: false, shortcutsOpen: false, panels: [], sourceOpen: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Calendar ranges", () => {
  it("shows a trip as one bar across its days, in the month and in the week's band", async () => {
    const week = weekOf(today);
    vault = await openCalendar(seed(week[1]!, week[3]!, { "library/ship.md": `---\ntitle: Ship\ntags: [task]\nprops:\n  due: ${week[2]}\n---\n` }));
    const [bar, ...more] = bars();
    expect(more).toHaveLength(0);
    expect(bar!.className).toContain("is-start");
    expect(bar!.className).toContain("is-end");
    expect(bar!.getAttribute("aria-label")).toBe(`Seaside trip, ${rangeLabel(week[1]!, week[3]!, today)}`);
    // Not two chips on its first and last day.
    expect(within(cell(week[1]!)).queryByRole("button", { name: /Seaside/ })).toBeNull();
    expect(within(cell(week[3]!)).queryByRole("button", { name: /Seaside/ })).toBeNull();
    // The days under it leave it a line; a day beside it does not.
    expect(cell(week[2]!).querySelector(".kasten-cal-lanes")).toBeTruthy();
    expect(within(cell(week[2]!)).getByRole("button", { name: "Ship" })).toBeTruthy();
    expect(cell(week[5]!).querySelector(".kasten-cal-lanes")).toBeNull();
    expect(screen.getByText("2 dated notes")).toBeTruthy();

    fireEvent.keyDown(window, { key: "w" });
    const [band] = bars();
    expect(bars()).toHaveLength(1);
    expect(band!.style.getPropertyValue("--from")).toBe("1");
    expect(band!.style.getPropertyValue("--span")).toBe("3");
    expect(cell(week[0]!).querySelector(".kasten-cal-col-band")).toBeTruthy();
  });

  it("folds a crowded week's band into four lines, and opens it on request", async () => {
    const week = weekOf(today);
    const [start, end] = [week[1]!, week[3]!];
    const others = Object.fromEntries(["Valley", "Lake", "Forest", "Meadow"].map((name) => [`library/${name.toLowerCase()}.md`, trip(start, end, `${name} trip`)]));
    vault = await openCalendar(seed(start, end, others));
    fireEvent.keyDown(window, { key: "w" });
    // Three lanes and a line for "+2 more" under them, on each day they cover.
    expect(document.querySelectorAll(".kasten-cal-bar")).toHaveLength(3);
    const more = within(cell(start)).getByRole("button", { name: `2 more over ${longDay(start)}` });
    expect(more.textContent).toBe("+2 more");
    expect(within(cell(end)).getByRole("button", { name: /^2 more over/ })).toBeTruthy();
    expect(within(cell(week[4]!)).queryByRole("button", { name: /more over/ })).toBeNull();
    fireEvent.click(more);
    expect(document.querySelectorAll(".kasten-cal-bar")).toHaveLength(5);
    // One way back, under the first day that folds.
    expect(screen.getAllByRole("button", { name: "Show fewer" })).toHaveLength(1);
    fireEvent.click(within(cell(start)).getByRole("button", { name: "Show fewer" }));
    expect(document.querySelectorAll(".kasten-cal-bar")).toHaveLength(3);
  });

  it("breaks a trip over two weeks into two bars, open where it runs on", async () => {
    const grid = shownGrid();
    vault = await openCalendar(seed(grid[0]![5]!, grid[1]![1]!));
    const [before, after] = bars();
    expect(bars()).toHaveLength(2);
    expect(before!.className).toContain("is-start");
    expect(before!.className).not.toContain("is-end");
    expect(after!.className).not.toContain("is-start");
    expect(after!.className).toContain("is-end");
    expect(after!.style.getPropertyValue("--from")).toBe("0");
  });

  it("drags a trip to other days: both dates in one write, and Undo puts both back", async () => {
    const grid = shownGrid();
    const [start, end] = [grid[1]![1]!, grid[1]![3]!];
    vault = await openCalendar(seed(start, end));
    const write = vi.spyOn(vault, "updateProps");
    const data = transfer();
    // Held by its first day and dropped eight days later.
    fireEvent.dragStart(bars()[0]!, { dataTransfer: data });
    const target = grid[2]![2]!;
    fireEvent.dragEnter(cell(target), { dataTransfer: data });
    fireEvent.dragOver(cell(target), { dataTransfer: data });
    expect(lit()).toEqual([target, addDays(target, 1), addDays(target, 2)]);
    await act(async () => fireEvent.drop(cell(target), { dataTransfer: data }));
    expect(lit()).toEqual([]);
    expect(bars()[0]!.getAttribute("aria-label")).toBe(`Seaside trip, ${rangeLabel(target, addDays(target, 2), today)}`);
    await expect.poll(text).toContain(`  start: ${target}\n  end: ${addDays(target, 2)}\n`);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(TRIP, { start: target, end: addDays(target, 2) });
    // Only the dates changed.
    expect(await text()).toContain("  status: Booked\n");
    expect(await text()).toContain("---\nPastéis de nata.\n");
    expect(await screen.findByText(said(`Moved “Seaside trip” to ${rangeLabel(target, addDays(target, 2), today)}`))).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    await expect.poll(text).toContain(`  start: ${start}\n  end: ${end}\n`);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(TRIP, { start, end });
    expect(await screen.findByText(said(`Moved “Seaside trip” back to ${rangeLabel(start, end, today)}`))).toBeTruthy();
    expect(bars()[0]!.getAttribute("aria-label")).toBe(`Seaside trip, ${rangeLabel(start, end, today)}`);
  });

  it("drags a trip's right edge to change only its end, never before its start", async () => {
    const grid = shownGrid();
    const [start, end] = [grid[1]![1]!, grid[1]![3]!];
    vault = await openCalendar(seed(start, `${end}T18:30`));
    const write = vi.spyOn(vault, "updateProps");
    const stretch = async (day: string) => {
      const data = transfer();
      fireEvent.dragStart(bars().at(-1)!.querySelector(".kasten-cal-bar-end")!, { dataTransfer: data });
      fireEvent.dragOver(cell(day), { dataTransfer: data });
      const shown = lit();
      await act(async () => fireEvent.drop(cell(day), { dataTransfer: data }));
      return shown;
    };
    const later = grid[2]![0]!;
    expect(await stretch(later)).toEqual([start, addDays(start, 1), addDays(start, 2), addDays(start, 3), addDays(start, 4), addDays(start, 5), later]);
    // The time after the date stays; the start is not written at all.
    await expect.poll(props).toMatchObject({ start, end: `${later}T18:30` });
    expect(write).toHaveBeenLastCalledWith(TRIP, { end: `${later}T18:30` });
    expect(await text()).toContain(`  start: ${start}\n`);
    expect(await screen.findByText(said(`“Seaside trip” now runs ${rangeLabel(start, later, today)}`))).toBeTruthy();
    // Across the week break it is two bars now.
    expect(bars()).toHaveLength(2);

    // Before its start, the end stops at the start: a one-day trip.
    expect(await stretch(grid[0]![6]!)).toEqual([start]);
    await expect.poll(props).toMatchObject({ start, end: `${start}T18:30` });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("moves a focused trip with Alt+arrows and its end with Alt+Shift+arrows, in one write", async () => {
    const grid = shownGrid();
    const [start, end] = [grid[2]![1]!, grid[2]![3]!];
    vault = await openCalendar(seed(start, end));
    const write = vi.spyOn(vault, "updateProps");
    bars()[0]!.focus();
    await act(async () => {
      fireEvent.keyDown(bars()[0]!, { key: "ArrowRight", altKey: true });
    });
    expect(bars()[0]!.getAttribute("aria-label")).toBe(`Seaside trip, ${rangeLabel(addDays(start, 1), addDays(end, 1), today)}`);
    expect(document.activeElement).toBe(bars()[0]);
    await act(async () => {
      fireEvent.keyDown(bars()[0]!, { key: "ArrowRight", altKey: true, shiftKey: true });
    });
    await act(async () => {
      fireEvent.keyDown(bars()[0]!, { key: "ArrowDown", altKey: true });
    });
    // Up a week and back is where it was: a day later, a day longer.
    await act(async () => {
      fireEvent.keyDown(bars()[0]!, { key: "ArrowUp", altKey: true });
    });
    expect(useWorkspace.getState().place.view).toBe("calendar");
    await expect.poll(text, { timeout: 3000 }).toContain(`  start: ${addDays(start, 1)}\n  end: ${addDays(end, 2)}\n`);
    expect(write).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Undo" })));
    await expect.poll(text).toContain(`  start: ${start}\n  end: ${end}\n`);
  });

  it("counts bars that do not fit in “+N more” and lists them there", async () => {
    const grid = shownGrid();
    const [start, end] = [grid[1]![1]!, grid[1]![2]!];
    const others = Object.fromEntries(["Valley", "Lake", "Forest"].map((name) => [`library/${name.toLowerCase()}.md`, trip(start, end, `${name} trip`)]));
    vault = await openCalendar(seed(start, end, others));
    // Three lines a cell: two lanes, and "+2 more" for the two below.
    expect(document.querySelectorAll(".kasten-cal-bar")).toHaveLength(2);
    const more = within(cell(start)).getByRole("button", { name: /^2 more on/ });
    expect(within(cell(end)).getByRole("button", { name: /^2 more on/ })).toBeTruthy();
    fireEvent.click(more);
    const popover = screen.getByRole("dialog");
    const listed = within(popover).getAllByRole("button", { name: /trip,/ });
    expect(listed.map((b) => b.getAttribute("aria-label")!.split(",")[0])).toEqual(["Forest trip", "Lake trip", "Seaside trip", "Valley trip"]);
    // Dragged out of the list, a trip moves as if held by that day.
    const write = vi.spyOn(vault, "updateProps");
    const data = transfer();
    fireEvent.dragStart(listed[2]!, { dataTransfer: data });
    await act(async () => fireEvent.drop(cell(addDays(start, 7)), { dataTransfer: data }));
    await expect.poll(props).toMatchObject({ start: addDays(start, 7), end: addDays(end, 7) });
    expect(write).toHaveBeenCalledWith(TRIP, { start: addDays(start, 7), end: addDays(end, 7) });
  });
});
