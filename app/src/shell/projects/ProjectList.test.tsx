import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NOTE_DRAG } from "../../features/workspace/drag";
import { usePrefs } from "../../features/workspace/prefs";
import { MemoryVault } from "../../features/workspace/preview/memory-vault";
import { useWorkspace } from "../../features/workspace/store";
import { PROJECT_DRAG } from "./ProjectList";
import { ARCHIVED, BETA, choose, dragAt, freshWindow, GAMMA, lineOf, order, renderShell, rowOf, SEED, transfer } from "./test-shell";

let vault: MemoryVault;

/** Puts a project's line on screen, 30 px tall from `top`. */
function place(row: HTMLElement, top: number) {
  lineOf(row).getBoundingClientRect = () => ({ top, bottom: top + 30, height: 30, left: 0, right: 240, width: 240, x: 0, y: top, toJSON: () => ({}) });
}

/** The project the insertion line sits above, if any. */
const lineAbove = (projects: HTMLElement) => (projects.querySelector("[data-drop-line]")?.nextElementSibling as HTMLElement | null | undefined)?.dataset.project;

beforeEach(() => {
  freshWindow();
  vault = new MemoryVault(SEED);
});
afterEach(cleanup);

describe("organising projects in the sidebar", () => {
  it("pins a project to the top with a pin on its row, and unpins it", async () => {
    const projects = await renderShell(vault);
    expect(order(projects)).toEqual(["alpha", "beta", "gamma"]);
    await choose(projects, "Gamma", /Pin to top/);
    expect(order(projects)).toEqual(["gamma", "alpha", "beta"]);
    expect(usePrefs.getState().pinnedProjects).toEqual(["gamma"]);
    // Focus follows the row to the top.
    expect(document.activeElement).toBe(rowOf(projects, "gamma").querySelector("[data-row-title]"));
    expect(within(lineOf(rowOf(projects, "gamma"))).getByRole("img", { name: "Pinned" })).toBeTruthy();
    expect(within(lineOf(rowOf(projects, "alpha"))).queryByRole("img", { name: "Pinned" })).toBeNull();
    // Pinned projects keep their arranged order among themselves.
    await choose(projects, "Beta", /Pin to top/);
    expect(order(projects)).toEqual(["beta", "gamma", "alpha"]);
    await choose(projects, "Beta", /Unpin/);
    await choose(projects, "Gamma", /Unpin/);
    expect(order(projects)).toEqual(["alpha", "beta", "gamma"]);
    expect(projects.querySelector('[aria-label="Pinned"]')).toBeNull();
  });

  it("reorders projects by dragging a row, and keeps the order", async () => {
    const projects = await renderShell(vault);
    const drag = transfer();
    fireEvent.dragStart(lineOf(rowOf(projects, "gamma")), { dataTransfer: drag });
    // The row still carries its note (for boards) and, for this list only, its project.
    expect(drag.data.get(NOTE_DRAG)).toBe(GAMMA);
    expect(drag.data.get(PROJECT_DRAG)).toBe("gamma");
    expect(rowOf(projects, "gamma").className).toContain("opacity-40");

    const alpha = rowOf(projects, "alpha");
    const beta = rowOf(projects, "beta");
    place(alpha, 100);
    place(beta, 130);
    // The bottom half of Beta: just above Gamma itself, so no line.
    expect(dragAt("dragOver", beta, drag, 150)).toBe(false);
    expect(lineAbove(projects)).toBeUndefined();
    // The top half of Alpha: the line shows above it.
    expect(dragAt("dragOver", alpha, drag, 105)).toBe(false);
    expect(lineAbove(projects)).toBe("alpha");
    await act(async () => void dragAt("drop", alpha, drag, 105));
    fireEvent.dragEnd(lineOf(rowOf(projects, "gamma")));

    expect(order(projects)).toEqual(["gamma", "alpha", "beta"]);
    expect(usePrefs.getState().projectOrder).toEqual(["gamma", "alpha", "beta"]);
    expect(JSON.parse(localStorage.getItem("kasten.prefs")!).projectOrder).toEqual(["gamma", "alpha", "beta"]);
    expect(projects.querySelector("[data-drop-line]")).toBeNull();
    expect(rowOf(projects, "gamma").className).not.toContain("opacity-40");

    // Drawn again from scratch, the list keeps that order.
    cleanup();
    expect(order(await renderShell(vault))).toEqual(["gamma", "alpha", "beta"]);
  });

  it("takes only project rows, and keeps a drag within the pinned or unpinned group", async () => {
    usePrefs.setState({ pinnedProjects: ["gamma"] });
    const projects = await renderShell(vault);
    expect(order(projects)).toEqual(["gamma", "alpha", "beta"]);

    // Beta dropped above the pinned Gamma lands first among the unpinned.
    const drag = transfer();
    fireEvent.dragStart(lineOf(rowOf(projects, "beta")), { dataTransfer: drag });
    place(rowOf(projects, "gamma"), 100);
    expect(dragAt("dragOver", rowOf(projects, "gamma"), drag, 102)).toBe(false);
    expect(lineAbove(projects)).toBe("alpha");
    await act(async () => void dragAt("drop", rowOf(projects, "gamma"), drag, 102));
    expect(order(projects)).toEqual(["gamma", "beta", "alpha"]);
  });

  it("moves a page dragged onto another project into its pages, and onto Pages back out", async () => {
    const projects = await renderShell(vault);
    const expand = within(projects).queryByRole("button", { name: "Expand Beta" });
    if (expand) fireEvent.click(expand);
    const page = transfer();
    fireEvent.dragStart(within(projects).getByRole("button", { name: "Plan" }).closest("[draggable]")!, { dataTransfer: page });
    expect(page.data.has(PROJECT_DRAG)).toBe(false);
    // Its own project has it already; another one takes it, lit up, with no insertion line.
    expect(dragAt("dragOver", rowOf(projects, "beta"), page, 0)).toBe(true);
    expect(dragAt("dragOver", rowOf(projects, "alpha"), page, 0)).toBe(false);
    expect(page.dropEffect).toBe("move");
    expect(rowOf(projects, "alpha").hasAttribute("data-drop-into")).toBe(true);
    expect(projects.querySelector("[data-drop-line]")).toBeNull();
    await act(async () => void dragAt("drop", rowOf(projects, "alpha"), page, 0));
    expect(rowOf(projects, "alpha").hasAttribute("data-drop-into")).toBe(false);
    await waitFor(async () => expect((await vault.list()).find((n) => n.title === "Plan")?.path).toBe("projects/alpha/pages/plan.md"));
    expect(useWorkspace.getState().toasts.map((t) => t.text)).toContain("Moved “Plan” to Alpha");
    const alphaExpand = await within(projects).findByRole("button", { name: "Expand Alpha" });
    fireEvent.click(alphaExpand);
    expect(within(rowOf(projects, "alpha")).getByRole("button", { name: "Plan" })).toBeTruthy();

    // Onto Pages: out of the project, into the library.
    const pages = within(screen.getByRole("navigation", { name: "Sidebar" })).getByRole("region", { name: "Pages" });
    const back = transfer();
    fireEvent.dragStart(within(rowOf(projects, "alpha")).getByRole("button", { name: "Plan" }).closest("[draggable]")!, { dataTransfer: back });
    expect(dragAt("dragOver", pages, back, 0)).toBe(false);
    expect(pages.hasAttribute("data-drop-into")).toBe(true);
    await act(async () => void dragAt("drop", pages, back, 0));
    await waitFor(async () => expect((await vault.list()).find((n) => n.title === "Plan")?.path).toBe("library/plan.md"));
    expect(await within(pages).findByRole("button", { name: "Plan" })).toBeTruthy();
    expect(pages.hasAttribute("data-drop-into")).toBe(false);
  });

  it("leaves projects themselves and whiteboards where they are", async () => {
    const projects = await renderShell(vault);
    // A project row carries its note too, but it reorders; it never moves in.
    const drag = transfer();
    fireEvent.dragStart(lineOf(rowOf(projects, "gamma")), { dataTransfer: drag });
    dragAt("dragOver", rowOf(projects, "alpha"), drag, 0);
    expect(rowOf(projects, "alpha").hasAttribute("data-drop-into")).toBe(false);
    // Only notes that live in a project's pages or cards move in.
    const board = transfer();
    board.setData(NOTE_DRAG, "library/plan.canvas");
    expect(dragAt("dragOver", rowOf(projects, "alpha"), board, 0)).toBe(true);
  });

  it("moves a project up and down from its menu, within the list's ends", async () => {
    const projects = await renderShell(vault);
    await choose(projects, "Alpha", /Move down/);
    expect(order(projects)).toEqual(["beta", "alpha", "gamma"]);
    await choose(projects, "Gamma", /Move up/);
    expect(order(projects)).toEqual(["beta", "gamma", "alpha"]);
    expect(usePrefs.getState().projectOrder).toEqual(["beta", "gamma", "alpha"]);
    fireEvent.click(within(projects).getByRole("button", { name: "More for Beta" }));
    expect(screen.queryByRole("menuitem", { name: /Move up/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Move down/ })).toBeTruthy();
  });

  it("moves the focused project with Alt+↑ and Alt+↓, keeping focus on it", async () => {
    const projects = await renderShell(vault);
    const title = () => rowOf(projects, "alpha").querySelector<HTMLElement>("[data-row-title]")!;
    title().focus();
    fireEvent.keyDown(title(), { key: "ArrowDown", altKey: true });
    expect(order(projects)).toEqual(["beta", "alpha", "gamma"]);
    expect(document.activeElement).toBe(title());
    fireEvent.keyDown(title(), { key: "ArrowDown", altKey: true });
    fireEvent.keyDown(title(), { key: "ArrowDown", altKey: true });
    expect(order(projects)).toEqual(["beta", "gamma", "alpha"]);
    fireEvent.keyDown(title(), { key: "ArrowUp", altKey: true });
    expect(order(projects)).toEqual(["beta", "alpha", "gamma"]);
    expect(document.activeElement).toBe(title());
    // Without Alt, arrows do not move anything.
    fireEvent.keyDown(title(), { key: "ArrowUp" });
    expect(order(projects)).toEqual(["beta", "alpha", "gamma"]);
  });
});

