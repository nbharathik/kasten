import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dayFrom } from "../../lib/dates";
import { useTaskRows } from "../dashboard/task-rows";
import { journalPath } from "../journal/feed";
import { useTags } from "../tags/store";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { Tasks } from "./TasksView";

const TODAY = dayFrom(0);
const SEED = {
  "projects/trip/_project.md": "---\ntitle: Seaside trip\ntype: project\n---\n- [ ] Book flights [[" + dayFrom(-2) + "]]\n",
  "projects/trip/pages/packing.md": "---\ntitle: Packing\n---\n- [ ] Adapters [[" + TODAY + "]]\n- [x] Passport\n",
  "library/misc.md": "---\ntitle: Misc\n---\n- [ ] Fix the bike\n",
  "tags/task.yaml": "name: task\ncolor: green\nproperties:\n  - {key: status, type: select, options: [Todo, Doing, Done]}\nviews:\n  - {name: Board, type: kanban, group_by: status}\n",
  "projects/trip/pages/hotel.md": "---\ntitle: Book the hotel\ntags: [task]\nprops:\n  status: Doing\n---\n",
  "library/garden.md": "---\ntitle: Weed the garden\ntags: [task]\nprops:\n  status: Todo\n---\n",
};

beforeEach(async () => {
  localStorage.clear();
  useTaskRows.setState({ rows: null });
  useTags.setState({ schemas: null });
  await useWorkspace.getState().connect({ client: new MemoryVault(SEED) });
});
afterEach(cleanup);

const labels = () => screen.queryAllByRole("checkbox").map((b) => b.getAttribute("aria-label"));

describe("Tasks", () => {
  it("filters to-dos by place, day and words, and groups them by project", async () => {
    render(<Tasks />);
    await screen.findByRole("checkbox", { name: /Fix the bike/ });
    expect(labels()).toHaveLength(3);
    fireEvent.change(screen.getByRole("combobox", { name: "Where" }), { target: { value: "project:trip" } });
    expect(labels().every((l) => !l!.includes("bike"))).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Day" }), { target: { value: "overdue" } });
    expect(labels()).toEqual([expect.stringContaining("Book flights")]);
    fireEvent.change(screen.getByRole("combobox", { name: "Day" }), { target: { value: "any" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Where" }), { target: { value: "all" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a to-do" }), { target: { value: "adapt" } });
    expect(labels()).toEqual([expect.stringContaining("Adapters")]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a to-do" }), { target: { value: "" } });
    fireEvent.click(within(screen.getByRole("group", { name: "Group by" })).getByRole("button", { name: "Project" }));
    expect(screen.getByRole("region", { name: "Seaside trip" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Other pages" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("kasten.tasks.view")!).by).toBe("project");
  });

  it("shows everything when the place saved is gone", async () => {
    localStorage.setItem("kasten.tasks.view", JSON.stringify({ filter: { where: "project:gone" } }));
    render(<Tasks />);
    await screen.findByRole("checkbox", { name: /Fix the bike/ });
    expect(labels()).toHaveLength(3);
    expect((screen.getByRole("combobox", { name: "Where" }) as HTMLSelectElement).value).toBe("all");
  });

  it("shows a to-do as written, dashes and pluses included", async () => {
    await useWorkspace.getState().connect({ client: new MemoryVault({ "library/misc.md": "---\ntitle: Misc\n---\n- [ ] Pack snacks - fruit + nuts\n" }) });
    render(<Tasks />);
    expect(await screen.findByRole("checkbox", { name: "Pack snacks - fruit + nuts" })).toBeTruthy();
    expect(screen.getByText("Pack snacks - fruit + nuts")).toBeTruthy();
  });

  it("shows #task notes as a board, in one place or everywhere", async () => {
    render(<Tasks />);
    fireEvent.click(within(screen.getByRole("group", { name: "Show tasks as" })).getByRole("button", { name: "Board" }));
    await expect.poll(() => document.body.textContent).toContain("Weed the garden");
    await expect.poll(() => document.body.textContent).toContain("Book the hotel");
    await act(async () => fireEvent.change(screen.getByRole("combobox", { name: "Where" }), { target: { value: "project:trip" } }));
    await expect.poll(() => document.body.textContent).not.toContain("Weed the garden");
    expect(document.body.textContent).toContain("Book the hotel");
  });

  it("adds a to-do to today's journal, or to the project chosen", async () => {
    render(<Tasks />);
    await screen.findByRole("checkbox", { name: /Fix the bike/ });
    const add = screen.getByRole("textbox", { name: "Add a to-do" });
    fireEvent.change(add, { target: { value: "Call the plumber" } });
    await act(async () => fireEvent.submit(add.closest("form")!));
    const vault = useWorkspace.getState().client!;
    await expect.poll(async () => (await vault.read(journalPath(TODAY)).catch(() => null))?.text ?? "").toContain("- [ ] Call the plumber");

    fireEvent.change(screen.getByRole("combobox", { name: "Where" }), { target: { value: "project:trip" } });
    fireEvent.change(add, { target: { value: "Buy sunscreen" } });
    await act(async () => fireEvent.submit(add.closest("form")!));
    await expect.poll(async () => (await vault.read("projects/trip/_project.md")).text).toContain("- [ ] Buy sunscreen");
  });

  it("moves between to-dos with the arrows", async () => {
    render(<Tasks />);
    await screen.findByRole("checkbox", { name: /Book flights/ });
    const boxes = screen.getAllByRole("checkbox");
    boxes[0]!.focus();
    fireEvent.keyDown(boxes[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(boxes[1]);
    fireEvent.keyDown(boxes[1]!, { key: "End" });
    expect(document.activeElement).toBe(boxes.at(-1));
    fireEvent.keyDown(boxes.at(-1)!, { key: "Home" });
    expect(document.activeElement).toBe(boxes[0]);
  });
});
