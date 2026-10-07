import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryVault } from "../../../workspace/preview/memory-vault";
import { Toasts } from "../../../workspace/overlays/Toasts";
import { useWorkspace } from "../../../workspace/store";
import { useTags } from "../../store";
import { TagDatabase } from "../../TagDatabase";
import { KEY_PAUSE } from "./use-moves";

const TASK = [
  "name: task",
  "color: green",
  "properties:",
  "  - {key: status, type: select, options: [Todo, Doing, Done]}",
  "  - {key: due, type: date}",
  "  - {key: priority, type: select, options: [Low, Medium, High]}",
  "views:",
  "  - {name: Board, type: kanban, group_by: status}",
  "  - {name: All, type: table}",
  "",
].join("\n");

const note = (title: string, props: string, body = `${title}.`) => `---\ntitle: ${title}\ntags: [task]\n${props ? `props:\n${props}` : ""}---\n${body}\n`;

const SEED = {
  "tags/task.yaml": TASK,
  "tags/meeting.yaml": "name: meeting\nproperties:\n  - {key: date, type: date}\n  - {key: attendees, type: multi_select}\nviews:\n  - {name: Board, type: kanban}\n",
  "library/intro.md": note("Write intro", "  status: Doing\n  due: 2026-10-02\n  priority: High\n", "A first draft of the introduction."),
  "library/flights.md": note("Book flights", "  status: Todo\n"),
  "library/budget.md": note("Plan budget", "  status: Done\n"),
  "library/loose.md": note("Loose end", ""),
  "library/stuck.md": note("Stuck thing", "  status: Blocked\n"),
};

let vault: MemoryVault;
const text = async (path: string) => (await vault.read(path)).text;
const board = () => screen.getByRole("button", { name: "Write intro" }).closest<HTMLElement>(".kasten-kanban")!;
const column = (label: string) => within(board()).getByRole("region", { name: label });
const titlesIn = (label: string) => [...column(label).querySelectorAll("[data-card]")].map((card) => card.getAttribute("aria-label"));
const card = (title: string) => screen.getByRole("button", { name: title });
const columnOf = (el: Element | null) => el?.closest("[data-column]")?.getAttribute("aria-label");

/** Presses a card, carries it over `over` (a few pixels on) and lets go there. */
async function drag(from: HTMLElement, over: HTMLElement, check?: () => void) {
  fireEvent.pointerDown(from, { button: 0, buttons: 1, pointerId: 7, clientX: 20, clientY: 20 });
  fireEvent.pointerMove(over, { buttons: 1, pointerId: 7, clientX: 60, clientY: 90 });
  check?.();
  await act(async () => fireEvent.pointerUp(over, { button: 0, pointerId: 7, clientX: 60, clientY: 90 }));
}

