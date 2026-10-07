import { describe, expect, it } from "vitest";

import type { NoteFile } from "../../../lib/vault/types";
import { MemoryVault } from "./memory-vault";

/** A page with a sub-page, which has one of its own. */
async function tree(vault: MemoryVault): Promise<NoteFile[]> {
  const page = (title: string, parent?: string) => vault.create({ kind: "page", title, date: "2026-09-28", project: null, parent });
  const top = await page("Trip plan");
  const mid = await page("Packing", top.meta.path);
  const low = await page("Shoes", mid.meta.path);
  return [top, mid, low];
}

describe("a page in the preview's trash, as in the core", () => {
  it("goes with its sub-pages, is listed once, and comes back with them", async () => {
    const vault = new MemoryVault({});
    const [top, mid, low] = await tree(vault);
    const trashed = await vault.trash(top!.meta.path);
    const listed = (await vault.list()).map((n) => n.path);
    for (const note of [top!, mid!, low!]) expect(listed).not.toContain(note.meta.path);
    expect((await vault.listTrash()).map((t) => [t.title, t.inside])).toEqual([["Trip plan", 2]]);

    const back = await vault.restore(trashed);
    expect(back.meta.path).toBe(top!.meta.path);
    for (const note of [top!, mid!, low!]) expect((await vault.read(note.meta.path)).text).toBe(note.text);
    expect(await vault.listTrash()).toEqual([]);
  });

  it("keeps a sub-page trashed before its parent apart", async () => {
    const vault = new MemoryVault({});
    const [top, mid, low] = await tree(vault);
    await vault.trash(mid!.meta.path);
    const parent = await vault.trash(top!.meta.path);
    expect((await vault.listTrash()).map((t) => [t.title, t.inside])).toEqual([
      ["Trip plan", 0],
      ["Packing", 1],
    ]);
    await vault.restore(parent);
    const listed = (await vault.list()).map((n) => n.path);
    expect(listed).toContain(top!.meta.path);
    expect(listed).not.toContain(low!.meta.path);
  });
});
