import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { useTags } from "./store";
import { TagDatabase } from "./TagDatabase";
import { TagsHome } from "./TagsHome";

const TASK = "name: task\ncolor: green\nproperties:\n  - {key: status, type: select, options: [Todo, Doing, Done]}\n  - {key: due, type: date}\nviews:\n  - {name: Board, type: kanban, group_by: status}\n  - {name: All, type: table}\n";
const SEED = {
  "tags/task.yaml": TASK,
  "library/a.md": "---\ntitle: Write intro\ntags: [task]\nprops:\n  status: Doing\n  due: 2026-10-02\n---\nA\n",
  "library/b.md": "---\ntitle: Book flights\ntags: [task, travel]\nprops:\n  status: Todo\n---\nB\n",
  "library/c.md": "---\ntitle: Plan budget\ntags: [task]\nprops:\n  status: Done\n---\nC\n",
  "library/idea.md": "---\ntitle: Idea\ntags: [idea]\n---\nI\n",
};

let vault: MemoryVault;
const schema = async () => (await vault.tagSchemas()).find((s) => s.name === "task")!;

async function connect() {
  vault = new MemoryVault(SEED);
  useWorkspace.setState({ place: { view: "tags" }, toasts: [] });
  await useWorkspace.getState().connect({ client: vault });
}

beforeEach(async () => {
  localStorage.clear();
  useTags.setState({ schemas: null });
  await connect();
});
afterEach(cleanup);

