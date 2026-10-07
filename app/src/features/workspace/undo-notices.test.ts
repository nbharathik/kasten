// Every notice for a change to notes offers Undo: rename, duplicate,
// convert and tagging each take their change back.

import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { tagCard } from "../inbox/CardActions";
import { MemoryVault } from "./preview/memory-vault";
import { useWorkspace } from "./store";
import { derive } from "./store-layout";
import { initialLayout } from "./tabs";

let vault: MemoryVault;
const state = () => useWorkspace.getState();
const lastToast = () => state().toasts.at(-1)!;
const titles = () => state().notes.map((n) => n.title);

beforeEach(async () => {
  localStorage.clear();
  vault = new MemoryVault({
    "library/a.md": "---\ntitle: Alpha\n---\nA\n",
    "inbox/idea.md": "---\ntitle: Idea\ntype: card\n---\nAn idea\n",
    "projects/trip/_project.md": "---\ntitle: Trip\ntype: project\n---\nPlans\n",
  });
  useWorkspace.setState({ ...derive(initialLayout()), stack: [], stackOpen: false, recent: [], toasts: [] });
  await state().connect({ client: vault });
});

describe("Undo in notices", () => {
  it("renames back", async () => {
    await act(() => state().rename("library/a.md", "Apex"));
    expect(lastToast().text).toBe("Renamed “Alpha” to “Apex”");
    await act(async () => lastToast().action!.run());
    await expect.poll(titles).toContain("Alpha");
    expect(titles()).not.toContain("Apex");
  });

  it("moves a duplicate to the trash", async () => {
    await act(() => state().duplicate("library/a.md"));
    expect(state().notes.filter((n) => n.title.startsWith("Alpha"))).toHaveLength(2);
    expect(lastToast().action?.label).toBe("Undo");
    await act(async () => lastToast().action!.run());
    await expect.poll(() => state().notes.filter((n) => n.title.startsWith("Alpha")).length).toBe(1);
    expect((await vault.listTrash()).length).toBe(1);
  });

  it("turns a converted card back", async () => {
    await act(() => state().convert("inbox/idea.md", "page"));
    expect(state().notes.find((n) => n.title === "Idea")?.kind).toBe("page");
    await act(async () => lastToast().action!.run());
    await expect.poll(() => state().notes.find((n) => n.title === "Idea")?.kind).toBe("card");
  });

  it("takes a tag off again", async () => {
    await act(() => tagCard("inbox/idea.md", "later"));
    expect(state().notes.find((n) => n.title === "Idea")?.tags).toContain("later");
    await act(async () => lastToast().action!.run());
    await expect.poll(() => state().notes.find((n) => n.title === "Idea")?.tags).not.toContain("later");
  });

  it("puts a capture moved to a project back in the Inbox", async () => {
    await act(() => state().move("inbox/idea.md", "trip"));
    expect(state().notes.find((n) => n.title === "Idea")?.path).toBe("projects/trip/cards/idea.md");
    await act(async () => lastToast().action!.run());
    await expect.poll(() => state().notes.find((n) => n.title === "Idea")?.path).toBe("inbox/idea.md");
  });
});
