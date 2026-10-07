// "Move to" also puts a page inside another, as in Notion, so nesting does
// not need a mouse, and takes a page out of the page it is in.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useShell } from "../../../lib/store";
import { MemoryVault } from "../preview/memory-vault";
import { derive } from "../store-layout";
import { useWorkspace } from "../store";
import { initialLayout } from "../tabs";
import { MovePicker } from "./MovePicker";

const VAULT = {
  "library/recipes.md": "---\nid: RCP\ntitle: Recipes\n---\n",
  "library/soups.md": "---\ntitle: Soups\n---\nWarm ones.\n",
  "library/stews.md": "---\ntitle: Stews\nparent: RCP\n---\n",
  "projects/demo/_project.md": "---\ntitle: Demo project\ntype: project\n---\n",
  "projects/demo/pages/plan.md": "---\ntitle: Plan\n---\n",
  "inbox/idea.md": "---\ntitle: Recipe idea\n---\n",
};

let vault: MemoryVault;

beforeEach(async () => {
  localStorage.clear();
  vault = new MemoryVault(VAULT);
  useWorkspace.setState({ client: vault, ready: true, notes: await vault.list(), ...derive(initialLayout()), stack: [], recent: [], toasts: [] });
});
afterEach(cleanup);

const picker = () => screen.getByRole("dialog", { name: "Move to" });
const type = (text: string) => fireEvent.change(within(picker()).getByRole("textbox"), { target: { value: text } });
const option = (name: RegExp) => within(picker()).getByRole("option", { name });
const find = async (title: string) => (await vault.list()).find((n) => n.title === title);

describe("Move to", () => {
  it("puts a page inside a page found by name, with Undo", async () => {
    render(<MovePicker path="library/soups.md" />);
    type("rec");
    expect(option(/^Recipes/).textContent).toContain("Page · Pages");
    await act(async () => fireEvent.keyDown(within(picker()).getByRole("textbox"), { key: "Enter" }));
    expect((await find("Soups"))?.parent).toBe("RCP");
    const notice = useWorkspace.getState().toasts.find((t) => t.text === "Put “Soups” in “Recipes”");
    expect(notice?.action?.label).toBe("Undo");
  });

  it("moves a page into a project page's project", async () => {
    render(<MovePicker path="library/soups.md" />);
    type("plan");
    expect(option(/^Plan/).textContent).toContain("Page · Demo project");
    await act(async () => fireEvent.click(option(/^Plan/)));
    const soups = await find("Soups");
    expect(soups?.path).toBe("projects/demo/pages/soups.md");
    expect(soups?.parent).toBe((await find("Plan"))?.id);
  });

  it("takes a page out of its page from where it is", async () => {
    render(<MovePicker path="library/stews.md" />);
    expect(option(/^Pages/).textContent).toContain("Take it out of “Recipes”");
    type("rec");
    const recipes = option(/^Recipes/);
    expect(recipes.textContent).toContain("It is in this page now");
    expect(recipes.hasAttribute("disabled")).toBe(true);
    type("");
    await act(async () => fireEvent.click(option(/^Pages/)));
    const stews = await find("Stews");
    expect(stews?.parent ?? null).toBeNull();
    expect(stews?.path).toBe("library/stews.md");
  });

  it("never offers a page itself or one of its own sub-pages", async () => {
    render(<MovePicker path="library/recipes.md" />);
    expect(option(/^Pages/).textContent).toContain("It is here now");
    type("rec");
    expect(within(picker()).queryByRole("option", { name: /^Recipes/ })).toBeNull();
    type("stew");
    expect(within(picker()).queryByRole("option", { name: /^Stews/ })).toBeNull();
  });

  it("offers pages only to pages", async () => {
    render(<MovePicker path="inbox/idea.md" />);
    type("rec");
    const names = within(picker()).getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual([expect.stringContaining("New project “rec”")]);
  });

  it("closes on Escape without moving anything", () => {
    useShell.getState().setMoving("library/soups.md");
    render(<MovePicker path="library/soups.md" />);
    fireEvent.keyDown(within(picker()).getByRole("textbox"), { key: "Escape" });
    expect(useShell.getState().moving).toBeNull();
  });
});
