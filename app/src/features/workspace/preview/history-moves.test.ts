// The preview's history follows a note as its file moves, says when it was
// renamed, and opening a journal day twice at once makes it once.

import { describe, expect, it } from "vitest";

import { MemoryVault } from "./memory-vault";

const VAULT = {
  "projects/trip/_project.md": "---\ntitle: Trip\ntype: project\n---\n",
};

describe("the preview's history across moves", () => {
  it("keeps a renamed note's history and says it was renamed", async () => {
    const v = new MemoryVault(VAULT);
    const made = await v.create({ kind: "page", title: "Untitled", date: "2026-09-26" });
    const renamed = await v.rename(made.meta.path, "Packing list");
    expect(renamed.note.meta.path).toBe("library/packing-list.md");
    expect((await v.history(renamed.note.meta.path)).map((c) => c.summary)).toEqual(["rename: Untitled → Packing list", "create: Untitled"]);
    expect(await v.history(made.meta.path)).toEqual([]);
  });

  it("names a rename even when the file keeps its name", async () => {
    const v = new MemoryVault(VAULT);
    const renamed = await v.rename("projects/trip/_project.md", "Summer trip");
    expect(renamed.note.meta.path).toBe("projects/trip/_project.md");
    expect((await v.history(renamed.note.meta.path))[0]!.summary).toBe("rename: Trip → Summer trip");
  });

  it("keeps a moved note's history, and its versions can still be read", async () => {
    const v = new MemoryVault(VAULT);
    const made = await v.create({ kind: "page", title: "Route", date: "2026-09-26" });
    const moved = await v.move(made.meta.path, "trip");
    expect(moved.meta.path).toBe("projects/trip/pages/route.md");
    const history = await v.history(moved.meta.path);
    expect(history.map((c) => c.summary)).toEqual(["create: Route"]);
    expect(await v.version(history[0]!.id, moved.meta.path)).toBe(made.text);
  });

  it("makes a journal day once when it is opened twice at once", async () => {
    const v = new MemoryVault({});
    const [a, b] = await Promise.all([v.journal("2026-09-26"), v.journal("2026-09-26")]);
    expect(a.meta.id).toBe(b.meta.id);
    expect((await v.history("journal/2026/2026-09-26.md")).map((c) => c.summary)).toEqual(["create: 2026-09-26"]);
    // And later openings read it.
    expect((await v.journal("2026-09-26")).meta.id).toBe(a.meta.id);
  });
});
