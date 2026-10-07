import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../../workspace/preview/memory-vault";
import { useWorkspace } from "../../workspace/store";
import { openWithPanel, toasts } from "../test-page";

const SEED = {
  "library/welcome.md": "---\ntitle: Welcome\n---\nHello\n",
  "library/linked.md": "---\ntitle: Linked\n---\nStart at [[Welcome]] today.\n",
  "library/mention.md": "---\ntitle: Mention\nupdated: 2026-09-23T08:00:00Z\n---\nSay `Welcome` and welcome everyone.\n",
  "library/other.md": "---\ntitle: Other\n---\nWelcome back.\n",
  "projects/trip/boards/plan.canvas": JSON.stringify({ nodes: [{ id: "n1", type: "file", file: "library/welcome.md", x: 0, y: 0, width: 320, height: 180 }], edges: [], "x-kasten": { title: "Trip plan" } }),
  "library/empty.canvas": JSON.stringify({ nodes: [], edges: [] }),
};

let vault: MemoryVault;
const text = async (path: string) => (await vault.read(path)).text;

beforeEach(() => {
  localStorage.clear();
  vault = new MemoryVault(SEED);
});
afterEach(cleanup);

describe("Links tab", () => {
  it("lists the notes relating to this one through a property", async () => {
    vault = new MemoryVault({
      ...SEED,
      "library/welcome.md": "---\nid: 01K5Y2WE1C0MEPAGE000000001\ntitle: Welcome\n---\nHello\n",
      "tags/paper.yaml": "name: paper\nproperties:\n  - {key: related, type: relation}\n",
      "library/by-id.md": "---\ntitle: Paper by id\ntags: [paper]\nprops:\n  related: [01K5Y2WE1C0MEPAGE000000001]\n---\nBody\n",
      "library/by-title.md": "---\ntitle: Paper by title\ntags: [paper]\nprops:\n  related: [\"[[Welcome]]\"]\n---\nBody\n",
    });
    const { panel } = await openWithPanel(vault, "library/welcome.md", "details");
    const related = await within(panel).findByRole("region", { name: "Related from" });
    expect(within(related).getAllByRole("button").map((b) => b.textContent)).toEqual([expect.stringContaining("Paper by id"), expect.stringContaining("Paper by title")]);
    expect(related.textContent).toContain("through related");
    fireEvent.click(within(related).getByRole("button", { name: /Paper by title/ }));
    expect(useWorkspace.getState().place.path).toBe("library/by-title.md");
  });

  it("lists similar notes with the words they share, and opens one on the side stack", async () => {
    vault = new MemoryVault({
      "library/starter.md": "---\ntitle: Sourdough starter\n---\nFeed the sourdough starter with rye flour every morning.\n",
      "library/bread.md": "---\ntitle: Baking bread\n---\nSourdough bread needs an active starter and flour.\n",
      "library/rye.md": "---\ntitle: Rye flour\n---\nThe [[Sourdough starter]] likes rye flour best.\n",
      "library/garden.md": "---\ntitle: Garden plan\n---\nPlant tomatoes in spring.\n",
      "library/music.md": "---\ntitle: Music\n---\nScales and chords.\n",
      "library/books.md": "---\ntitle: Books\n---\nNovels to read.\n",
    });
    const { panel } = await openWithPanel(vault, "library/starter.md", "details");
    const similar = await within(panel).findByRole("region", { name: "Similar notes" });
    await expect.poll(() => within(similar).queryAllByRole("button").map((b) => b.textContent)).toEqual([
      expect.stringContaining("Rye flour"),
      expect.stringContaining("Baking bread"),
    ]);
    expect(within(similar).getByRole("button", { name: /Rye flour/ }).textContent).toContain("linked");
    expect(within(similar).getByRole("button", { name: /Baking bread/ }).textContent).toContain("shares sourdough, starter");
    fireEvent.click(within(similar).getByRole("button", { name: /Baking bread/ }), { shiftKey: true });
    expect(useWorkspace.getState().stack).toContain("library/bread.md");
  });

  it("says when no note is similar", async () => {
    const { panel } = await openWithPanel(vault, "library/welcome.md", "details");
    const similar = await within(panel).findByRole("region", { name: "Similar notes" });
    expect(similar.textContent).toContain("No other note shares");
  });

  it("leaves out Related from when nothing relates here", async () => {
    const { panel } = await openWithPanel(vault, "library/welcome.md", "details");
    await within(panel).findByRole("region", { name: "Backlinks" });
    expect(within(panel).queryByRole("region", { name: "Related from" })).toBeNull();
  });

  it("lists backlinks with their snippets, and opens one", async () => {
    // The page footer lists backlinks too; these queries look in the panel.
    const { panel } = await openWithPanel(vault, "library/welcome.md", "details");
    const backlinks = await within(panel).findByRole("region", { name: "Backlinks" });
    await expect.poll(() => backlinks.textContent).toContain("Linked");
    expect(backlinks.textContent).toContain("Start at Welcome today.");
    fireEvent.click(within(backlinks).getByRole("button", { name: /Linked/ }));
    expect(useWorkspace.getState().place.path).toBe("library/linked.md");
  });

  it("says where a backlink lives when another page shares its title", async () => {
    vault = new MemoryVault({
      ...SEED,
      "projects/trip/_project.md": "---\ntitle: Trip\ntype: project\n---\n",
      "projects/trip/pages/linked.md": "---\ntitle: Linked\n---\nSee [[library/welcome|Welcome]].\n",
    });
    const { panel } = await openWithPanel(vault, "library/welcome.md", "details");
    const backlinks = await within(panel).findByRole("region", { name: "Backlinks" });
    await expect.poll(() => within(backlinks).queryAllByRole("button", { name: /Linked/ }).length).toBe(2);
    expect(within(backlinks).getByRole("button", { name: /Linked\s*·\s*Trip/ })).toBeTruthy();
    expect(within(backlinks).getByRole("button", { name: /Linked\s*·\s*Pages/ })).toBeTruthy();
  });

  it("links an unlinked mention, keeping the text as written", async () => {
    const { panel } = await openWithPanel(vault, "library/welcome.md", "details");
    const mentions = await within(panel).findByRole("region", { name: "Unlinked mentions" });
    const linkIt = await within(mentions).findByRole("button", { name: "Link it in Mention" });
    await act(async () => fireEvent.click(linkIt));
    // The code span is left alone; the plain mention becomes an aliased link.
    await expect.poll(() => text("library/mention.md")).toContain("Say `Welcome` and [[Welcome|welcome]] everyone.\n");
    expect(await text("library/mention.md")).toContain("title: Mention\n");
    await expect.poll(toasts).toContain("Linked “Welcome” in “Mention”");
    // It now counts as a backlink, and is no longer a mention.
    const backlinks = within(panel).getByRole("region", { name: "Backlinks" });
    await expect.poll(() => backlinks.textContent).toContain("Mention");
    await expect.poll(() => within(mentions).queryByRole("button", { name: "Link it in Mention" })).toBeNull();
  });

  it("links every mention with Link all", async () => {
    const { panel } = await openWithPanel(vault, "library/welcome.md", "details");
    const mentions = await within(panel).findByRole("region", { name: "Unlinked mentions" });
    await within(mentions).findByRole("button", { name: "Link it in Other" });
    await act(async () => fireEvent.click(within(mentions).getByRole("button", { name: "Link all" })));
    await expect.poll(() => text("library/other.md")).toContain("[[Welcome]] back.\n");
    expect(await text("library/mention.md")).toContain("[[Welcome|welcome]]");
    await expect.poll(toasts).toContain("Linked 2 mentions");
    await expect.poll(() => mentions.textContent).toContain("No page names “Welcome” without linking it.");
  });

  it("lists the whiteboards the note is on, and opens one", async () => {
    const { panel } = await openWithPanel(vault, "library/welcome.md", "details");
    const boards = await within(panel).findByRole("region", { name: "On whiteboards" });
    await expect.poll(() => boards.textContent).toContain("Trip plan");
    expect(boards.textContent).not.toContain("empty");
    fireEvent.click(within(boards).getByRole("button", { name: /Trip plan/ }));
    expect(useWorkspace.getState().place).toEqual({ view: "boards", path: "projects/trip/boards/plan.canvas" });
  });

  it("lists the pages this one links to, and makes a missing one", async () => {
    vault = new MemoryVault({ ...SEED, "library/linked.md": "---\ntitle: Linked\n---\nStart at [[Welcome]], then [[Packing list]].\n" });
    const { panel } = await openWithPanel(vault, "library/linked.md", "details");
    const out = await within(panel).findByRole("region", { name: "Links from this page" });
    expect(out.textContent).toContain("1 to no page");
    expect(within(out).getByRole("button", { name: /Welcome/ })).toBeTruthy();
    await act(async () => fireEvent.click(within(out).getByRole("button", { name: "Create Packing list" })));
    expect((await vault.list()).some((n) => n.title === "Packing list")).toBe(true);
    await expect.poll(() => within(panel).getByRole("region", { name: "Links from this page" }).textContent).not.toContain("to no page");
  });
});
