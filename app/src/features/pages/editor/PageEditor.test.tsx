// The page editor hands its page's link provider on whole: links
// to pages that share a title resolve by path, ask which page a bare title
// means, and are written the way the provider names a page.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LinkFound, LinkProvider, PageLink } from "./links";
import { PageEditor } from "./PageEditor";

const parent: PageLink = { title: "Test", path: "library/test.md", where: "Pages" };
const child: PageLink = { title: "Test", path: "library/test/test.md", where: "Test" };
const byPath = (target: string) => [parent, child].find((p) => p.path!.replace(/\.md$/, "") === target);

const links: LinkProvider = {
  pages: () => [parent, child],
  find: (target): LinkFound => (target.trim().toLowerCase() === "test" ? { choices: [parent, child] } : byPath(target) ? { page: byPath(target)! } : null),
  linkText: (page) => `${page.path!.replace(/\.md$/, "")}|${page.title}`,
  open: vi.fn(),
  create: vi.fn(),
};

async function mount(body: string, onChange = vi.fn()) {
  let ready = false;
  const view = render(<PageEditor body={body} links={links} onChange={onChange} onReady={(handle) => (ready = handle !== null)} />);
  await vi.waitFor(() => expect(ready).toBe(true));
  return { chips: [...view.container.querySelectorAll<HTMLElement>(".kasten-mention")], onChange };
}

const rows = () => [...document.querySelectorAll<HTMLElement>(".kasten-menu .kasten-menu-item")];

afterEach(() => {
  cleanup();
  document.querySelectorAll(".kasten-menu").forEach((m) => m.remove());
  vi.clearAllMocks();
});

describe("PageEditor links", () => {
  it("finds a page by its path, and asks which page a shared title means", async () => {
    const { chips } = await mount("See [[library/test|Test]] and [[Test]].\n");
    expect(chips).toHaveLength(2);
    expect(chips[0]!.classList.contains("is-missing")).toBe(false);
    expect(chips[1]!.classList.contains("is-ambiguous")).toBe(true);
  });

  it("opens the page a path link names instead of making one", async () => {
    const { chips } = await mount("See [[library/test|Test]].\n");
    chips[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(links.open).toHaveBeenCalledWith("library/test.md", "here");
    expect(links.create).not.toHaveBeenCalled();
  });

  it("names the page picked for a shared title as the provider writes it", async () => {
    const { chips, onChange } = await mount("Go to [[Test]] now.\n");
    chips[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    const always = rows().find((r) => r.textContent?.includes("Always link to"))!;
    always.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    always.click();
    await vi.waitFor(() => expect(document.querySelectorAll(".kasten-menu")).toHaveLength(2));
    const flyout = document.querySelectorAll<HTMLElement>(".kasten-menu")[1]!;
    // The sub-page, the second of the two, which lives in "Test".
    const [, inTest] = [...flyout.querySelectorAll<HTMLElement>(".kasten-menu-item")];
    expect(inTest!.textContent).not.toContain("Pages");
    inTest!.click();
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith("Go to [[library/test/test|Test]] now.\n"));
  });
});
