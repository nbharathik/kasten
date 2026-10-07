import { beforeEach, describe, expect, it } from "vitest";

import { useWorkspace } from "../workspace/store";
import { useSources } from "./store";
import { FIRST, PRIMER, sampleVault } from "./test-kit";

beforeEach(() => localStorage.clear());

describe("the sources store", () => {
  it("reads every source and its highlights at once", async () => {
    await sampleVault();
    await useSources.getState().loadAll();
    const { list, highlights } = useSources.getState();
    expect(list!.map((s) => [s.title, s.highlights])).toEqual([["A Zettelkasten primer", 3]]);
    expect(highlights[PRIMER]!.map((h) => h.page)).toEqual([1, 1, 2]);
  });

  it("adds, changes and removes highlights, counting them in the list", async () => {
    await sampleVault();
    await useSources.getState().loadAll();
    const added = await useSources.getState().add(PRIMER, { page: 2, rects: [[72, 500, 300, 512]], text: "Read old notes", color: "blue" });
    expect(useSources.getState().list![0]!.highlights).toBe(4);
    await useSources.getState().edit(PRIMER, added!.id, { comment: "Weekly." });
    expect(useSources.getState().highlights[PRIMER]!.at(-1)!.comment).toBe("Weekly.");
    await useSources.getState().remove(PRIMER, added!.id);
    expect(useSources.getState().highlights[PRIMER]).toHaveLength(3);
    expect(useSources.getState().list![0]!.highlights).toBe(3);
  });

  it("makes a card, which the workspace then knows", async () => {
    await sampleVault();
    await useSources.getState().load(PRIMER);
    const card = await useSources.getState().card(PRIMER, FIRST);
    expect(card!.meta.kind).toBe("highlight");
    expect(useSources.getState().highlights[PRIMER]![0]!.card).toBe(card!.meta.path);
    expect(useWorkspace.getState().notes.some((n) => n.path === card!.meta.path)).toBe(true);
  });

  it("says so when a change is refused", async () => {
    await sampleVault();
    expect(await useSources.getState().add(PRIMER, { page: 0, rects: [], text: "", color: "yellow" })).toBeNull();
    expect(useWorkspace.getState().toasts.at(-1)!.text).toContain("The highlight was not kept");
  });
});
