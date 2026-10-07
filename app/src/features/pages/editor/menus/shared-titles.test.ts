// Links to pages that share a title: the menus say where each
// lives and name the one picked by path, a sub-page may take its parent's
// name, and a link that could mean either asks which.

import { afterEach, describe, expect, it, vi } from "vitest";

import { useTestEditor } from "../../../../test/editor";
import type { LinkFound, LinkProvider, PageLink } from "../links";

const trip: PageLink = { title: "Plan", icon: "📄", path: "projects/trip/pages/plan.md", where: "Trip" };
const home: PageLink = { title: "Plan", icon: "📄", path: "projects/home/pages/plan.md", where: "Home" };
const byPath = (target: string) => [trip, home].find((p) => p.path!.replace(/\.md$/, "") === target);

const links: LinkProvider = {
  pages: () => [trip, home],
  find: (target): LinkFound => (target.trim().toLowerCase() === "plan" ? { choices: [trip, home] } : byPath(target) ? { page: byPath(target)! } : null),
  linkText: (page) => `${page.path!.replace(/\.md$/, "")}|${page.title}`,
  open: vi.fn(),
  create: vi.fn(async (title: string) => ({ title, path: "library/plan.md" })),
};
const editor = useTestEditor({ links });
const menu = () => document.querySelector<HTMLElement>(".kasten-menu");
const rows = () => [...(menu()?.querySelectorAll<HTMLElement>(".kasten-menu-item") ?? [])];

afterEach(() => {
  editor.press("Escape");
  vi.clearAllMocks();
  document.querySelectorAll(".kasten-menu").forEach((m) => m.remove());
});

describe("pages that share a title", () => {
  it("say where each lives in the [[ menu, and link the one picked by its path", () => {
    editor.open("See\n").caret("See", true);
    editor.type(" [[plan");
    expect(rows().map((r) => r.dataset.key)).toEqual([`page:${trip.path}`, `page:${home.path}`, "create"]);
    expect(rows()[1]!.textContent).toContain("Home");
    editor.press("ArrowDown");
    editor.press("Enter");
    expect(editor.save()).toBe("See [[projects/home/pages/plan|Plan]]\n");
    const chip = editor.view.dom.querySelector<HTMLElement>(".kasten-mention")!;
    expect(chip.textContent).toContain("Plan");
    expect(chip.classList.contains("is-ambiguous")).toBe(false);
  });

  it("can make another page with a name in use, as a sub-page takes its parent's", () => {
    editor.open("\n");
    editor.type("/page");
    editor.press("Enter");
    editor.type("Plan");
    expect(rows().map((r) => r.dataset.key)).toEqual(["create"]);
    editor.press("Enter");
    expect(links.create).toHaveBeenCalledWith("Plan");
  });

  it("ask which page a link means when nothing picks one, and can name it for good", async () => {
    editor.open("Go to [[Plan]] now.\n");
    const chip = editor.view.dom.querySelector<HTMLElement>(".kasten-mention")!;
    expect(chip.classList.contains("is-ambiguous")).toBe(true);
    chip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    const chooser = menu()!;
    expect(chooser.getAttribute("aria-label")).toBe("Which page?");
    expect(rows().map((r) => r.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Trip"), expect.stringContaining("Home")]));
    // "Always link to…", then Home.
    rows()
      .find((r) => r.textContent?.includes("Always link to"))!
      .dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    const always = rows().find((r) => r.textContent?.includes("Always link to"))!;
    always.click();
    await expect.poll(() => document.querySelectorAll(".kasten-menu").length).toBe(2);
    const flyout = document.querySelectorAll<HTMLElement>(".kasten-menu")[1]!;
    [...flyout.querySelectorAll<HTMLElement>(".kasten-menu-item")].find((r) => r.textContent?.includes("Home"))!.click();
    expect(editor.save()).toBe("Go to [[projects/home/pages/plan|Plan]] now.\n");
    expect(links.open).not.toHaveBeenCalled();
  });

  it("open the page chosen", () => {
    editor.open("Go to [[Plan]] now.\n");
    editor.view.dom.querySelector<HTMLElement>(".kasten-mention")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    rows()
      .find((r) => r.textContent?.includes("Trip"))!
      .click();
    expect(links.open).toHaveBeenCalledWith(trip.path, "here");
  });
});
