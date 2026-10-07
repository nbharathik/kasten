// Helpers for the Calendar's flow tests: a seeded preview vault in the
// whole window, days by name, and a DataTransfer for jsdom (which has none).

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";

import { dayFrom, longDay } from "../../lib/dates";
import { AppShell } from "../../shell/AppShell";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { monthGrid, monthTitle } from "./dates";

// fixtures/dev-vault/tags/task.yaml and travel.yaml
export const TASK_YAML = [
  "name: task",
  "color: green",
  "properties:",
  "  - {key: status, type: select, options: [Todo, Doing, Done]}",
  "  - {key: due, type: date}",
  "  - {key: priority, type: select, options: [Low, Medium, High]}",
  "views:",
  "  - {name: Board, type: kanban, group_by: status}",
  "  - {name: Due, type: calendar, date: due}",
  "",
].join("\n");

export const TRAVEL_YAML = [
  "name: travel",
  "color: teal",
  "properties:",
  "  - {key: status, type: select, options: [Idea, Planning, Booked, Done]}",
  "  - {key: start, type: date}",
  "  - {key: end, type: date}",
  "  - {key: budget, type: number}",
  "",
].join("\n");

export const today = dayFrom(0);

/** This month's grid as the Calendar draws it: six weeks from Monday. */
export const shownGrid = () => monthGrid(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1);

/** Opens the whole window on `seed` and goes to the Calendar, once its tag
 * schemas and to-dos are in. */
export async function openCalendar(seed: Record<string, string>): Promise<MemoryVault> {
  const vault = new MemoryVault(seed);
  render(<AppShell connect={async () => ({ client: vault })} />);
  const sidebar = await screen.findByRole("navigation", { name: "Sidebar" });
  fireEvent.click(within(sidebar).getByRole("button", { name: "Calendar" }));
  // The first test in a file also waits for the view's code to load, which
  // takes a while on a busy machine.
  await screen.findByRole("heading", { level: 1, name: monthTitle(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1) }, { timeout: 8000 });
  await waitFor(() => expect(document.querySelector('.kasten-cal[aria-busy="false"]')).toBeTruthy(), { timeout: 5000 });
  return vault;
}

/** A day's cell (month) or column (week). */
export const cell = (day: string) => screen.getByRole("group", { name: longDay(day) });

/** A DataTransfer for jsdom. */
export function transfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "all",
    dropEffect: "none",
    get types() {
      return [...data.keys()];
    },
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    clearData: () => data.clear(),
    setDragImage: () => {},
  };
}