describe("Tag Database", () => {
  it("lists every tag with its notes and opens one's database", async () => {
    render(<TagsHome />);
    const list = await screen.findByRole("list", { name: "Tags" });
    const task = within(list).getByRole("button", { name: /#task/ });
    expect(task.textContent).toContain("3 notes");
    expect(task.textContent).toContain("status · due");
    expect(within(list).getByRole("button", { name: /#idea/ }).textContent).toContain("1 note");
    fireEvent.click(task);
    expect(useWorkspace.getState().place).toEqual({ view: "tags", path: "#task" });
  });

  it("shows a tag's views, and saves a new one into its YAML", async () => {
    render(<TagDatabase tag="task" />);
    const tabs = await screen.findByRole("tablist", { name: "Views" });
    await expect.poll(() => within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Board", "All"]);
    fireEvent.click(screen.getByRole("button", { name: "Add a view" }));
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: /List/ })));
    await expect.poll(async () => (await schema()).views.map((v) => v.name)).toEqual(["Board", "All", "List"]);
    expect(within(tabs).getByRole("tab", { name: /List/ }).getAttribute("aria-selected")).toBe("true");
    const notes = screen.getByRole("list", { name: "Notes" });
    expect(within(notes).getAllByRole("button")).toHaveLength(3);
  });

  it("filters and sorts a view, and keeps both with it", async () => {
    render(<TagDatabase tag="task" />);
    fireEvent.click(await screen.findByRole("tab", { name: /All/ }));
    fireEvent.click(screen.getByRole("button", { name: "+ Filter" }));
    const popup = screen.getByRole("dialog", { name: "Add a filter" });
    fireEvent.change(within(popup).getByRole("combobox", { name: "Property" }), { target: { value: "status" } });
    fireEvent.change(within(popup).getByRole("combobox", { name: "Condition" }), { target: { value: "is_not" } });
    fireEvent.change(within(popup).getByRole("combobox", { name: "Value" }), { target: { value: "Done" } });
    await act(async () => fireEvent.click(within(popup).getByRole("button", { name: "Add filter" })));
    await expect.poll(() => screen.queryByText("Plan budget")).toBeNull();
    expect(screen.getByText("2 of 3")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Add a sort" }), { target: { value: "status" } });
    await expect.poll(async () => (await schema()).views[1]).toEqual({
      name: "All",
      type: "table",
      filter: [{ key: "status", op: "is_not", value: "Done" }],
      sort: [{ key: "status", dir: "asc" }],
    });
    fireEvent.click(screen.getByRole("button", { name: /Remove the filter/ }));
    await expect.poll(() => screen.queryByText("Plan budget")).not.toBeNull();
  });

  it("filters a checkbox by what its menu shows", async () => {
    vault = new MemoryVault({
      ...SEED,
      "tags/task.yaml": TASK.replace("  - {key: due, type: date}\n", "  - {key: due, type: date}\n  - {key: urgent, type: checkbox}\n"),
      "library/b.md": "---\ntitle: Book flights\ntags: [task]\nprops:\n  status: Todo\n  urgent: true\n---\nB\n",
    });
    await useWorkspace.getState().connect({ client: vault });
    render(<TagDatabase tag="task" />);
    fireEvent.click(await screen.findByRole("tab", { name: /All/ }));
    fireEvent.click(screen.getByRole("button", { name: "+ Filter" }));
    const popup = screen.getByRole("dialog", { name: "Add a filter" });
    fireEvent.change(within(popup).getByRole("combobox", { name: "Property" }), { target: { value: "urgent" } });
    const value = within(popup).getByRole("combobox", { name: "Value" }) as HTMLSelectElement;
    expect(value.selectedOptions[0]!.textContent).toBe("ticked");
    await act(async () => fireEvent.click(within(popup).getByRole("button", { name: "Add filter" })));
    await expect.poll(async () => (await schema()).views[1]!.filter).toEqual([{ key: "urgent", op: "is", value: true }]);
    expect(screen.getByText("urgent is ticked")).toBeTruthy();
    await expect.poll(() => screen.queryByText("Plan budget")).toBeNull();
    expect(screen.getByText("Book flights")).toBeTruthy();
  });

  it("edits the tag's properties", async () => {
    render(<TagDatabase tag="task" />);
    fireEvent.click(await screen.findByRole("button", { name: /Properties/ }));
    const editor = screen.getByRole("dialog", { name: "Properties of #task" });
    fireEvent.click(within(editor).getByRole("button", { name: "+ Add a property" }));
    const names = within(editor).getAllByRole("textbox", { name: "Property name" });
    fireEvent.change(names.at(-1)!, { target: { value: "points" } });
    fireEvent.change(within(editor).getByRole("combobox", { name: "Type of points" }), { target: { value: "number" } });
    fireEvent.change(within(editor).getByRole("textbox", { name: "Options of status" }), { target: { value: "Todo, Doing, Waiting, Done" } });
    await act(async () => fireEvent.click(within(editor).getByRole("button", { name: "Save" })));
    await expect.poll(async () => (await schema()).properties.map((p) => [p.key, p.type, p.options.length])).toEqual([
      ["status", "select", 4],
      ["due", "date", 0],
      ["points", "number", 0],
    ]);
    expect(screen.queryByRole("dialog", { name: "Properties of #task" })).toBeNull();
  });

  it("refuses two properties with one name", async () => {
    render(<TagDatabase tag="task" />);
    fireEvent.click(await screen.findByRole("button", { name: /Properties/ }));
    const editor = screen.getByRole("dialog", { name: "Properties of #task" });
    fireEvent.click(within(editor).getByRole("button", { name: "+ Add a property" }));
    fireEvent.change(within(editor).getAllByRole("textbox", { name: "Property name" }).at(-1)!, { target: { value: "due" } });
    expect(within(editor).getByText("Two properties are called “due”.")).toBeTruthy();
    expect(within(editor).getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  });

  it("adds a note carrying the tag", async () => {
    render(<TagDatabase tag="task" />);
    fireEvent.click(await screen.findByRole("button", { name: "New" }));
    const field = screen.getByRole("textbox", { name: "New note in #task" });
    fireEvent.change(field, { target: { value: "Pack bags" } });
    await act(async () => fireEvent.submit(field.closest("form")!));
    await expect.poll(() => useWorkspace.getState().notes.find((n) => n.title === "Pack bags")?.tags).toEqual(["task"]);
  });

  it("finds a note inside the view by its title or a property, without saving it", async () => {
    render(<TagDatabase tag="task" />);
    await screen.findByText("Write intro");
    const find = screen.getByRole("searchbox", { name: "Find in this view" });
    fireEvent.change(find, { target: { value: "flights" } });
    expect(screen.queryByText("Write intro")).toBeNull();
    expect(screen.getByText("Book flights")).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "View settings" }).textContent).toContain("1 of 3");
    fireEvent.change(find, { target: { value: "done" } });
    expect(screen.getByText("Plan budget")).toBeTruthy();
    expect(screen.queryByText("Book flights")).toBeNull();
    fireEvent.keyDown(find, { key: "Escape" });
    expect(screen.getByText("Write intro")).toBeTruthy();
    expect((await schema()).views?.every((v) => !JSON.stringify(v).includes("done"))).toBe(true);
  });
});