describe("archiving projects in the sidebar", () => {
  it("archives a project into “Archived”, writing archived: true, and Undo brings it back to its place", async () => {
    usePrefs.setState({ projectOrder: ["gamma", "beta", "alpha"] });
    const projects = await renderShell(vault);
    await choose(projects, "Beta", /Archive project/);
    expect(order(projects)).toEqual(["gamma", "alpha"]);
    const file = await vault.read("projects/beta/_project.md");
    expect(file.text).toBe("---\ntitle: Beta\ntype: project\nprops:\n  archived: true\n---\nSecond.\n");
    expect(file.meta.props.archived).toBe(true);
    // Nothing moved or went away.
    expect((await vault.list()).map((n) => n.path)).toContain("projects/beta/pages/plan.md");
    const group = within(projects).getByRole("button", { name: "Archived (1)" });
    expect(group.getAttribute("aria-expanded")).toBe("false");
    expect(within(projects).queryByText("Beta")).toBeNull();

    expect(await screen.findByText("Archived “Beta”")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    expect((await vault.read("projects/beta/_project.md")).text).toBe(BETA);
    expect(order(projects)).toEqual(["gamma", "beta", "alpha"]);
    expect(within(projects).queryByRole("button", { name: /^Archived/ })).toBeNull();
  });

  it("lists archived projects folded at the end, each with Unarchive", async () => {
    vault = new MemoryVault(ARCHIVED);
    const projects = await renderShell(vault);
    expect(order(projects)).toEqual(["alpha", "beta"]);
    const group = within(projects).getByRole("button", { name: "Archived (1)" });
    expect(within(projects).queryByText("Gamma")).toBeNull();
    fireEvent.click(group);
    expect(group.getAttribute("aria-expanded")).toBe("true");
    expect(within(projects).getByText("Gamma")).toBeTruthy();
    await choose(projects, "Gamma", /Unarchive/);
    expect(order(projects)).toEqual(["alpha", "beta", "gamma"]);
    expect((await vault.read(GAMMA)).text).toBe(SEED[GAMMA]);
    expect(await screen.findByText("“Gamma” is back in Projects")).toBeTruthy();
  });
});