async function open(tag = "task") {
  vault = new MemoryVault(SEED);
  useWorkspace.setState({ place: { view: "tags" }, toasts: [] });
  await useWorkspace.getState().connect({ client: vault });
  await useTags.getState().load();
  render(
    <>
      <TagDatabase tag={tag} />
      <Toasts />
    </>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  localStorage.clear();
  useTags.setState({ schemas: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Kanban board", () => {
  it("shows a column per option with its count, notes without one first and odd values last", async () => {
    await open();
    const columns = within(board()).getAllByRole("region");
    expect(columns.map((c) => c.getAttribute("aria-label"))).toEqual(["No status", "Todo", "Doing", "Done", "Blocked"]);
    expect(columns.map((c) => c.querySelector(".kasten-kanban-count")?.textContent)).toEqual(["1", "1", "1", "1", "1"]);
    expect(titlesIn("Doing")).toEqual(["Write intro"]);
    expect(titlesIn("No status")).toEqual(["Loose end"]);
    // The card: title, first lines, and chips for the other properties.
    const intro = card("Write intro");
    expect(intro.querySelector(".kasten-kanban-excerpt")?.textContent).toBe("A first draft of the introduction.");
    const chips = [...intro.querySelectorAll(".kasten-kanban-chip")];
    expect(chips.map((c) => c.className.replace("kasten-kanban-chip ", ""))).toEqual(["is-date", "is-select"]);
    expect(chips[1]!.textContent).toBe("High");
    expect(chips[0]!.getAttribute("title")).toMatch(/^due: /);
    // Empty columns stay as places to drop cards; odd values take none.
    expect(within(column("Blocked")).queryByRole("button", { name: "New card in Blocked" })).toBeNull();
    expect(column("Blocked").hasAttribute("data-refuses")).toBe(true);
  });

  it("drags a card to another column, commits the new value, and undoes it", async () => {
    await open();
    await drag(card("Write intro"), column("Done"), () => {
      expect(column("Done").getAttribute("data-over")).toBe("");
      expect(card("Write intro").hasAttribute("data-dragging")).toBe(true);
      expect(document.querySelector(".kasten-kanban-ghost")).not.toBeNull();
    });
    // In its new column at once, before the vault has it.
    expect(titlesIn("Done")).toEqual(["Plan budget", "Write intro"]);
    expect(titlesIn("Doing")).toEqual([]);
    expect(column("Done").hasAttribute("data-over")).toBe(false);
    expect(document.querySelector(".kasten-kanban-ghost")).toBeNull();
    await expect.poll(() => text("library/intro.md")).toContain("props:\n  status: Done\n  due: 2026-10-02\n  priority: High\n---\nA first draft");
    expect(await screen.findByText("Moved “Write intro” to Done")).toBeTruthy();
    expect(useWorkspace.getState().notes.find((n) => n.path === "library/intro.md")?.props.status).toBe("Done");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    await expect.poll(() => text("library/intro.md")).toContain("  status: Doing\n");
    expect(titlesIn("Doing")).toEqual(["Write intro"]);
    expect(await screen.findByText("Moved “Write intro” back to Doing")).toBeTruthy();
  });

  it("clears the value when a card goes to “No status”", async () => {
    await open();
    await drag(card("Book flights"), column("No status"));
    expect(titlesIn("No status")).toEqual(["Book flights", "Loose end"]);
    await expect.poll(() => text("library/flights.md")).toBe("---\ntitle: Book flights\ntags: [task]\n---\nBook flights.\n");
  });

  it("puts a card back, with the core's reason, when the vault refuses the move", async () => {
    await open();
    vi.spyOn(vault, "updateProps").mockRejectedValue(new Error("Note is locked"));
    await drag(card("Write intro"), column("Todo"));
    expect(titlesIn("Todo")).toContain("Write intro");
    expect(await screen.findByText("Note is locked")).toBeTruthy();
    await waitFor(() => expect(titlesIn("Doing")).toEqual(["Write intro"]));
    expect(titlesIn("Todo")).toEqual(["Book flights"]);
    expect(await text("library/intro.md")).toContain("  status: Doing\n");
  });

  it("does nothing when a card is dropped in its own column or one that cannot take it", async () => {
    await open();
    const write = vi.spyOn(vault, "updateProps");
    await drag(card("Write intro"), column("Doing"), () => expect(column("Doing").getAttribute("data-over")).toBe("home"));
    await drag(card("Write intro"), column("Blocked"), () => expect(column("Blocked").getAttribute("data-over")).toBe("refused"));
    expect(titlesIn("Doing")).toEqual(["Write intro"]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(write).not.toHaveBeenCalled();
    expect(useWorkspace.getState().toasts).toEqual([]);
  });

  it("puts a carried card back on Escape, without the window seeing the key", async () => {
    await open();
    const write = vi.spyOn(vault, "updateProps");
    const window_ = vi.fn();
    window.addEventListener("keydown", window_);
    fireEvent.pointerDown(card("Write intro"), { button: 0, buttons: 1, pointerId: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(column("Done"), { buttons: 1, pointerId: 2, clientX: 80, clientY: 40 });
    expect(column("Done").getAttribute("data-over")).toBe("");
    fireEvent.keyDown(document.body, { key: "Escape" });
    window.removeEventListener("keydown", window_);
    expect(window_).not.toHaveBeenCalled();
    expect(document.querySelector(".kasten-kanban-ghost")).toBeNull();
    expect(column("Done").hasAttribute("data-over")).toBe(false);
    expect(card("Write intro").hasAttribute("data-dragging")).toBe(false);
    // Letting go afterwards changes nothing.
    await act(async () => fireEvent.pointerUp(column("Done"), { button: 0, pointerId: 2, clientX: 80, clientY: 40 }));
    expect(titlesIn("Doing")).toEqual(["Write intro"]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(write).not.toHaveBeenCalled();
  });

  it("says so when the select has no options and no note has a value", async () => {
    vault = new MemoryVault({ "tags/idea.yaml": "name: idea\nproperties:\n  - {key: stage, type: select}\nviews:\n  - {name: Board, type: kanban}\n" });
    useWorkspace.setState({ place: { view: "tags" }, toasts: [] });
    await useWorkspace.getState().connect({ client: vault });
    await useTags.getState().load();
    render(<TagDatabase tag="idea" />);
    expect(await screen.findByText(/“stage” has no options yet/)).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Colour cards by" })).toBeTruthy();
  });

  it("peeks at a card on click, opens it in a tab on a middle click, and leaves a press that did not travel a click", async () => {
    await open();
    const openPath = vi.spyOn(useWorkspace.getState(), "openPath");
    const budget = card("Plan budget");
    fireEvent.pointerDown(budget, { button: 0, buttons: 1, pointerId: 3, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(budget, { buttons: 1, pointerId: 3, clientX: 7, clientY: 6 });
    fireEvent.pointerUp(budget, { button: 0, pointerId: 3, clientX: 7, clientY: 6 });
    fireEvent.click(budget);
    fireEvent(budget, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    fireEvent.click(budget, { shiftKey: true });
    // A plain click peeks at the card, as in Notion's boards.
    expect(openPath.mock.calls).toEqual([
      ["library/budget.md", "peek"],
      ["library/budget.md", "tab"],
      ["library/budget.md", "stack"],
    ]);
  });

  it("moves a focused card with Alt+→ and Alt+←, writing once the keys pause, and opens it with Enter", async () => {
    await open();
    const window_ = vi.fn();
    window.addEventListener("keydown", window_);
    card("Book flights").focus();
    await act(async () => fireEvent.keyDown(card("Book flights"), { key: "ArrowRight", altKey: true }));
    // Shown there at once and still focused; the window's Alt+→ (Forward) never saw it.
    expect(titlesIn("Doing")).toEqual(["Book flights", "Write intro"]);
    expect(columnOf(document.activeElement)).toBe("Doing");
    await act(async () => fireEvent.keyDown(document.activeElement!, { key: "ArrowRight", altKey: true }));
    expect(columnOf(document.activeElement)).toBe("Done");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Book flights");
    expect(window_).not.toHaveBeenCalled();
    window.removeEventListener("keydown", window_);
    await expect.poll(() => text("library/flights.md"), { timeout: KEY_PAUSE + 2000 }).toContain("  status: Done\n");
    // One write for the run: the Undo goes back to where it started.
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Undo" })));
    await expect.poll(() => text("library/flights.md")).toContain("  status: Todo\n");
    await waitFor(() => expect(titlesIn("Todo")).toEqual(["Book flights"]));

    const openPath = vi.spyOn(useWorkspace.getState(), "openPath");
    fireEvent.keyDown(card("Book flights"), { key: "Enter" });
    fireEvent.keyDown(card("Book flights"), { key: "Enter", ctrlKey: true });
    expect(openPath.mock.calls).toEqual([
      ["library/flights.md", "peek"],
      ["library/flights.md", "tab"],
    ]);
  });

  it("goes from card to card with the arrow keys", async () => {
    await open();
    card("Book flights").focus();
    fireEvent.keyDown(card("Book flights"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(card("Write intro"));
    fireEvent.keyDown(card("Write intro"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(card("Book flights"));
    fireEvent.keyDown(card("Book flights"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(card("Loose end"));
    fireEvent.keyDown(card("Loose end"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(card("Loose end"));
  });

  it("adds a card to a column from its foot, carrying the tag and the column's value", async () => {
    await open();
    fireEvent.click(within(column("Doing")).getByRole("button", { name: "New card in Doing" }));
    const field = within(column("Doing")).getByRole("textbox", { name: "New card in Doing" });
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "Draft outline" } });
    await act(async () => fireEvent.submit(field.closest("form")!));
    await expect.poll(async () => (await vault.list()).find((n) => n.title === "Draft outline")?.props).toEqual({ status: "Doing" });
    expect((await vault.list()).find((n) => n.title === "Draft outline")?.tags).toEqual(["task"]);
    await waitFor(() => expect(titlesIn("Doing")).toEqual(["Draft outline", "Write intro"]));
    // The field stays for the next one, empty; Escape closes it.
    expect((field as HTMLInputElement).value).toBe("");
    fireEvent.keyDown(field, { key: "Escape" });
    expect(within(column("Doing")).queryByRole("textbox")).toBeNull();

    fireEvent.click(within(column("No status")).getByRole("button", { name: "New card in No status" }));
    const loose = within(column("No status")).getByRole("textbox", { name: "New card in No status" });
    fireEvent.change(loose, { target: { value: "Someday" } });
    await act(async () => fireEvent.submit(loose.closest("form")!));
    await waitFor(() => expect(titlesIn("No status")).toContain("Someday"));
    expect((await vault.list()).find((n) => n.title === "Someday")?.props).toEqual({});
  });

  it("colours cards by a select, and keeps the choice in the tag's YAML", async () => {
    await open();
    expect(card("Write intro").classList.contains("is-tinted")).toBe(false);
    const picker = screen.getByRole("combobox", { name: "Colour cards by" });
    expect([...picker.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["None", "status", "priority"]);
    await act(async () => fireEvent.change(picker, { target: { value: "priority" } }));
    const views = async () => (await vault.tagSchemas()).find((s) => s.name === "task")!.views;
    await expect.poll(async () => (await views())[0]).toEqual({ name: "Board", type: "kanban", group_by: "status", color_by: "priority" });
    expect(card("Write intro").classList.contains("is-tinted")).toBe(true);
    expect(card("Write intro").style.getPropertyValue("--chip-fg")).toBeTruthy();
    expect(card("Book flights").classList.contains("is-tinted")).toBe(false);
    await act(async () => fireEvent.change(picker, { target: { value: "" } }));
    await expect.poll(async () => (await views())[0]).toEqual({ name: "Board", type: "kanban", group_by: "status" });
    expect(card("Write intro").classList.contains("is-tinted")).toBe(false);
  });

  it("explains how to get columns when the tag has no select property", async () => {
    await open("meeting");
    expect(await screen.findByText("Nothing to make columns from yet")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("Properties");
  });
});
